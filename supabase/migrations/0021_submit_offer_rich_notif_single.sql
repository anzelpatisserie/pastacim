-- 0021: Teklif bildirimini tekilleştir + zengin metin.
--
-- Sorun: baker teklif verince müşteriye İKİ bildirim gidiyordu:
--   1) server-side submit_offer RPC → "📩 Yeni Teklif / Siparişine yeni bir teklif geldi."
--   2) client-side offer/[orderId].tsx → "🎉 Yeni Teklif Aldınız! / {shop} ... ₺{price} teklif verdi."
-- 0018'de submit_offer'a server-side bildirim eklendiğinde client-side'daki
-- kaldırılmayı unutulmuş → çift bildirim.
--
-- Çözüm: client-side bildirim kaldırıldı (ayrı commit). Server-side bildirim
-- eski (daha mantıklı) zengin metne çevrildi: dükkan adı + fiyat.
CREATE OR REPLACE FUNCTION public.submit_offer(p_order_id uuid, p_shop_id uuid, p_price numeric, p_message text DEFAULT NULL::text, p_estimated_days integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_baker_id uuid := auth.uid();
  v_offer_id uuid;
  v_customer_id uuid;
  v_shop_name text;
  v_price_txt text;
BEGIN
  -- 1) Sipariş hâlâ teklif kabul ediyor mu?
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN
    RETURN jsonb_build_object('error', 'siparis_bulunamadi');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = p_order_id AND status IN ('pending', 'offers_received')
  ) THEN
    RETURN jsonb_build_object('error', 'siparis_kabul_edildi');
  END IF;

  -- 2) Aktif teklif (pending veya accepted) zaten var mı? Varsa engelle.
  IF EXISTS (
    SELECT 1 FROM public.offers
    WHERE order_id = p_order_id
      AND baker_id = v_baker_id
      AND status IN ('pending', 'accepted')
  ) THEN
    RETURN jsonb_build_object('error', 'mevcut_teklif');
  END IF;

  -- 3) rejected/withdrawn varsa eskisini pending'e döndür.
  UPDATE public.offers
    SET price = p_price,
        message = p_message,
        estimated_days = p_estimated_days,
        shop_id = p_shop_id,
        status = 'pending',
        updated_at = NOW()
    WHERE order_id = p_order_id
      AND baker_id = v_baker_id
      AND status IN ('rejected', 'withdrawn')
    RETURNING id INTO v_offer_id;

  -- 4) Eski teklif yoksa yenisini ekle
  IF v_offer_id IS NULL THEN
    INSERT INTO public.offers (order_id, baker_id, shop_id, price, message, estimated_days)
    VALUES (p_order_id, v_baker_id, p_shop_id, p_price, p_message, p_estimated_days)
    RETURNING id INTO v_offer_id;
  END IF;

  -- 5) Sipariş durumunu güncelle
  UPDATE public.orders SET status = 'offers_received', updated_at = NOW()
  WHERE id = p_order_id AND status = 'pending';

  -- 6) Müşteriye TEK bildirim (in-app + push) — zengin metin: dükkan adı + fiyat
  SELECT customer_id INTO v_customer_id FROM public.orders WHERE id = p_order_id;
  SELECT name INTO v_shop_name FROM public.pastry_shops WHERE id = p_shop_id;
  -- "500.00" → "500", "500.50" → "500.5" (client parseFloat davranışı)
  v_price_txt := rtrim(rtrim(to_char(p_price, 'FM999999999990.00'), '0'), '.');
  PERFORM app_notify(
    v_customer_id,
    'new_offer',
    '🎉 Yeni Teklif Aldınız!',
    COALESCE(v_shop_name, 'Bir pastacı') || ' siparişinize ₺' || v_price_txt || ' teklif verdi.',
    jsonb_build_object('orderId', p_order_id),
    'customer'
  );

  RETURN jsonb_build_object('offer_id', v_offer_id, 'error', NULL);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'mevcut_teklif');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$function$;

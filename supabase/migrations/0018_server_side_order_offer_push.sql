-- 0018: Teklif/sipariş bildirimlerini server-side push'a taşı
-- Mesaj bildirimleri (notify_new_message) ile aynı desen: notifications INSERT + Expo push.
-- WEB'den tetiklenen aksiyonlarda da cihaza push gitmesi için client-side push kaldırıldı.

-- ── Ortak helper ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_notify(
  p_user_id uuid, p_type text, p_title text, p_body text,
  p_data jsonb DEFAULT '{}'::jsonb, p_target_role text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_token text;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, data, target_role)
  VALUES (p_user_id, p_type, p_title, p_body, p_data, p_target_role);

  SELECT CASE
    WHEN p_target_role = 'customer' THEN COALESCE(customer_push_token, push_token)
    WHEN p_target_role = 'baker'    THEN COALESCE(baker_push_token, push_token)
    ELSE COALESCE(push_token, baker_push_token, customer_push_token)
  END INTO v_token FROM public.users WHERE id = p_user_id;

  IF v_token LIKE 'ExponentPushToken%' THEN
    PERFORM net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object('to', v_token, 'sound','default',
        'title', p_title, 'body', p_body,
        'data', p_data || jsonb_build_object('type', p_type))
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END; $$;

-- ── accept_offer ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_offer(p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_offer   offers%ROWTYPE;
  v_order   orders%ROWTYPE;
  v_rejected RECORD;
BEGIN
  SELECT * INTO v_offer FROM offers WHERE id = p_offer_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'order_id', null, 'error', 'Teklif bulunamadı.');
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = v_offer.order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'order_id', null, 'error', 'Sipariş bulunamadı.');
  END IF;

  IF auth.uid() != v_order.customer_id THEN
    RETURN jsonb_build_object('success', false, 'order_id', null, 'error', 'Yetkisiz işlem.');
  END IF;

  -- Kabul edilen teklif
  UPDATE offers SET status = 'accepted' WHERE id = p_offer_id;

  -- Aynı siparişin diğer bekleyen tekliflerini reddet
  UPDATE offers SET status = 'rejected'
    WHERE order_id = v_offer.order_id AND id != p_offer_id AND status = 'pending';

  -- Sipariş durumu
  UPDATE orders
    SET status = 'accepted',
        selected_offer_id = p_offer_id,
        baker_id = v_offer.baker_id
    WHERE id = v_offer.order_id;

  -- Kabul edilen baker'a bildirim (in-app + push)
  PERFORM app_notify(
    v_offer.baker_id,
    'offer_accepted',
    '✅ Teklifin Kabul Edildi',
    'Müşteri teklifini kabul etti, hazırlığa başlayabilirsin.',
    jsonb_build_object('orderId', v_offer.order_id),
    'baker'
  );

  -- Reddedilen baker'lara bildirim (in-app + push)
  FOR v_rejected IN
    SELECT baker_id FROM offers
    WHERE order_id = v_offer.order_id
      AND id != p_offer_id
      AND status = 'rejected'
  LOOP
    PERFORM app_notify(
      v_rejected.baker_id,
      'offer_rejected',
      '❌ Teklifin Reddedildi',
      'Müşteri başka bir pastacının teklifini kabul etti.',
      jsonb_build_object('orderId', v_offer.order_id),
      'baker'
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'order_id', v_offer.order_id, 'error', null);
END;
$function$;

-- ── submit_offer ────────────────────────────────────────────────────────────
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

  -- 6) Müşteriye bildirim (in-app + push)
  SELECT customer_id INTO v_customer_id FROM public.orders WHERE id = p_order_id;
  PERFORM app_notify(
    v_customer_id,
    'new_offer',
    '📩 Yeni Teklif',
    'Siparişine yeni bir teklif geldi.',
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

-- ── set_order_status (uuid, text) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order    record;
  v_baker_id uuid;
BEGIN
  SELECT id, customer_id, status INTO v_order
  FROM orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sipariş bulunamadı');
  END IF;

  SELECT baker_id INTO v_baker_id
  FROM offers
  WHERE order_id = p_order_id AND status = 'accepted'
  LIMIT 1;

  IF v_baker_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Kabul edilen teklif bulunamadı');
  END IF;

  IF auth.uid() != v_baker_id AND auth.uid() != v_order.customer_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Yetki yok');
  END IF;

  UPDATE orders SET status = p_status::order_status WHERE id = p_order_id;

  IF p_status = 'in_progress' THEN
    PERFORM app_notify(v_order.customer_id, 'order_in_progress', '👨‍🍳 Siparişin Hazırlanıyor', 'Pastacı siparişini hazırlamaya başladı.', jsonb_build_object('orderId', p_order_id), 'customer');
  ELSIF p_status = 'ready' THEN
    PERFORM app_notify(v_order.customer_id, 'order_ready', '📦 Siparişin Hazır', 'Siparişin hazır!', jsonb_build_object('orderId', p_order_id), 'customer');
  ELSIF p_status = 'completed' THEN
    PERFORM app_notify(v_baker_id, 'order_completed', '🎉 Sipariş Tamamlandı', 'Müşteri siparişi tamamlandı olarak işaretledi.', jsonb_build_object('orderId', p_order_id), 'baker');
  END IF;

  RETURN jsonb_build_object('success', true, 'error', null);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- ── set_order_status (uuid, order_status) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id uuid, p_status order_status)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order    orders%ROWTYPE;
  v_baker_id uuid;
  v_rows     int;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sipariş bulunamadı.');
  END IF;

  -- Kabul edilen teklifin sahibi (pastacı)
  SELECT baker_id INTO v_baker_id
  FROM offers
  WHERE id = v_order.selected_offer_id;

  -- Müşteri mi pastacı mı?
  IF auth.uid() = v_order.customer_id THEN
    IF p_status NOT IN ('completed') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Müşteri bu geçişi yapamaz.');
    END IF;
  ELSIF auth.uid() = v_baker_id THEN
    IF NOT (
      (v_order.status = 'accepted'    AND p_status = 'in_progress') OR
      (v_order.status = 'in_progress' AND p_status = 'ready')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Geçersiz durum geçişi.');
    END IF;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Yetkisiz işlem.');
  END IF;

  UPDATE orders SET status = p_status, updated_at = now() WHERE id = p_order_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Güncelleme başarısız (satır etkilenmedi).');
  END IF;

  IF p_status::text = 'in_progress' THEN
    PERFORM app_notify(v_order.customer_id, 'order_in_progress', '👨‍🍳 Siparişin Hazırlanıyor', 'Pastacı siparişini hazırlamaya başladı.', jsonb_build_object('orderId', p_order_id), 'customer');
  ELSIF p_status::text = 'ready' THEN
    PERFORM app_notify(v_order.customer_id, 'order_ready', '📦 Siparişin Hazır', 'Siparişin hazır!', jsonb_build_object('orderId', p_order_id), 'customer');
  ELSIF p_status::text = 'completed' THEN
    PERFORM app_notify(v_baker_id, 'order_completed', '🎉 Sipariş Tamamlandı', 'Müşteri siparişi tamamlandı olarak işaretledi.', jsonb_build_object('orderId', p_order_id), 'baker');
  END IF;

  RETURN jsonb_build_object('success', true, 'error', null);
END;
$function$;

-- ── cancel_order ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_title text;
  v_baker RECORD;
BEGIN
  SET LOCAL row_security = off;
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND customer_id = auth.uid()) THEN
    RETURN json_build_object('error', 'Sipariş bulunamadı');
  END IF;

  SELECT title INTO v_order_title FROM public.orders WHERE id = p_order_id;

  -- Sipariş iptal
  UPDATE public.orders SET status = 'cancelled', updated_at = NOW() WHERE id = p_order_id;

  -- Bu siparişin tüm pending/accepted tekliflerini reject et
  UPDATE public.offers
    SET status = 'rejected', updated_at = NOW()
    WHERE order_id = p_order_id
      AND status IN ('pending', 'accepted');

  -- Etkilenen baker'lara bildirim (in-app + push)
  FOR v_baker IN
    SELECT DISTINCT o.baker_id
    FROM public.offers o
    WHERE o.order_id = p_order_id
      AND o.status = 'rejected'
      AND o.updated_at >= NOW() - INTERVAL '1 second'
  LOOP
    PERFORM app_notify(
      v_baker.baker_id,
      'order_cancelled',
      '⌛ Sipariş İptal Edildi',
      'Müşteri "' || COALESCE(v_order_title, 'siparişini') || '" siparişini iptal etti.',
      jsonb_build_object('orderId', p_order_id),
      'baker'
    );
  END LOOP;

  RETURN json_build_object('success', true, 'error', NULL);
END;
$function$;

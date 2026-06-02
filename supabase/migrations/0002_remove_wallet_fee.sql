-- Remove wallet fee deduction from submit_offer (4-param overload used by the app)
-- The DB tables wallet_transactions, wallet_top_up_requests, users.wallet_balance are preserved.
CREATE OR REPLACE FUNCTION public.submit_offer(
  p_order_id      uuid,
  p_price         numeric,
  p_message       text,
  p_estimated_days integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_baker_id  UUID := auth.uid();
  v_shop_id   UUID;
  v_offer_id  UUID;
BEGIN
  -- Aktif dükkan var mı?
  SELECT id INTO v_shop_id
    FROM public.pastry_shops
    WHERE user_id = v_baker_id AND is_active = true
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'dukkan_bulunamadi');
  END IF;

  -- Daha önce teklif verilmiş mi?
  IF EXISTS (
    SELECT 1 FROM public.offers
    WHERE order_id = p_order_id AND baker_id = v_baker_id
  ) THEN
    RETURN jsonb_build_object('error', 'mevcut_teklif');
  END IF;

  -- Sipariş var mı ve hâlâ teklif kabul ediyor mu?
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN
    RETURN jsonb_build_object('error', 'siparis_bulunamadi');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = p_order_id AND status IN ('pending', 'offers_received')
  ) THEN
    RETURN jsonb_build_object('error', 'siparis_kabul_edildi');
  END IF;

  -- Teklifi kaydet
  INSERT INTO public.offers (order_id, baker_id, shop_id, price, message, estimated_days)
    VALUES (p_order_id, v_baker_id, v_shop_id, p_price, p_message, p_estimated_days)
    RETURNING id INTO v_offer_id;

  -- Sipariş durumunu güncelle (ilk teklif gelince pending → offers_received)
  UPDATE public.orders
    SET status = 'offers_received'
    WHERE id = p_order_id AND status = 'pending';

  RETURN jsonb_build_object('offer_id', v_offer_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'mevcut_teklif');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

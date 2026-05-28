-- ============================================================
--  Migration: dual_role + wallet
--  Çalıştırma: Supabase Dashboard > SQL Editor > New Query
--  Bu migration mevcut şemayı bozmamalı; additive değişiklikler.
-- ============================================================

-- 1. users tablosuna is_customer / is_baker kolonları ekle
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_customer BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_baker    BOOLEAN NOT NULL DEFAULT false;

-- 2. Mevcut kullanıcıların rollerini flag'e dönüştür
UPDATE public.users
  SET is_baker = true WHERE role = 'baker';
UPDATE public.users
  SET is_customer = true;

-- 3. token_balance → wallet_balance (NUMERIC, sadece pastacı kullanır)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00
  CHECK (wallet_balance >= 0);

-- Mevcut token_balance değerini wallet_balance'a kopyala
UPDATE public.users SET wallet_balance = token_balance::NUMERIC WHERE token_balance > 0;

-- 4. wallet_transaction_type enum oluştur
DO $$ BEGIN
  CREATE TYPE wallet_transaction_type AS ENUM ('offer_fee', 'top_up', 'refund');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. wallet_transactions tablosu oluştur
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount       NUMERIC(10,2) NOT NULL,
  type         wallet_transaction_type NOT NULL,
  description  TEXT,
  order_id     UUID        REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_id ON public.wallet_transactions(user_id);

-- wallet_transactions RLS
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet_tx: user kendi hareketlerini görür" ON public.wallet_transactions;
CREATE POLICY "wallet_tx: user kendi hareketlerini görür"
  ON public.wallet_transactions FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "wallet_tx: system insert" ON public.wallet_transactions;
CREATE POLICY "wallet_tx: system insert"
  ON public.wallet_transactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- 6. handle_new_user trigger'ını güncelle (jeton kaldır, is_customer/is_baker ekle)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, is_customer, is_baker, wallet_balance)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    true,
    false,
    0.00
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- 7. submit_offer RPC güncelle (wallet_balance kontrolü, serving_size × ₺5)
CREATE OR REPLACE FUNCTION public.submit_offer(
  p_order_id       UUID,
  p_price          NUMERIC,
  p_message        TEXT,
  p_estimated_days INTEGER
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_baker_id    UUID := auth.uid();
  v_shop        RECORD;
  v_serving     INTEGER;
  v_fee         NUMERIC;
  v_offer_id    UUID;
BEGIN
  SELECT id INTO v_shop FROM public.pastry_shops
    WHERE user_id = v_baker_id AND is_active = true LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'dukkan_bulunamadi');
  END IF;

  SELECT serving_size INTO v_serving FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'siparis_bulunamadi');
  END IF;

  v_fee := COALESCE(v_serving, 1) * 5.0;

  IF (SELECT wallet_balance FROM public.users WHERE id = v_baker_id) < v_fee THEN
    RETURN jsonb_build_object('error', 'yetersiz_bakiye');
  END IF;

  INSERT INTO public.offers (order_id, baker_id, shop_id, price, message, estimated_days)
    VALUES (p_order_id, v_baker_id, v_shop.id, p_price, p_message, p_estimated_days)
    RETURNING id INTO v_offer_id;

  UPDATE public.users SET wallet_balance = wallet_balance - v_fee WHERE id = v_baker_id;

  INSERT INTO public.wallet_transactions (user_id, amount, type, description, order_id)
    VALUES (v_baker_id, -v_fee, 'offer_fee', 'Teklif ücreti', p_order_id);

  UPDATE public.orders SET status = 'offers_received' WHERE id = p_order_id AND status = 'pending';

  RETURN jsonb_build_object('offer_id', v_offer_id);
END;
$$;

-- 8. add_wallet_balance RPC
CREATE OR REPLACE FUNCTION public.add_wallet_balance(
  p_amount NUMERIC
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('error', 'gecersiz_miktar');
  END IF;

  UPDATE public.users SET wallet_balance = wallet_balance + p_amount WHERE id = v_user_id;

  INSERT INTO public.wallet_transactions (user_id, amount, type, description)
    VALUES (v_user_id, p_amount, 'top_up', 'Cüzdan yükleme');

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 9. create_shop RPC — dükkan oluşturunca is_baker = true yap
CREATE OR REPLACE FUNCTION public.create_shop(
  p_name        TEXT,
  p_description TEXT,
  p_address     TEXT,
  p_latitude    DOUBLE PRECISION,
  p_longitude   DOUBLE PRECISION
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_shop_id UUID;
BEGIN
  INSERT INTO public.pastry_shops (user_id, name, description, address, latitude, longitude)
    VALUES (v_user_id, p_name, p_description, p_address, p_latitude, p_longitude)
    RETURNING id INTO v_shop_id;

  UPDATE public.users SET is_baker = true WHERE id = v_user_id;

  RETURN jsonb_build_object('shop_id', v_shop_id);
END;
$$;

-- 10. RLS: role = 'baker' kontrollerini is_baker = true ile değiştir
DROP POLICY IF EXISTS "offers: baker teklif verebilir" ON public.offers;
CREATE POLICY "offers: baker teklif verebilir"
  ON public.offers FOR INSERT
  WITH CHECK (
    baker_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_baker = true)
  );

DROP POLICY IF EXISTS "shops: baker kendi dükkanını yönetir" ON public.pastry_shops;
CREATE POLICY "shops: baker kendi dükkanını yönetir"
  ON public.pastry_shops FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

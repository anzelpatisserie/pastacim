-- ============================================================
--  Migration 0004 — Consolidated (3-5 Haziran 2026)
--
--  Bu dosya, 3-5 Haziran arasında Supabase MCP üzerinden uygulanmış
--  15 ayrı değişikliği tek bir baseline'da toplar. Sıralama, üretim
--  ortamına uygulandıkları gerçek tarihe göredir.
--
--  İçerik:
--   1. Tablo eklemeleri (feedbacks, wallet_top_up_requests)
--   2. Kolon ve constraint güncellemeleri
--   3. Storage bucket + RLS politikaları (user-avatars, feedbacks)
--   4. pg_cron extension + günlük overdue cancel job
--   5. Tüm yeni / değişen RPC'ler
--   6. RLS politikaları (feedbacks admin)
--
--  Idempotent: tüm CREATE/ALTER'lar IF NOT EXISTS veya OR REPLACE
--  kullanır; yeniden çalıştırmak güvenlidir.
-- ============================================================

-- ─── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- ============================================================
--  1. TABLOLAR
-- ============================================================

-- feedbacks — uygulama içi geri bildirim modal'ından gelen kayıtlar
CREATE TABLE IF NOT EXISTS public.feedbacks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message         TEXT NOT NULL,
  screenshot_url  TEXT,
  app_name        TEXT NOT NULL DEFAULT 'unknown',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;

-- wallet_top_up_requests — pastacı cüzdan yükleme talepleri (havale referansı)
CREATE TABLE IF NOT EXISTS public.wallet_top_up_requests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount       NUMERIC NOT NULL CHECK (amount > 0),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at  TIMESTAMPTZ
);
ALTER TABLE public.wallet_top_up_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================
--  2. KOLON VE CONSTRAINT GÜNCELLEMELERİ
-- ============================================================

-- reviews.is_anonymous — Müşteri yorum yazarken ismini gizleme tercihi
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.reviews.is_anonymous IS
  'Müşteri yorum yazarken ismini gizleme tercihi';

-- pastry_shops.user_id UNIQUE — Bir baker'ın yalnızca 1 dükkanı olabilir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pastry_shops_user_id_unique'
  ) THEN
    ALTER TABLE public.pastry_shops
      ADD CONSTRAINT pastry_shops_user_id_unique UNIQUE (user_id);
  END IF;
END $$;

-- ============================================================
--  3. STORAGE BUCKETS + RLS
-- ============================================================

-- user-avatars bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-avatars', 'user-avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "user_avatars_select" ON storage.objects;
CREATE POLICY "user_avatars_select" ON storage.objects
FOR SELECT USING (bucket_id = 'user-avatars');

DROP POLICY IF EXISTS "user_avatars_insert" ON storage.objects;
CREATE POLICY "user_avatars_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'user-avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "user_avatars_update" ON storage.objects;
CREATE POLICY "user_avatars_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'user-avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "user_avatars_delete" ON storage.objects;
CREATE POLICY "user_avatars_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'user-avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- feedbacks bucket — sadece admin SELECT (insert policy zaten önceki migrationda olabilir)
DROP POLICY IF EXISTS "feedbacks_screenshot_admin_read" ON storage.objects;
CREATE POLICY "feedbacks_screenshot_admin_read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'feedbacks'
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.email = 'anzelpatisserie@gmail.com'
  )
);

-- ============================================================
--  4. RLS POLİTİKALARI (Public tablolar)
-- ============================================================

-- feedbacks: admin tüm satırları okur (kullanıcı zaten kendi satırını insert eder)
DROP POLICY IF EXISTS "feedbacks_admin_read" ON public.feedbacks;
CREATE POLICY "feedbacks_admin_read" ON public.feedbacks
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.email = 'anzelpatisserie@gmail.com'
  )
);

-- ============================================================
--  5. RPC'LER (üretim ortamından alınan haliyle)
-- ============================================================

-- ─── submit_offer (yeni 5-param; eski 4-param drop edildi) ───
DROP FUNCTION IF EXISTS public.submit_offer(uuid, numeric, text, integer);

CREATE OR REPLACE FUNCTION public.submit_offer(
  p_order_id uuid,
  p_shop_id uuid,
  p_price numeric,
  p_message text DEFAULT NULL,
  p_estimated_days integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_baker_id uuid := auth.uid();
  v_offer_id uuid;
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

  -- 3) Eski rejected/withdrawn varsa onu pending'e döndür
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

  RETURN jsonb_build_object('offer_id', v_offer_id, 'error', NULL);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'mevcut_teklif');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$function$;

-- ─── accept_offer (reddedilen baker'lara bildirim) ───────────
CREATE OR REPLACE FUNCTION public.accept_offer(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_offer    offers%ROWTYPE;
  v_order    orders%ROWTYPE;
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

  UPDATE offers SET status = 'accepted' WHERE id = p_offer_id;

  UPDATE offers SET status = 'rejected'
    WHERE order_id = v_offer.order_id AND id != p_offer_id AND status = 'pending';

  UPDATE orders
    SET status = 'accepted',
        selected_offer_id = p_offer_id,
        baker_id = v_offer.baker_id
    WHERE id = v_offer.order_id;

  -- Reddedilen baker'lara bildirim
  FOR v_rejected IN
    SELECT baker_id FROM offers
    WHERE order_id = v_offer.order_id
      AND id != p_offer_id
      AND status = 'rejected'
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_rejected.baker_id,
      'offer_rejected',
      '❌ Teklifin Reddedildi',
      'Müşteri başka bir pastacının teklifini kabul etti.',
      jsonb_build_object('orderId', v_offer.order_id)
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'order_id', v_offer.order_id, 'error', null);
END;
$function$;

-- ─── cancel_order (pending+accepted offer'ları rejected'e çevir + bildirim) ─
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_title text;
BEGIN
  SET LOCAL row_security = off;
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND customer_id = auth.uid()) THEN
    RETURN json_build_object('error', 'Sipariş bulunamadı');
  END IF;

  SELECT title INTO v_order_title FROM public.orders WHERE id = p_order_id;

  UPDATE public.orders SET status = 'cancelled', updated_at = NOW() WHERE id = p_order_id;

  UPDATE public.offers
    SET status = 'rejected', updated_at = NOW()
    WHERE order_id = p_order_id
      AND status IN ('pending', 'accepted');

  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT DISTINCT o.baker_id,
         'order_cancelled',
         '⌛ Sipariş İptal Edildi',
         'Müşteri "' || COALESCE(v_order_title, 'siparişini') || '" siparişini iptal etti.',
         jsonb_build_object('orderId', p_order_id)
  FROM public.offers o
  WHERE o.order_id = p_order_id
    AND o.status = 'rejected'
    AND o.updated_at >= NOW() - INTERVAL '1 second';

  RETURN json_build_object('success', true, 'error', NULL);
END;
$function$;

-- ─── create_shop (8 opsiyonel alanlı yeni overload) ──────────
-- Not: eski 5-param overload da production'da hâlâ var ama tüm uygulamalar
-- yeni 13-param versiyonu çağırıyor.
CREATE OR REPLACE FUNCTION public.create_shop(
  p_name text,
  p_description text,
  p_address text,
  p_latitude double precision,
  p_longitude double precision,
  p_working_hours jsonb DEFAULT NULL,
  p_instagram_url text DEFAULT NULL,
  p_facebook_url text DEFAULT NULL,
  p_tiktok_url text DEFAULT NULL,
  p_youtube_url text DEFAULT NULL,
  p_google_maps_url text DEFAULT NULL,
  p_google_rating numeric DEFAULT NULL,
  p_google_review_count integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_shop_id UUID;
BEGIN
  SELECT id INTO v_shop_id FROM public.pastry_shops WHERE user_id = v_user_id LIMIT 1;
  IF v_shop_id IS NOT NULL THEN
    RETURN jsonb_build_object('shop_id', v_shop_id, 'error', 'mevcut_dukkan');
  END IF;

  INSERT INTO public.pastry_shops (
    user_id, name, description, address, latitude, longitude,
    working_hours, instagram_url, facebook_url, tiktok_url, youtube_url,
    google_maps_url, google_rating, google_review_count
  )
  VALUES (
    v_user_id, p_name, p_description, p_address, p_latitude, p_longitude,
    p_working_hours, p_instagram_url, p_facebook_url, p_tiktok_url, p_youtube_url,
    p_google_maps_url, p_google_rating, COALESCE(p_google_review_count, 0)
  )
  RETURNING id INTO v_shop_id;

  UPDATE public.users SET is_baker = true WHERE id = v_user_id;

  RETURN jsonb_build_object('shop_id', v_shop_id, 'error', NULL);
EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_shop_id FROM public.pastry_shops WHERE user_id = v_user_id LIMIT 1;
    RETURN jsonb_build_object('shop_id', v_shop_id, 'error', 'mevcut_dukkan');
END;
$function$;

-- ─── nearby_orders (customer özet alanları + delivery_address) ───
DROP FUNCTION IF EXISTS public.nearby_orders(double precision, double precision, double precision);

CREATE OR REPLACE FUNCTION public.nearby_orders(
  lat double precision,
  lng double precision,
  radius_km double precision
)
RETURNS TABLE (
  id uuid,
  customer_id uuid,
  title text,
  description text,
  photos jsonb,
  serving_size integer,
  delivery_type text,
  delivery_date date,
  delivery_time time without time zone,
  delivery_address text,
  is_urgent boolean,
  status text,
  distance_km numeric,
  created_at timestamptz,
  customer_full_name text,
  customer_avatar_url text,
  customer_total_orders integer,
  customer_completed_orders integer,
  customer_member_days integer
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    o.id, o.customer_id, o.title, o.description, o.photos,
    o.serving_size, o.delivery_type, o.delivery_date, o.delivery_time,
    o.delivery_address,
    COALESCE(o.is_urgent, false) AS is_urgent,
    o.status,
    round((earth_distance(ll_to_earth(lat, lng), ll_to_earth(o.latitude, o.longitude)) / 1000.0)::numeric, 2) AS distance_km,
    o.created_at,
    u.full_name AS customer_full_name,
    u.avatar_url AS customer_avatar_url,
    (SELECT COUNT(*)::integer FROM public.orders WHERE customer_id = u.id) AS customer_total_orders,
    (SELECT COUNT(*)::integer FROM public.orders WHERE customer_id = u.id AND status = 'completed') AS customer_completed_orders,
    EXTRACT(DAY FROM (NOW() - u.created_at))::integer AS customer_member_days
  FROM public.orders o
  LEFT JOIN public.users u ON u.id = o.customer_id
  WHERE
    o.status IN ('pending', 'offers_received')
    AND o.latitude IS NOT NULL
    AND o.longitude IS NOT NULL
    AND earth_distance(ll_to_earth(lat, lng), ll_to_earth(o.latitude, o.longitude)) <= radius_km * 1000
  ORDER BY o.created_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.nearby_orders(double precision, double precision, double precision) TO authenticated;

-- ─── get_order_offer_summary (is_mine eklendi) ────────────────
DROP FUNCTION IF EXISTS public.get_order_offer_summary(uuid);

CREATE OR REPLACE FUNCTION public.get_order_offer_summary(p_order_id uuid)
RETURNS TABLE (
  price numeric,
  shop_rating numeric,
  shop_review_count integer,
  is_mine boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_baker boolean;
BEGIN
  SELECT is_baker INTO v_is_baker FROM public.users WHERE id = v_uid;
  IF NOT COALESCE(v_is_baker, false) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    o.price,
    COALESCE(s.rating, 0)::numeric AS shop_rating,
    COALESCE(s.review_count, 0)::integer AS shop_review_count,
    (o.baker_id = v_uid) AS is_mine
  FROM public.offers o
  LEFT JOIN public.pastry_shops s ON s.id = o.shop_id
  WHERE o.order_id = p_order_id
    AND o.status IN ('pending', 'accepted')
  ORDER BY (o.baker_id = v_uid) DESC,
           COALESCE(s.rating, 0) DESC NULLS LAST,
           COALESCE(s.review_count, 0) DESC,
           o.price ASC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_order_offer_summary(uuid) TO authenticated;

-- ─── get_customer_summary_for_baker ──────────────────────────
CREATE OR REPLACE FUNCTION public.get_customer_summary_for_baker(p_order_id uuid)
RETURNS TABLE (
  full_name text,
  avatar_url text,
  total_orders integer,
  completed_orders integer,
  cancelled_orders integer,
  member_since timestamptz,
  member_days integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_baker boolean;
  v_customer_id uuid;
BEGIN
  SELECT u.is_baker INTO v_is_baker FROM public.users u WHERE u.id = v_uid;
  IF NOT COALESCE(v_is_baker, false) THEN
    RETURN;
  END IF;

  SELECT o.customer_id INTO v_customer_id
    FROM public.orders o
    WHERE o.id = p_order_id;
  IF v_customer_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.full_name,
    u.avatar_url,
    (SELECT COUNT(*)::integer FROM public.orders WHERE customer_id = u.id) AS total_orders,
    (SELECT COUNT(*)::integer FROM public.orders WHERE customer_id = u.id AND status = 'completed') AS completed_orders,
    (SELECT COUNT(*)::integer FROM public.orders WHERE customer_id = u.id AND status = 'cancelled') AS cancelled_orders,
    u.created_at AS member_since,
    EXTRACT(DAY FROM (NOW() - u.created_at))::integer AS member_days
  FROM public.users u
  WHERE u.id = v_customer_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_customer_summary_for_baker(uuid) TO authenticated;

-- ─── auto_cancel_overdue_orders (pg_cron job target) ──────────
CREATE OR REPLACE FUNCTION public.auto_cancel_overdue_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  WITH cancelled AS (
    UPDATE public.orders
    SET status = 'cancelled', updated_at = NOW()
    WHERE status IN ('pending', 'offers_received')
      AND delivery_date IS NOT NULL
      AND delivery_date < (CURRENT_DATE - INTERVAL '2 days')
    RETURNING id, customer_id, title
  )
  SELECT COUNT(*) INTO v_count FROM cancelled;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT customer_id, 'order_cancelled',
         '⌛ Sipariş Otomatik İptal',
         'Teslim tarihi 2 gün geçtiği için "' || title || '" siparişi iptal edildi.',
         jsonb_build_object('orderId', id)
  FROM public.orders
  WHERE status = 'cancelled'
    AND updated_at >= NOW() - INTERVAL '1 minute'
    AND delivery_date < (CURRENT_DATE - INTERVAL '2 days');

  UPDATE public.offers
  SET status = 'rejected', updated_at = NOW()
  WHERE status = 'pending'
    AND order_id IN (
      SELECT id FROM public.orders
      WHERE status = 'cancelled'
        AND updated_at >= NOW() - INTERVAL '1 minute'
    );

  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.auto_cancel_overdue_orders() TO authenticated, service_role;

-- ============================================================
--  6. CRON SCHEDULE
-- ============================================================

-- Eski schedule varsa kaldır, yeniden ekle (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('auto_cancel_overdue_orders_daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Her 6 saatte bir çalış
SELECT cron.schedule(
  'auto_cancel_overdue_orders_daily',
  '0 */6 * * *',
  $$SELECT public.auto_cancel_overdue_orders();$$
);

-- ============================================================
--  NOTLAR
-- ============================================================
-- 1. Supabase Auth Settings (Management API üzerinden):
--      - mailer_autoconfirm: false  → e-posta doğrulama zorunlu
--      - uri_allow_list: pastacim://**, pastacim-pro://**
--    Bunlar Dashboard veya Management API ile değiştirilir, SQL ile değil.
--
-- 2. Bu dosya idempotent — yeniden çalıştırmak zarar vermez.
--
-- 3. Sonraki değişiklikler için her yeni RPC/tablo/policy ayrı
--    `0005_*.sql` migration dosyası olarak yazılmalı; Dashboard'dan
--    veya MCP'den direkt uygulamak yerine repo'ya commit edilmeli.

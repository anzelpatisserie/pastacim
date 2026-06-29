-- 0016_get_reports_image_url.sql
-- Bug fix: Admin şikayet panelinde şikayete eklenen resim görünmüyordu.
-- Kök neden: get_reports() RETURNS TABLE listesinde image_url kolonu eksikti;
-- reports.image_url DB'de doludur ama admin RPC'si geri döndürmüyordu.
-- Çözüm: image_url'i dönüş tipine ekle (DROP + CREATE; dönüş tipi değiştiği için DROP şart).
-- Not: Admin panel UI signed URL üretir (feedbacks bucket private) — AdminReportsScreen.tsx'te.

DROP FUNCTION IF EXISTS public.get_reports();

CREATE OR REPLACE FUNCTION public.get_reports()
 RETURNS TABLE(id uuid, created_at timestamp with time zone, reason text, details text, image_url text, target_type text, target_id text, app_name text, status text, reporter_id uuid, reporter_name text, reporter_email text, reported_user_id uuid, reported_user_name text, reported_user_email text, reported_banned boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT r.*,
      CASE
        WHEN r.target_type IN ('user','message') AND r.target_id ~ '^[0-9a-fA-F-]{36}$' THEN r.target_id::uuid
        WHEN r.target_type = 'shop' AND r.target_id ~ '^[0-9a-fA-F-]{36}$'
          THEN (SELECT ps.user_id FROM public.pastry_shops ps WHERE ps.id = r.target_id::uuid)
        ELSE NULL
      END AS ruid
    FROM public.reports r
  )
  SELECT b.id, b.created_at, b.reason, b.details, b.image_url, b.target_type, b.target_id, b.app_name, b.status,
    b.reporter_id, rep.full_name, rep.email,
    b.ruid, ru.full_name, ru.email,
    (au.banned_until IS NOT NULL AND au.banned_until > now()) AS reported_banned
  FROM base b
  LEFT JOIN public.users rep ON rep.id = b.reporter_id
  LEFT JOIN public.users ru  ON ru.id  = b.ruid
  LEFT JOIN auth.users au    ON au.id  = b.ruid
  WHERE public.is_admin()
  ORDER BY b.created_at DESC;
$function$;

-- ============================================================================
-- 0008: Şikayet (reports) admin görüntüleme + kanıt + kullanıcı engelleme
-- Applied via Supabase MCP apply_migration on 2026-06-24.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_reports()
RETURNS TABLE(
  id uuid, created_at timestamptz, reason text, details text,
  target_type text, target_id text, app_name text, status text,
  reporter_id uuid, reporter_name text, reporter_email text,
  reported_user_id uuid, reported_user_name text, reported_user_email text,
  reported_banned boolean
)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
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
  SELECT b.id, b.created_at, b.reason, b.details, b.target_type, b.target_id, b.app_name, b.status,
    b.reporter_id, rep.full_name, rep.email,
    b.ruid, ru.full_name, ru.email,
    (au.banned_until IS NOT NULL AND au.banned_until > now()) AS reported_banned
  FROM base b
  LEFT JOIN public.users rep ON rep.id = b.reporter_id
  LEFT JOIN public.users ru  ON ru.id  = b.ruid
  LEFT JOIN auth.users au    ON au.id  = b.ruid
  WHERE public.is_admin()
  ORDER BY b.created_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.get_reports() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_reports() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_report_messages(p_user_a uuid, p_user_b uuid)
RETURNS TABLE(id uuid, sender_id uuid, content text, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
  SELECT m.id, m.sender_id, m.content, m.created_at
  FROM public.messages m
  WHERE public.is_admin()
    AND ((m.sender_id = p_user_a AND m.receiver_id = p_user_b)
      OR (m.sender_id = p_user_b AND m.receiver_id = p_user_a))
  ORDER BY m.created_at ASC
  LIMIT 200;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_get_report_messages(uuid,uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_get_report_messages(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_ban_user(p_user_id uuid, p_ban boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error','yetkisiz'); END IF;
  IF p_user_id = auth.uid() THEN RETURN jsonb_build_object('error','Kendini engelleyemezsin'); END IF;
  UPDATE auth.users
     SET banned_until = CASE WHEN p_ban THEN (now() + interval '100 years') ELSE NULL END
   WHERE id = p_user_id;
  RETURN jsonb_build_object('error', NULL);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_ban_user(uuid,boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_ban_user(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_report_status(p_id uuid, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error','yetkisiz'); END IF;
  UPDATE public.reports SET status = p_status WHERE id = p_id;
  RETURN jsonb_build_object('error', NULL);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_report_status(uuid,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_set_report_status(uuid,text) TO authenticated;

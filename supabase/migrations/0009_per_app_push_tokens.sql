-- 0009: app-başına push token (dual-rol kullanıcı doğru app'te push alsın)
-- Applied via Supabase MCP apply_migration on 2026-06-25.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS customer_push_token text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS baker_push_token text;

-- register_push_token(p_token, p_app) — eski tek-argümanlı sürüm PROD build'leri için KORUNUR.
CREATE OR REPLACE FUNCTION public.register_push_token(p_token text, p_app text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_app = 'baker' THEN
    UPDATE public.users SET baker_push_token = NULL WHERE baker_push_token = p_token AND id != auth.uid();
    UPDATE public.users SET baker_push_token = p_token WHERE id = auth.uid();
  ELSE
    UPDATE public.users SET customer_push_token = NULL WHERE customer_push_token = p_token AND id != auth.uid();
    UPDATE public.users SET customer_push_token = p_token WHERE id = auth.uid();
  END IF;
  UPDATE public.users SET push_token = p_token WHERE id = auth.uid();
END; $$;
REVOKE EXECUTE ON FUNCTION public.register_push_token(text,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.register_push_token(text,text) TO authenticated;

-- admin_broadcast hedef app'in token'ını kullanır (COALESCE legacy push_token). (gövde 0009 ile güncellendi)

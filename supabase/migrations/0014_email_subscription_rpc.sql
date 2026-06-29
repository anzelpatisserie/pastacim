-- 0014: public RPC — abonelikten çık / tekrar abone. Cloudflare worker'dan
-- çağrılır (pastacim.ipekciapp.com/unsubscribe), çünkü Supabase edge function'lar
-- HTML yanıtı sandbox'layıp text/plain'e çeviriyor (sayfa raw görünüyordu).
-- Applied via MCP apply_migration 2026-06-29.
CREATE OR REPLACE FUNCTION public.set_email_subscription(
  p_user_id uuid, p_token text, p_resubscribe boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.users
     SET email_opt_out = NOT p_resubscribe
   WHERE id = p_user_id AND email_unsub_token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE EXECUTE ON FUNCTION public.set_email_subscription(uuid,text,boolean) FROM public;
GRANT  EXECUTE ON FUNCTION public.set_email_subscription(uuid,text,boolean) TO anon, authenticated;

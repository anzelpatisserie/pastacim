-- ============================================================================
-- 0006: e-posta opt-out + unsubscribe token + düzenlenebilir şablonlar + toplu mail
-- Applied via Supabase MCP apply_migration on 2026-06-24.
-- ============================================================================

-- 1) users: pazarlama maili opt-out + kalıcı unsubscribe token
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_opt_out boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_unsub_token uuid NOT NULL DEFAULT gen_random_uuid();

-- 2) Düzenlenebilir e-posta şablonları (transactional). body, {{title}}/{{name}} yer tutucu.
CREATE TABLE IF NOT EXISTS public.email_templates (
  key         text PRIMARY KEY,
  subject     text NOT NULL,
  body        text NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

INSERT INTO public.email_templates (key,subject,body,description) VALUES
 ('welcome',         'Pastacım''a Hoş Geldin! 🎉', '<p>Aramıza katıldığın için mutluyuz. Hayalindeki pastayı tarif et, yakındaki ustalardan teklif al!</p>', 'Kayıt sonrası hoş geldin'),
 ('order_ready',     'Siparişin Teslimata Hazır! 📦', '<p><b>"{{title}}"</b> siparişin pastacı tarafından hazırlandı ve teslim almaya hazır.</p>', 'Sipariş hazır (müşteriye)'),
 ('offer_accepted',  'Teklifin Kabul Edildi! ✅', '<p><b>"{{title}}"</b> siparişi için verdiğin teklif müşteri tarafından kabul edildi. Hadi hazırlamaya başla!</p>', 'Teklif kabul (pastacıya)'),
 ('review_encourage','Siparişin Nasıldı? ⭐', '<p><b>"{{title}}"</b> siparişin tamamlandı. Pastacıya bir yorum bırakarak diğer müşterilere yardımcı olur musun?</p>', 'Yorum teşviki (müşteriye)')
ON CONFLICT (key) DO NOTHING;

-- 3) Toplu mail kampanya tarihçesi
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_target  text NOT NULL,
  subject     text NOT NULL,
  body        text NOT NULL,
  sent_count  int  NOT NULL DEFAULT 0,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

-- 4) RPC'ler (admin-gated; tablo erişimi yalnız RPC + service role üzerinden)
CREATE OR REPLACE FUNCTION public.get_email_templates()
RETURNS SETOF public.email_templates LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
  SELECT * FROM public.email_templates WHERE public.is_admin() ORDER BY key;
$$;
REVOKE EXECUTE ON FUNCTION public.get_email_templates() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_email_templates() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_email_template(p_key text, p_subject text, p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error','yetkisiz'); END IF;
  UPDATE public.email_templates SET subject=p_subject, body=p_body, updated_at=now() WHERE key=p_key;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','sablon_bulunamadi'); END IF;
  RETURN jsonb_build_object('error',NULL);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_update_email_template(text,text,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_update_email_template(text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_email_campaigns()
RETURNS SETOF public.email_campaigns LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
  SELECT * FROM public.email_campaigns WHERE public.is_admin() ORDER BY created_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.get_email_campaigns() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_email_campaigns() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_email_subscribers(p_app text)
RETURNS TABLE(id uuid, full_name text, email text, email_opt_out boolean, is_customer boolean, is_baker boolean)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
  SELECT u.id, u.full_name, u.email, u.email_opt_out, u.is_customer, u.is_baker
  FROM public.users u
  WHERE public.is_admin()
    AND u.email IS NOT NULL
    AND ((p_app='customer' AND u.is_customer) OR (p_app='baker' AND u.is_baker))
  ORDER BY u.email_opt_out ASC, u.full_name ASC;
$$;
REVOKE EXECUTE ON FUNCTION public.get_email_subscribers(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_email_subscribers(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_email_opt_out(p_user_id uuid, p_opt_out boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error','yetkisiz'); END IF;
  UPDATE public.users SET email_opt_out=p_opt_out WHERE id=p_user_id;
  RETURN jsonb_build_object('error',NULL);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_email_opt_out(uuid,boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_set_email_opt_out(uuid,boolean) TO authenticated;

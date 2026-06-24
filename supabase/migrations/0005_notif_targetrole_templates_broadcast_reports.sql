-- ============================================================================
-- 0005: notification target_role + editable templates + admin broadcast + reports
-- Applied via Supabase MCP apply_migration on 2026-06-23.
-- ============================================================================

-- 1) notifications.target_role  (NULL = her iki app; 'customer' / 'baker' = tek app)
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS target_role text;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_target_role_chk;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_target_role_chk
  CHECK (target_role IS NULL OR target_role IN ('customer','baker'));

-- 2) create_notification — p_target_role parametresi eklendi (geriye dönük uyumlu)
DROP FUNCTION IF EXISTS public.create_notification(uuid,text,text,text,jsonb);
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid, p_type text, p_title text,
  p_body text DEFAULT NULL, p_data jsonb DEFAULT '{}'::jsonb,
  p_target_role text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, data, target_role)
  VALUES (p_user_id, p_type, p_title, p_body, p_data, p_target_role)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid,text,text,text,jsonb,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid,text,text,text,jsonb,text) TO authenticated;

-- 3) Düzenlenebilir bildirim şablonları (#14)
CREATE TABLE IF NOT EXISTS public.notification_templates (
  key         text PRIMARY KEY,
  title       text NOT NULL,
  body        text NOT NULL,
  target_role text,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
-- Doğrudan tablo erişimi yok; her şey SECURITY DEFINER RPC üzerinden.

INSERT INTO public.notification_templates (key,title,body,target_role,description) VALUES
 ('new_offer',        '🎉 Yeni Teklif Aldınız!',       '{{shop}} siparişinize ₺{{price}} teklif verdi.', 'customer', 'Müşteriye: yeni teklif geldi'),
 ('offer_accepted',   '✅ Teklifiniz Kabul Edildi!',    '{{title}} için teklifiniz kabul edildi.',         'baker',    'Pastacıya: teklif kabul edildi'),
 ('offer_rejected',   '❌ Teklifiniz Reddedildi',       '{{title}} için teklifiniz reddedildi.',           'baker',    'Pastacıya: teklif reddedildi'),
 ('order_in_progress','🍳 Siparişin Hazırlanıyor!',     '"{{title}}" siparişin hazırlanmaya başlandı.',    'customer', 'Müşteriye: hazırlanıyor'),
 ('order_ready',      '📦 Siparişin Teslimata Hazır!',  '"{{title}}" siparişin teslim almaya hazır.',      'customer', 'Müşteriye: hazır'),
 ('order_delivered',  '🎂 Siparişin Teslim Edildi',     '"{{title}}" siparişin teslim edildi olarak işaretlendi. Teslim almadıysan sipariş kartından geri alabilirsin.', 'customer', 'Müşteriye: teslim edildi')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_notification_templates()
RETURNS SETOF public.notification_templates
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
  SELECT * FROM public.notification_templates ORDER BY key;
$$;
REVOKE EXECUTE ON FUNCTION public.get_notification_templates() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_notification_templates() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_notification_template(
  p_key text, p_title text, p_body text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND email='anzelpatisserie@gmail.com') THEN
    RETURN jsonb_build_object('error','yetkisiz');
  END IF;
  UPDATE public.notification_templates
     SET title=p_title, body=p_body, updated_at=now()
   WHERE key=p_key;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','sablon_bulunamadi');
  END IF;
  RETURN jsonb_build_object('error',NULL);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_update_notification_template(text,text,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_update_notification_template(text,text,text) TO authenticated;

-- 4) Admin yayını + tarihçe (#6)
CREATE TABLE IF NOT EXISTS public.notification_campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_target  text NOT NULL,                 -- 'customer' | 'baker'
  title       text NOT NULL,
  body        text NOT NULL,
  notif_type  text NOT NULL DEFAULT 'campaign',
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_count  int  NOT NULL DEFAULT 0,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.admin_broadcast(
  p_app text, p_title text, p_body text,
  p_type text DEFAULT 'campaign', p_data jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_campaign_id uuid;
  v_tokens text[];
  v_count int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND email='anzelpatisserie@gmail.com') THEN
    RETURN jsonb_build_object('error','yetkisiz');
  END IF;
  IF p_app NOT IN ('customer','baker') THEN
    RETURN jsonb_build_object('error','gecersiz_app');
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data, target_role)
  SELECT u.id, p_type, p_title, p_body, p_data, p_app
  FROM public.users u
  WHERE (p_app='customer' AND u.is_customer) OR (p_app='baker' AND u.is_baker);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  SELECT array_agg(u.push_token) INTO v_tokens
  FROM public.users u
  WHERE ((p_app='customer' AND u.is_customer) OR (p_app='baker' AND u.is_baker))
    AND u.push_token IS NOT NULL AND u.push_token LIKE 'ExponentPushToken%';

  INSERT INTO public.notification_campaigns (app_target,title,body,notif_type,data,sent_count,created_by)
  VALUES (p_app,p_title,p_body,p_type,p_data,v_count,auth.uid())
  RETURNING id INTO v_campaign_id;

  RETURN jsonb_build_object(
    'campaign_id', v_campaign_id,
    'sent_count',  v_count,
    'tokens',      COALESCE(to_jsonb(v_tokens), '[]'::jsonb),
    'error',       NULL
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_broadcast(text,text,text,text,jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_broadcast(text,text,text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_notification_campaigns()
RETURNS SETOF public.notification_campaigns
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
  SELECT * FROM public.notification_campaigns
  WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.email='anzelpatisserie@gmail.com')
  ORDER BY created_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.get_notification_campaigns() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_notification_campaigns() TO authenticated;

-- 5) Şikayet/Report sistemi (#10)
CREATE TABLE IF NOT EXISTS public.reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('order','user','shop','message')),
  target_id   text,
  reason      text NOT NULL,
  details     text,
  app_name    text NOT NULL DEFAULT 'unknown',
  status      text NOT NULL DEFAULT 'open',
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reports_insert_own ON public.reports;
CREATE POLICY reports_insert_own ON public.reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS reports_admin_read ON public.reports;
CREATE POLICY reports_admin_read ON public.reports FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.email='anzelpatisserie@gmail.com'));

CREATE INDEX IF NOT EXISTS idx_reports_created_at ON public.reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_target ON public.notifications (user_id, target_role);

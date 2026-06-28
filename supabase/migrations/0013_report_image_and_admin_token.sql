-- 0013: şikayete resim eki (reports.image_url) + file_report'a p_image_url +
-- admin push'unu TAZE token'a gönder (baker app kullanıyor; legacy stale olabilir).
-- Applied via MCP apply_migration 2026-06-29.
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS image_url text;

DROP FUNCTION IF EXISTS public.file_report(text,text,text,text,text);
CREATE OR REPLACE FUNCTION public.file_report(
  p_target_type text, p_target_id text, p_reason text, p_details text,
  p_app_name text, p_image_url text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_report_id uuid;
  v_admin_id uuid;
  v_admin_token text;
BEGIN
  INSERT INTO public.reports (reporter_id, target_type, target_id, reason, details, app_name, image_url)
  VALUES (auth.uid(), p_target_type, p_target_id, p_reason, p_details, p_app_name, p_image_url)
  RETURNING id INTO v_report_id;

  SELECT id, COALESCE(baker_push_token, customer_push_token, push_token)
    INTO v_admin_id, v_admin_token
  FROM public.users WHERE email = 'anzelpatisserie@gmail.com' LIMIT 1;

  IF v_admin_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, data, target_role)
    VALUES (v_admin_id, 'report', '🚩 Yeni Şikayet',
            'Bir kullanıcı şikayet gönderdi: ' || p_reason,
            jsonb_build_object('reportId', v_report_id, 'targetType', p_target_type), NULL);

    IF v_admin_token LIKE 'ExponentPushToken%' THEN
      PERFORM net.http_post(
        url     := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object('Content-Type','application/json'),
        body    := jsonb_build_object(
          'to', v_admin_token, 'sound','default',
          'title','🚩 Yeni Şikayet',
          'body','Bir kullanıcı şikayet gönderdi: ' || p_reason,
          'data', jsonb_build_object('type','report','reportId',v_report_id)
        )
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('report_id', v_report_id, 'error', NULL);
END; $$;
REVOKE EXECUTE ON FUNCTION public.file_report(text,text,text,text,text,text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.file_report(text,text,text,text,text,text) TO authenticated;

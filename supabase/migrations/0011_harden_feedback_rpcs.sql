-- ============================================================================
-- 0011: 0010 RPC güvenlik sertleştirmesi. Applied via MCP apply_migration 2026-06-28.
--   * notify_new_message: yetki (sender=auth.uid) + konuşma kontrolü +
--     push SUNUCU tarafında (pg_net) → token client'a hiç gitmez. p_push eklendi.
--   * file_report: admin push token'ı DÖNDÜRÜLMEZ; push sunucuda (pg_net).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── notify_new_message: yetkili + konuşma-doğrulamalı + sunucu-push ──────────
DROP FUNCTION IF EXISTS public.notify_new_message(uuid,uuid,text,text);
CREATE OR REPLACE FUNCTION public.notify_new_message(
  p_receiver_id uuid, p_sender_id uuid, p_target_role text, p_preview text,
  p_push boolean DEFAULT true
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_existing_id uuid;
  v_count int;
  v_recv_token text;
BEGIN
  -- yetki: çağıran yalnızca KENDİ adına mesaj bildirimi üretebilir
  IF auth.uid() IS DISTINCT FROM p_sender_id THEN
    RAISE EXCEPTION 'unauthorized: sender mismatch';
  END IF;
  -- yalnızca gerçekten mesajlaştığın kişiye bildirim (yabancıya spam engeli)
  IF NOT EXISTS (
    SELECT 1 FROM public.messages
    WHERE sender_id = p_sender_id AND receiver_id = p_receiver_id
  ) THEN
    RAISE EXCEPTION 'unauthorized: no conversation';
  END IF;

  -- in-app dedup
  SELECT id, COALESCE((data->>'count')::int, 1)
    INTO v_existing_id, v_count
  FROM public.notifications
  WHERE user_id = p_receiver_id AND type = 'new_message' AND is_read = false
    AND (data->>'senderId') = p_sender_id::text
  ORDER BY created_at DESC LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.notifications
       SET body = CASE WHEN v_count + 1 > 1 THEN (v_count + 1) || ' yeni mesaj' ELSE p_preview END,
           data = jsonb_build_object('senderId', p_sender_id::text, 'count', v_count + 1),
           created_at = now(), is_read = false
     WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.notifications (user_id, type, title, body, data, target_role)
    VALUES (p_receiver_id, 'new_message', '💬 Yeni Mesaj', p_preview,
            jsonb_build_object('senderId', p_sender_id::text, 'count', 1), p_target_role);
  END IF;

  -- alıcıya push: token SUNUCUDA kalır (client'a hiç gitmez)
  IF p_push THEN
    SELECT CASE
             WHEN p_target_role = 'customer' THEN COALESCE(customer_push_token, push_token)
             WHEN p_target_role = 'baker'    THEN COALESCE(baker_push_token, push_token)
             ELSE push_token
           END
      INTO v_recv_token
    FROM public.users WHERE id = p_receiver_id;

    IF v_recv_token LIKE 'ExponentPushToken%' THEN
      PERFORM net.http_post(
        url     := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object('Content-Type','application/json'),
        body    := jsonb_build_object(
          'to', v_recv_token, 'sound','default',
          'title','💬 Yeni Mesaj', 'body', p_preview,
          'data', jsonb_build_object('type','new_message','senderId',p_sender_id::text)
        )
      );
    END IF;
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_new_message(uuid,uuid,text,text,boolean) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.notify_new_message(uuid,uuid,text,text,boolean) TO authenticated;

-- ── file_report: token döndürmez; admin push sunucuda ───────────────────────
CREATE OR REPLACE FUNCTION public.file_report(
  p_target_type text, p_target_id text, p_reason text, p_details text, p_app_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_report_id uuid;
  v_admin_id uuid;
  v_admin_token text;
BEGIN
  INSERT INTO public.reports (reporter_id, target_type, target_id, reason, details, app_name)
  VALUES (auth.uid(), p_target_type, p_target_id, p_reason, p_details, p_app_name)
  RETURNING id INTO v_report_id;

  SELECT id, push_token INTO v_admin_id, v_admin_token
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

  -- admin token client'a DÖNMEZ
  RETURN jsonb_build_object('report_id', v_report_id, 'error', NULL);
END; $$;
REVOKE EXECUTE ON FUNCTION public.file_report(text,text,text,text,text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.file_report(text,text,text,text,text) TO authenticated;

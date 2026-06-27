-- ============================================================================
-- 0006: test feedback batch — eksik bildirim şablonları + mesaj dedup +
--       admin report bildirimi. Applied via MCP apply_migration 2026-06-27.
-- ============================================================================

-- 1) Eksik bildirim şablonları (Item 8)
INSERT INTO public.notification_templates (key,title,body,target_role,description) VALUES
 ('new_order',       '🧁 Yeni Sipariş Talebi',        'Yakınında yeni bir sipariş talebi var: {{title}}',           'baker',    'Pastacıya: yakında yeni talep'),
 ('review_request',  '⭐ Siparişini Puanla',           '"{{title}}" siparişin tamamlandı. Pastacını puanlamak ister misin?', 'customer', 'Müşteriye: yorum daveti'),
 ('order_cancelled', '⌛ Sipariş İptal Edildi',        '"{{title}}" siparişi iptal edildi.',                          'baker',    'Pastacıya: sipariş iptal'),
 ('offer_withdrawn', '↩️ Teklif Geri Çekildi',         '{{shop}} "{{title}}" için teklifini geri çekti.',             'customer', 'Müşteriye: teklif geri çekildi'),
 ('order_completed', '🎂 Sipariş Tamamlandı',          '"{{title}}" siparişi müşteri tarafından teslim alındı.',      'baker',    'Pastacıya: müşteri teslim aldı'),
 ('order_reverted',  '↩️ Teslimat Geri Alındı',        'Müşteri "{{title}}" siparişini henüz teslim almadığını belirtti.', 'baker', 'Pastacıya: teslimat geri alındı'),
 ('new_message',     '💬 Yeni Mesaj',                  '{{preview}}',                                                 NULL,       'Yeni mesaj bildirimi')
ON CONFLICT (key) DO NOTHING;

-- 2) Mesaj dedup'lu in-app bildirim (Item 6) — push YOK, sadece feed kaydı.
--    Aynı gönderici için okunmamış new_message varsa onu günceller ("N yeni mesaj").
CREATE OR REPLACE FUNCTION public.notify_new_message(
  p_receiver_id uuid, p_sender_id uuid, p_target_role text, p_preview text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_existing_id uuid;
  v_count int;
BEGIN
  SELECT id, COALESCE((data->>'count')::int, 1)
    INTO v_existing_id, v_count
  FROM public.notifications
  WHERE user_id = p_receiver_id
    AND type = 'new_message'
    AND is_read = false
    AND (data->>'senderId') = p_sender_id::text
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.notifications
       SET body = CASE WHEN v_count + 1 > 1 THEN (v_count + 1) || ' yeni mesaj' ELSE p_preview END,
           data = jsonb_build_object('senderId', p_sender_id::text, 'count', v_count + 1),
           created_at = now(),
           is_read = false
     WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.notifications (user_id, type, title, body, data, target_role)
    VALUES (p_receiver_id, 'new_message', '💬 Yeni Mesaj', p_preview,
            jsonb_build_object('senderId', p_sender_id::text, 'count', 1),
            p_target_role);
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_new_message(uuid,uuid,text,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.notify_new_message(uuid,uuid,text,text) TO authenticated;

-- 3) Admin report bildirimi (Item 7) — report insert + admin'e in-app bildirim.
--    Admin push token client'ta atılır (dönen token ile).
CREATE OR REPLACE FUNCTION public.file_report(
  p_target_type text, p_target_id text, p_reason text,
  p_details text, p_app_name text
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
    VALUES (v_admin_id, 'report',
            '🚩 Yeni Şikayet',
            'Bir kullanıcı şikayet gönderdi: ' || p_reason,
            jsonb_build_object('reportId', v_report_id, 'targetType', p_target_type),
            NULL);
  END IF;

  RETURN jsonb_build_object(
    'report_id', v_report_id,
    'admin_token', v_admin_token,
    'error', NULL
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.file_report(text,text,text,text,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.file_report(text,text,text,text,text) TO authenticated;

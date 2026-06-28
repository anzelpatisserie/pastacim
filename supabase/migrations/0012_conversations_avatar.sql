-- 0012: get_conversations'a other_user_avatar ekle (mesaj listesinde profil
-- fotoğrafı). Applied via MCP apply_migration 2026-06-28. Return signature
-- değiştiği için DROP + CREATE.
DROP FUNCTION IF EXISTS public.get_conversations();
CREATE OR REPLACE FUNCTION public.get_conversations()
 RETURNS TABLE(other_user_id uuid, other_user_name text, other_user_avatar text, last_message text, last_message_at timestamp with time zone, unread_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH pairs AS (
    SELECT
      CASE WHEN sender_id = auth.uid() THEN receiver_id ELSE sender_id END AS other_id,
      content,
      created_at,
      CASE WHEN receiver_id = auth.uid() AND is_read = FALSE THEN 1 ELSE 0 END AS is_unread
    FROM messages
    WHERE (sender_id = auth.uid() OR receiver_id = auth.uid())
      AND NOT (auth.uid() = ANY(COALESCE(deleted_for, ARRAY[]::UUID[])))
  ),
  grouped AS (
    SELECT
      other_id,
      (array_agg(content ORDER BY created_at DESC))[1] AS last_msg,
      MAX(created_at) AS last_at,
      SUM(is_unread)::BIGINT AS unread_cnt
    FROM pairs
    GROUP BY other_id
  )
  SELECT
    g.other_id      AS other_user_id,
    u.full_name     AS other_user_name,
    u.avatar_url    AS other_user_avatar,
    g.last_msg      AS last_message,
    g.last_at       AS last_message_at,
    g.unread_cnt    AS unread_count
  FROM grouped g
  JOIN users u ON u.id = g.other_id
  ORDER BY g.last_at DESC NULLS LAST;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_conversations() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_conversations() TO authenticated;

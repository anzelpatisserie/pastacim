import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@pastacim/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

/**
 * Kullanıcının toplam okunmamış mesaj sayısını döner.
 * Realtime aboneliği ile otomatik güncellenir.
 */
export function useUnreadMessages(userId?: string) {
  const [unreadMessages, setUnreadMessages] = useState(0);

  const fetchUnread = useCallback(async (uid: string) => {
    const { count } = await _db
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', uid)
      .eq('is_read', false);
    setUnreadMessages(count ?? 0);
  }, []);

  useEffect(() => {
    if (!userId) return;

    fetchUnread(userId);

    const channel = supabase
      .channel(`unread_messages:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId}`,
        },
        () => fetchUnread(userId),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchUnread]);

  return { unreadMessages };
}

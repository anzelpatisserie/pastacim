import { useEffect, useState, useCallback, useRef } from 'react';
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

  // useNotifications ile aynı kanıtlanmış pattern: channelRef guard + benzersiz
  // topic. useAuth dalgalanması effect'i yeniden çalıştırınca aynı topic'li
  // (henüz kaldırılmamış) kanala subscribe sonrası .on() eklenip
  // "cannot add postgres_changes after subscribe()" crash'i oluşuyordu.
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!userId) return;

    fetchUnread(userId);

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`unread_messages:${userId}:${Date.now()}`)
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

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId, fetchUnread]);

  return { unreadMessages };
}

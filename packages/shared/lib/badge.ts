import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import type { NotificationRole } from './notifications';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

export function computeBadgeCount(unreadNotifications: number, unreadMessages: number): number {
  return Math.max(0, unreadNotifications) + Math.max(0, unreadMessages);
}

export async function setAppBadge(count: number): Promise<void> {
  try { await Notifications.setBadgeCountAsync(Math.max(0, count)); } catch { /* yoksay */ }
}

export async function fetchUnreadBadgeCount(userId: string, role: NotificationRole): Promise<number> {
  try {
    const [{ count: n }, { count: m }] = await Promise.all([
      _db.from('notifications').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('is_read', false)
        .or(`target_role.is.null,target_role.eq.${role}`),
      _db.from('messages').select('id', { count: 'exact', head: true })
        .eq('receiver_id', userId).eq('is_read', false),
    ]);
    return computeBadgeCount(n ?? 0, m ?? 0);
  } catch {
    return 0;
  }
}

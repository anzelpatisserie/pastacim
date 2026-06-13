/**
 * Expo Push Notification yardımcısı.
 * Alıcının push_token'ı Supabase'den okunur, Expo Push API'ye gönderilir.
 */
import { router } from 'expo-router';
import { supabase } from './supabase';

export type NotificationRole = 'baker' | 'customer';

/**
 * Bildirim tipine ve role göre ilgili ekrana yönlendir.
 * NotificationsScreen (card tap) ve _layout (push tap) tarafından kullanılır.
 */
export function navigateFromNotification(
  type: string,
  data: Record<string, unknown>,
  role: NotificationRole,
): void {
  try {
    switch (type) {
      case 'new_order': {
        // Pastacı → teklif ver ekranı
        const orderId = data?.orderId as string | undefined;
        if (orderId) router.push(`/(baker)/offer/${orderId}` as never);
        break;
      }
      case 'new_offer': {
        // Müşteri → gelen teklifler ekranı
        const orderId = data?.orderId as string | undefined;
        if (orderId) router.push(`/(customer)/offers/${orderId}` as never);
        break;
      }
      case 'offer_accepted':
      case 'offer_rejected': {
        // Pastacı → siparişlerim
        if (role === 'baker') router.push('/(baker)/my-orders' as never);
        else router.push('/(customer)/my-orders' as never);
        break;
      }
      case 'offer_withdrawn': {
        // Müşteri → siparişlerim
        router.push('/(customer)/my-orders' as never);
        break;
      }
      case 'new_message': {
        // Mesaj → sohbet ekranı
        const senderId = data?.senderId as string | undefined;
        if (senderId) {
          router.push({ pathname: '/messages/[conversationId]', params: { conversationId: senderId } } as never);
        }
        break;
      }
      case 'order_cancelled': {
        if (role === 'baker') router.push('/(baker)/my-orders' as never);
        else router.push('/(customer)/my-orders' as never);
        break;
      }
      case 'order_in_progress':
      case 'order_ready':
      case 'order_completed': {
        // Müşteri → siparişlerim (teslim al / yorum yaz)
        router.push('/(customer)/my-orders' as never);
        break;
      }
      case 'campaign':
        router.push('/' as never);
        break;
      default:
        break;
    }
  } catch {
    // navigate hatası uygulamayı patlatmasın
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

/** Bir kullanıcının push token'ını DB'den al */
export async function getUserPushToken(userId: string): Promise<string | null> {
  const { data } = await _db
    .from('users')
    .select('push_token')
    .eq('id', userId)
    .single();
  return (data as { push_token: string | null } | null)?.push_token ?? null;
}

/** Expo Push API'ye bildirim gönder */
export async function sendPushNotification(params: {
  token: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  if (!params.token || !params.token.startsWith('ExponentPushToken')) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: params.token,
        sound: 'default',
        title: params.title,
        body: params.body,
        data: params.data ?? {},
      }),
    });
  } catch {
    // push başarısız olsa bile akışı engelleme
  }
}

/** Kullanıcıya DB bildirimi + push bildirim gönder */
export async function notifyUser(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /**
   * Bildirim akışına (notifications tablosu) yazılsın mı? Varsayılan: true.
   * Yüksek frekanslı olaylarda (ör. her mesaj) feed'i şişirmemek için
   * `false` verilir → yalnızca push gönderilir.
   */
  inApp?: boolean;
}): Promise<void> {
  // 1. In-app notification — SECURITY DEFINER RPC kullan
  //    (başka kullanıcıya bildirim insert etmek için RLS bypass gerekiyor)
  if (params.inApp !== false) {
    await _db.rpc('create_notification', {
      p_user_id: params.userId,
      p_type:    params.type,
      p_title:   params.title,
      p_body:    params.body,
      p_data:    params.data ?? {},
    });
  }

  // 2. Push notification (async, hata yakala)
  try {
    const token = await getUserPushToken(params.userId);
    if (token) {
      await sendPushNotification({
        token,
        title: params.title,
        body: params.body,
        // type'ı data içine göm → OS listener navigateFromNotification'ı çağırabilsin
        data: { type: params.type, ...(params.data ?? {}) },
      });
    }
  } catch {
    // push başarısız olsa da devam et
  }
}

/**
 * Expo Push Notification yardımcısı.
 * Alıcının push_token'ı Supabase'den okunur, Expo Push API'ye gönderilir.
 */
import { Linking, Platform } from 'react-native';
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
  // ÖNEMLİ: role = içinde bulunduğumuz APP (müşteri app / pastacı app),
  // hesabın is_baker flag'i DEĞİL. Aksi halde dual-rol hesapta (hem müşteri
  // hem pastacı) çapraz-app rotaya gidilip "rota yok" hatası alınıyordu.
  const orderId = data?.orderId as string | undefined;
  const senderId = data?.senderId as string | undefined;
  const base = role === 'baker' ? '/(baker)' : '/(customer)';
  try {
    switch (type) {
      case 'new_order':
        // Pastacı → teklif ver ekranı (sipariş kartı)
        if (role === 'baker' && orderId) router.push(`/(baker)/offer/${orderId}` as never);
        else router.push(`${base}/my-orders` as never);
        break;
      case 'new_offer':
        // Müşteri → gelen teklifler ekranı
        if (role === 'customer' && orderId) router.push(`/(customer)/offers/${orderId}` as never);
        else router.push(`${base}/my-orders` as never);
        break;
      case 'order_in_progress':
      case 'order_ready':
        // Müşteri → sipariş kartı (detay)
        if (role === 'customer' && orderId) router.push(`/(customer)/order/${orderId}` as never);
        else router.push(`${base}/my-orders` as never);
        break;
      case 'order_delivered':
        // Müşteri → puanlama ekranı (sipariş teslim edildi, yorum yapmaya teşvik)
        if (role === 'customer' && orderId) router.push(`/(customer)/review/${orderId}` as never);
        else router.push(`${base}/my-orders` as never);
        break;
      case 'new_message':
        if (senderId) router.push({ pathname: '/messages/[conversationId]', params: { conversationId: senderId } } as never);
        else router.push(`${base}/messages` as never);
        break;
      case 'campaign':
        router.push(base as never);
        break;
      case 'app_update': {
        // Sürüm güncelleme bildirimi → mağaza sayfasını aç.
        // Admin panel data.url gönderirse onu kullan; yoksa platforma göre
        // mağaza arama linkine düş.
        // Admin panel app_update bildirimi gönderirken mağaza linkini data.url
        // olarak ekler (iOS App Store / Android Play Store). URL yoksa platform
        // mağaza aramasına düş.
        const url = (data?.url as string | undefined)
          ?? (Platform.OS === 'android' ? 'market://search?q=Pastacım' : undefined);
        if (url) Linking.openURL(url).catch(() => router.push(base as never));
        else router.push(base as never);
        break;
      }
      case 'feedback_request':
        // Geri bildirim teşviki → profildeki geri bildirim modalını aç.
        router.push(`${base}/profile?openFeedback=1` as never);
        break;
      case 'report':
        // Admin → şikayet paneli
        router.push(`${base}/admin-reports` as never);
        break;
      case 'review_request':
        // Müşteri → puanlama ekranı
        if (role === 'customer' && orderId) router.push(`/(customer)/review/${orderId}` as never);
        else router.push(`${base}/my-orders` as never);
        break;
      // offer_accepted / offer_rejected / offer_withdrawn / order_completed /
      // order_cancelled → mevcut app'in siparişlerim sekmesi (güvenli varsayılan;
      // asla çapraz-app rotaya gitmez).
      default:
        router.push(`${base}/my-orders` as never);
        break;
    }
  } catch {
    // navigate hatası uygulamayı patlatmasın
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

/**
 * Bir kullanıcının push token'ını al. role verilirse o APP'in token'ı döner
 * (yoksa legacy push_token'a düşer) — dual-rol kullanıcı doğru app'te push alsın.
 */
export async function getUserPushToken(userId: string, role?: NotificationRole): Promise<string | null> {
  const { data } = await _db
    .from('users')
    .select('push_token, customer_push_token, baker_push_token')
    .eq('id', userId)
    .single();
  const u = data as { push_token: string | null; customer_push_token: string | null; baker_push_token: string | null } | null;
  if (!u) return null;
  if (role === 'customer') return u.customer_push_token ?? u.push_token ?? null;
  if (role === 'baker') return u.baker_push_token ?? u.push_token ?? null;
  return u.push_token ?? null;
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
  /**
   * Bildirim hangi app'in akışında görünmeli? 'customer' / 'baker' / undefined
   * (her ikisi). Dual-rol hesapta (hem müşteri hem pastacı) bildirimin yanlış
   * app'te görünmesini engeller. Ör. 'new_order' → 'baker'.
   */
  targetRole?: NotificationRole;
}): Promise<void> {
  // 1. In-app notification — SECURITY DEFINER RPC kullan
  //    (başka kullanıcıya bildirim insert etmek için RLS bypass gerekiyor)
  if (params.inApp !== false) {
    await _db.rpc('create_notification', {
      p_user_id:     params.userId,
      p_type:        params.type,
      p_title:       params.title,
      p_body:        params.body,
      p_data:        params.data ?? {},
      p_target_role: params.targetRole ?? null,
    });
  }

  // 2. Push notification — targetRole varsa O APP'in token'ına, yoksa her iki app'e.
  try {
    let tokens: string[];
    if (params.targetRole) {
      const t = await getUserPushToken(params.userId, params.targetRole);
      tokens = t ? [t] : [];
    } else {
      const [c, b] = await Promise.all([
        getUserPushToken(params.userId, 'customer'),
        getUserPushToken(params.userId, 'baker'),
      ]);
      tokens = [...new Set([c, b].filter((x): x is string => !!x))];
    }
    const pushData = { type: params.type, ...(params.data ?? {}) };
    for (const token of tokens) {
      await sendPushNotification({ token, title: params.title, body: params.body, data: pushData });
    }
  } catch {
    // push başarısız olsa da devam et
  }
}

// ─── Düzenlenebilir bildirim şablonları (admin panelden yönetilir) ───────────

type NotificationTemplate = {
  key: string;
  title: string;
  body: string;
  target_role: NotificationRole | null;
};

let _templateCache: Record<string, NotificationTemplate> | null = null;

/** Şablonları DB'den (RPC) çek + cache'le. Admin düzenlerse app yeniden açılınca tazelenir. */
async function loadTemplates(): Promise<Record<string, NotificationTemplate>> {
  if (_templateCache) return _templateCache;
  try {
    const { data } = await _db.rpc('get_notification_templates');
    const map: Record<string, NotificationTemplate> = {};
    for (const t of (data ?? []) as NotificationTemplate[]) map[t.key] = t;
    _templateCache = map;
    return map;
  } catch {
    return {};
  }
}

/** {{anahtar}} yer tutucularını değişkenlerle doldur. */
function interpolate(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) =>
    vars[k] !== undefined ? String(vars[k]) : '');
}

/**
 * Şablon-tabanlı bildirim gönder. Admin metni düzenlediyse o metin kullanılır;
 * şablon bulunamazsa `fallback`'e düşer (her zaman bildirim gider).
 *
 * @param key       notification_templates.key (= bildirim type'ı olarak da kullanılır)
 * @param vars      şablondaki {{title}} {{shop}} {{price}} gibi yer tutucular
 * @param fallback  şablon yoksa kullanılacak sabit title/body
 * @param data      navigateFromNotification için payload (orderId vb.)
 */
export async function notifyFromTemplate(params: {
  userId: string;
  key: string;
  vars?: Record<string, string | number>;
  fallback: { title: string; body: string };
  data?: Record<string, unknown>;
  targetRole?: NotificationRole;
}): Promise<void> {
  const templates = await loadTemplates();
  const tpl = templates[params.key];
  const vars = params.vars ?? {};
  const title = tpl ? interpolate(tpl.title, vars) : params.fallback.title;
  const body  = tpl ? interpolate(tpl.body,  vars) : params.fallback.body;
  const targetRole = params.targetRole ?? tpl?.target_role ?? undefined;
  await notifyUser({
    userId: params.userId,
    type:   params.key,
    title,
    body,
    data:   params.data,
    targetRole,
  });
}


/**
 * Yeni mesaj bildirimi: in-app feed'e dedup'lu kayıt + alıcıya push — ikisi de
 * notify_new_message RPC içinde (server-side; push token client'a hiç gitmez).
 * push:false → push gönderme (teklif-mesajı: teklif bildirimi zaten push atıyor).
 * NOT: senderId giriş yapan kullanıcı olmalı; server auth.uid()=sender doğrular.
 */
export async function notifyNewMessage(params: {
  receiverId: string;
  senderId: string;
  targetRole?: NotificationRole;
  preview: string;
  push?: boolean;
}): Promise<void> {
  try {
    await _db.rpc('notify_new_message', {
      p_receiver_id: params.receiverId,
      p_sender_id:   params.senderId,
      p_target_role: params.targetRole ?? null,
      p_preview:     params.preview,
      p_push:        params.push ?? true,
    });
  } catch { /* RPC hatası akışı engellemesin */ }
}

/**
 * Şikayet gönder: reports'a insert + admin'e in-app bildirim + admin push —
 * hepsi file_report RPC içinde (server-side). Helper sadece reportId döner.
 */
export async function fileReport(params: {
  targetType: 'order' | 'user' | 'shop' | 'message';
  targetId?: string;
  reason: string;
  details?: string;
  appName: string;
  imageUrl?: string;
}): Promise<{ reportId: string | null }> {
  try {
    const { data } = await _db.rpc('file_report', {
      p_target_type: params.targetType,
      p_target_id:   params.targetId ?? null,
      p_reason:      params.reason,
      p_details:     params.details ?? null,
      p_app_name:    params.appName,
      p_image_url:   params.imageUrl ?? null,
    });
    const res = data as { report_id: string | null } | null;
    return { reportId: res?.report_id ?? null };
  } catch {
    return { reportId: null };
  }
}

/**
 * Önemli anlarda kullanıcıya e-posta gönderir (Brevo, send-email edge function).
 * Alıcının e-postası sunucuda (service role) bakılır; tip-bazlı template.
 * NOT: Çalışması için Supabase'de BREVO_API_KEY (v3) secret'ı ayarlı olmalı.
 */
export async function sendAppEmail(
  userId: string,
  type: 'welcome' | 'order_ready' | 'offer_accepted' | 'review_encourage',
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.functions.invoke('send-email', {
      body: { userId, type, data: data ?? {} },
    });
  } catch {
    // e-posta hatası akışı engellemesin
  }
}

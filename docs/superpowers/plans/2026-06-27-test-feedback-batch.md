# Test Feedback Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Test sonuçlarından gelen 9 maddelik düzeltme/iyileştirme batch'ini iki app + shared + Supabase'de uygula.

**Architecture:** Önce shared/DB temeli (migration 0006 + notifications.ts helper'ları + FeedbackModal), sonra baker ve customer app'leri paralel (dosya çakışması yok). Mesaj-bildirim dedup'ı SECURITY DEFINER RPC ile server-side; ikon rozeti `expo-notifications setBadgeCountAsync` ile; pastacı Siparişler sekmesi Talepler'e collapse bölüm olarak taşınır.

**Tech Stack:** Expo SDK 56, React Native 0.85, TypeScript strict, expo-router v4, Supabase (Postgres RPC + RLS), expo-notifications, Jest + jest-expo.

## Global Constraints

- **Tüm UI Türkçe** — title/body/label/placeholder hepsi Türkçe.
- **TypeScript strict** — `any` yasak (mevcut `_db: any` pattern'i korunur, yeni `any` ekleme).
- **Paylaşılan kod `packages/shared`** — iki app da kullanıyorsa orada.
- **Her DB değişikliği migration** — `supabase/migrations/0006_*.sql` dosyası + Supabase MCP `apply_migration` ile uygula. Dashboard SQL Editor bypass etme.
- **Dark mode** — renkleri `useThemeColors()`'tan al, `Colors` sabitini doğrudan kullanma.
- **RLS aktif** — başka kullanıcıya yazma (bildirim/şikayet) için SECURITY DEFINER RPC kullan.
- **Admin email:** `anzelpatisserie@gmail.com` (mevcut RPC'lerdeki kontrolle tutarlı).
- **Supabase project:** `lvrbzhziayegyinkcuka`.
- **notifications tablosu kolonları:** `id, user_id, type, title, body, data (jsonb), is_read (bool), target_role, created_at`.
- **Type güncelle:** Yeni RPC/şablon sonrası `npx supabase gen types typescript --project-id lvrbzhziayegyinkcuka > packages/shared/types/database.types.ts`.
- **Doğrulama komutları:** `cd apps/customer && npx tsc --noEmit`, `cd apps/baker && npx tsc --noEmit`, `npm run tsc:shared`, `npm test`.

---

## Phase 0 — Araştırma (kod değil)

### Task 0: Android push teslimat tanısı (Item 1)

**Files:** Yok (araştırma + rapor).

**Adımlar:**
- [ ] **Step 1:** Her iki EAS projesinde FCM v1 kimlik durumunu kontrol et:
  - `cd apps/customer && eas credentials -p android` → "FCM V1 service account" tanımlı mı?
  - `cd apps/baker && eas credentials -p android` → aynı kontrol.
- [ ] **Step 2:** `google-services.json` paket adlarını doğrula:
  - `apps/customer/google-services.json` içinde `package_name` = `com.pastacim.customer`
  - `apps/baker/google-services.json` içinde `package_name` = `com.pastacim.baker`
- [ ] **Step 3:** Bir test push'u gönderip receipt kontrol et (Expo push tool veya `scripts/broadcast.js` çıktısındaki ticket id ile). `DeviceNotRegistered`, `InvalidCredentials`, `MismatchSenderId` hatalarını ara.
- [ ] **Step 4:** Bulguyu raporla. **Eğer FCM v1 service account eksikse** → kullanıcıya net aksiyon listesi ver (Firebase Console > Project Settings > Service accounts > Generate key → `eas credentials` ile yükle). Bu kod fix DEĞİL.
- [ ] **Step 5 (commit yok):** Bulgu özetini batch sonuç raporuna ekle.

---

## Phase 1 — Shared + DB temeli (tek agent, önce)

### Task 1: Migration 0006 — eksik şablonlar + mesaj dedup RPC + admin report bildirimi

**Files:**
- Create: `supabase/migrations/0006_feedback_batch.sql`
- Apply: Supabase MCP `apply_migration` (project `lvrbzhziayegyinkcuka`)
- Modify (sonra): `packages/shared/types/database.types.ts` (gen types ile)

**Interfaces:**
- Produces RPC: `notify_new_message(p_receiver_id uuid, p_sender_id uuid, p_target_role text, p_preview text) RETURNS void` — dedup'lu in-app `new_message` bildirimi yazar (push YOK; push çağıran tarafta ayrı yapılır).
- Produces RPC: `file_report(p_target_type text, p_target_id text, p_reason text, p_details text, p_app_name text) RETURNS uuid` — `reports`'a insert eder VE admin'e `create_notification` ile in-app bildirim yazar, admin push token'ını döndürür (push client'ta atılır). Dönen: report id.
- Produces RPC: `get_admin_push_token() RETURNS text` — admin user'ın push_token'ı (sadece auth'lu, herkes çağırabilir ama sadece admin token döner; push hedefi için).
- Produces: `notification_templates`'a yeni key'ler: `new_order`, `review_request`, `order_cancelled`, `offer_withdrawn`, `order_completed`, `order_reverted`, `new_message`.

- [ ] **Step 1: Migration dosyasını yaz**

```sql
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
```

- [ ] **Step 2: Migration'ı uygula** — Supabase MCP `apply_migration` (name: `0006_feedback_batch`, query: yukarıdaki SQL).
- [ ] **Step 3: Doğrula** — MCP `execute_sql` ile:
  - `SELECT key FROM notification_templates WHERE key IN ('new_order','review_request','new_message','order_cancelled','offer_withdrawn','order_completed','order_reverted');` → 7 satır.
  - `SELECT proname FROM pg_proc WHERE proname IN ('notify_new_message','file_report');` → 2 satır.
- [ ] **Step 4: notify_new_message dedup'ını SQL ile test et** — MCP `execute_sql`:

```sql
-- iki gerçek user id al
WITH ids AS (SELECT id FROM public.users LIMIT 2)
SELECT public.notify_new_message(
  (SELECT id FROM users OFFSET 0 LIMIT 1),
  (SELECT id FROM users OFFSET 1 LIMIT 1),
  NULL, 'merhaba');
-- ikinci kez çağır → yeni satır DEĞİL, mevcut güncellensin
SELECT public.notify_new_message(
  (SELECT id FROM users OFFSET 0 LIMIT 1),
  (SELECT id FROM users OFFSET 1 LIMIT 1),
  NULL, 'nasılsın');
-- doğrula: tek satır, body '2 yeni mesaj', count=2
SELECT body, data->>'count' AS cnt FROM notifications
 WHERE type='new_message' AND user_id=(SELECT id FROM users OFFSET 0 LIMIT 1)
   AND is_read=false ORDER BY created_at DESC;
```
Beklenen: 1 satır, `body='2 yeni mesaj'`, `cnt='2'`. Sonra test kaydını sil:
`DELETE FROM notifications WHERE type='new_message' AND user_id=(SELECT id FROM users OFFSET 0 LIMIT 1);`

- [ ] **Step 5: Type'ları yenile** — `npx supabase gen types typescript --project-id lvrbzhziayegyinkcuka > packages/shared/types/database.types.ts`
- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0006_feedback_batch.sql packages/shared/types/database.types.ts
git commit -m "feat(db): 0006 eksik bildirim şablonları + mesaj dedup + admin report bildirimi"
```

---

### Task 2: notifications.ts — mesaj bildirimi + admin push helper'ları

**Files:**
- Modify: `packages/shared/lib/notifications.ts`
- Modify: `packages/shared/index.ts` (yeni export'lar)
- Test: `packages/shared/__tests__/notifications.test.ts` (yeni)

**Interfaces:**
- Consumes: `notify_new_message`, `file_report` RPC'leri (Task 1).
- Produces:
  - `notifyNewMessage(params: { receiverId: string; senderId: string; targetRole?: NotificationRole; preview: string; pushToken?: string | null }): Promise<void>` — in-app dedup RPC + (pushToken verilirse) push gönder. Mesaj gönderiminde kullanılır.
  - `fileReport(params: { targetType: 'order'|'user'|'shop'|'message'; targetId?: string; reason: string; details?: string; appName: string }): Promise<{ reportId: string | null }>` — `file_report` RPC + dönen admin_token'a push gönder.

- [ ] **Step 1: `notifyNewMessage` ve `fileReport`'u yaz** (notifications.ts sonuna, `notifyFromTemplate`'ten sonra):

```ts
/**
 * Yeni mesaj bildirimi: in-app feed'e dedup'lu kayıt (notify_new_message RPC) +
 * (pushToken verilirse) push. Teklif-mesajında pushToken atlanır (teklif bildirimi
 * zaten push atıyor → çift çalma olmasın).
 */
export async function notifyNewMessage(params: {
  receiverId: string;
  senderId: string;
  targetRole?: NotificationRole;
  preview: string;
  pushToken?: string | null;
}): Promise<void> {
  try {
    await _db.rpc('notify_new_message', {
      p_receiver_id: params.receiverId,
      p_sender_id:   params.senderId,
      p_target_role: params.targetRole ?? null,
      p_preview:     params.preview,
    });
  } catch { /* feed yazımı başarısız olsa da push'u dene */ }

  if (params.pushToken) {
    await sendPushNotification({
      token: params.pushToken,
      title: '💬 Yeni Mesaj',
      body:  params.preview,
      data:  { type: 'new_message', senderId: params.senderId },
    });
  }
}

/**
 * Şikayet gönder: reports'a insert + admin'e in-app bildirim (file_report RPC),
 * dönen admin push token'ına push gönder.
 */
export async function fileReport(params: {
  targetType: 'order' | 'user' | 'shop' | 'message';
  targetId?: string;
  reason: string;
  details?: string;
  appName: string;
}): Promise<{ reportId: string | null }> {
  try {
    const { data } = await _db.rpc('file_report', {
      p_target_type: params.targetType,
      p_target_id:   params.targetId ?? null,
      p_reason:      params.reason,
      p_details:     params.details ?? null,
      p_app_name:    params.appName,
    });
    const res = data as { report_id: string | null; admin_token: string | null } | null;
    if (res?.admin_token) {
      await sendPushNotification({
        token: res.admin_token,
        title: '🚩 Yeni Şikayet',
        body:  'Bir kullanıcı şikayet gönderdi: ' + params.reason,
        data:  { type: 'report', reportId: res.report_id },
      });
    }
    return { reportId: res?.report_id ?? null };
  } catch {
    return { reportId: null };
  }
}
```

- [ ] **Step 2: `navigateFromNotification`'a `report` ve `review_request` case'leri ekle** (switch içinde, `feedback_request` case'inden sonra):

```ts
      case 'report':
        // Admin → şikayet paneli
        router.push(`${base}/admin-reports` as never);
        break;
      case 'review_request':
        // Müşteri → puanlama / sipariş kartı
        if (role === 'customer' && orderId) router.push(`/(customer)/order/${orderId}` as never);
        else router.push(`${base}/my-orders` as never);
        break;
```

- [ ] **Step 3: Export ekle** — `packages/shared/index.ts` içindeki notifications export satırına `notifyNewMessage` ve `fileReport` ekle (mevcut `notifyUser, notifyFromTemplate, ...` listesine).
- [ ] **Step 4: Test yaz** — `packages/shared/__tests__/notifications.test.ts`:

```ts
import { notifyNewMessage } from '../lib/notifications';

jest.mock('../lib/supabase', () => {
  const rpc = jest.fn().mockResolvedValue({ data: null });
  return { supabase: { rpc, from: jest.fn() } };
});

describe('notifyNewMessage', () => {
  it('calls notify_new_message RPC with dedup params and no push when no token', async () => {
    const { supabase } = require('../lib/supabase');
    await notifyNewMessage({ receiverId: 'r1', senderId: 's1', preview: 'selam' });
    expect(supabase.rpc).toHaveBeenCalledWith('notify_new_message', {
      p_receiver_id: 'r1', p_sender_id: 's1', p_target_role: null, p_preview: 'selam',
    });
  });
});
```

- [ ] **Step 5: Test çalıştır** — `npm test -- notifications.test` → PASS. `npm run tsc:shared` → hata yok.
- [ ] **Step 6: Commit**

```bash
git add packages/shared/lib/notifications.ts packages/shared/index.ts packages/shared/__tests__/notifications.test.ts
git commit -m "feat(shared): notifyNewMessage (dedup) + fileReport (admin push) helper'ları"
```

---

### Task 3: Badge helper — okunmamış toplam → ikon rozeti

**Files:**
- Create: `packages/shared/lib/badge.ts`
- Modify: `packages/shared/index.ts` (export)
- Test: `packages/shared/__tests__/badge.test.ts`

**Interfaces:**
- Produces:
  - `computeBadgeCount(unreadNotifications: number, unreadMessages: number): number` — toplam (saf fonksiyon, test edilir).
  - `setAppBadge(count: number): Promise<void>` — `expo-notifications` `setBadgeCountAsync` sarmalayıcı (negatifi 0'a kırpar, hata yutar).
  - `fetchUnreadBadgeCount(userId: string, role: NotificationRole): Promise<number>` — notifications (okunmamış, role-filtreli) + messages (okunmamış) sayar, `computeBadgeCount` döndürür.

- [ ] **Step 1: Test yaz** — `packages/shared/__tests__/badge.test.ts`:

```ts
import { computeBadgeCount } from '../lib/badge';

describe('computeBadgeCount', () => {
  it('sums notifications and messages', () => {
    expect(computeBadgeCount(3, 2)).toBe(5);
  });
  it('treats negatives as zero', () => {
    expect(computeBadgeCount(-1, -2)).toBe(0);
  });
});
```

- [ ] **Step 2: Çalıştır, fail gör** — `npm test -- badge.test` → FAIL (module not found).
- [ ] **Step 3: `badge.ts`'i yaz**:

```ts
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
```

- [ ] **Step 4: Çalıştır, pass gör** — `npm test -- badge.test` → PASS.
- [ ] **Step 5: Export ekle** — `packages/shared/index.ts`: `computeBadgeCount, setAppBadge, fetchUnreadBadgeCount`.
- [ ] **Step 6: tsc + commit**

```bash
npm run tsc:shared
git add packages/shared/lib/badge.ts packages/shared/index.ts packages/shared/__tests__/badge.test.ts
git commit -m "feat(shared): ikon rozeti helper'ları (computeBadgeCount/setAppBadge/fetchUnreadBadgeCount)"
```

---

### Task 4: FeedbackModal klavye flicker fix (Item 4)

**Files:**
- Modify: `packages/shared/components/FeedbackModal.tsx` (KeyboardAvoidingView, ~line 128-130)

- [ ] **Step 1: behavior'ı düzelt** — `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}` → `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`. (Android'de `height` modu re-layout flicker'ı yapıyor; `undefined` ile sistem default'u kullanılır.) `Platform` zaten import edilmemişse ekle.
- [ ] **Step 2: tsc** — `npm run tsc:shared` → hata yok.
- [ ] **Step 3: Manuel doğrulama notu** — Android cihazda geri bildirim modalını aç, metin alanına dokun: klavye açılırken flu/aç-kapa olmamalı.
- [ ] **Step 4: Commit**

```bash
git add packages/shared/components/FeedbackModal.tsx
git commit -m "fix(shared): FeedbackModal Android klavye flicker (height→undefined)"
```

---

## Phase 2 — App'ler (paralel: Agent A = baker, Agent B = customer)

> Faz 1 commit'lendikten sonra başlar. İki agent farklı klasörlerde çalışır, çakışma yok.

### Task 5 (Agent A): Baker — Siparişler sekmesini Talepler'e taşı (Item 9)

**Files:**
- Create: `apps/baker/app/(baker)/_components/ActiveOrderCard.tsx` (aktif+tamamlanan sipariş kartı + durum-geçiş)
- Modify: `apps/baker/app/(baker)/index.tsx` (yeni collapse bölümler + veri çekimi)
- Modify: `apps/baker/app/(baker)/_layout.tsx` (my-orders Tabs.Screen → `href:null` gizli rota)
- Modify: `apps/baker/app/(baker)/my-orders.tsx` (içeriği taşındıktan sonra `<Redirect href="/(baker)" />` ekranına indirge — eski bildirim derin linkleri patlamasın, dosyayı SİLME)

**Interfaces:**
- Consumes: `notifyFromTemplate` (mevcut), order status değiştirme mantığı (my-orders.tsx:131-189'dan taşınır).
- Produces: `ActiveOrderCard` component — props: `{ offer, onSetStatus, colors }`; durum butonu (Hazırlamaya Başla→Teslimata Hazır→Teslim Ettim) ve bildirim tetiklemesi içerir.

- [ ] **Step 1:** `my-orders.tsx`'i oku (tamamı). Kart render'ı, `isActive()` (line 28-33), `ORDER_STATUS_LABELS` (19-25), `handleSetStatus` (131-144) + bildirim/email (156-189), `nextAction` (282-288) mantığını anla.
- [ ] **Step 2:** `ActiveOrderCard.tsx`'i oluştur — my-orders.tsx'teki tek sipariş kartı JSX'i + durum-geçiş butonu + `handleSetStatus` bildirim mantığını taşı. Props ile `colors`/`offer` al. Tema renkleri `useThemeColors()`'tan.
- [ ] **Step 3:** `index.tsx`'e accepted offer veri çekimini ekle — my-orders.tsx:44-78'deki sorgu (offers status=accepted, hidden_for_baker=false, order join). `acceptedOffers` state + `aktifSiparisler` (order.status ∈ accepted/in_progress/ready) ve `tamamlananSiparisler` (order.status=completed) türevleri.
- [ ] **Step 4:** `index.tsx` render'a iki collapse bölüm ekle (mevcut "Siparişe Dönmeyen Tekliflerim" collapse pattern'ini kopyala — index.tsx:465-536):
  - **🔵 Aktif Siparişler** — `aktifSiparisler.length > 0` ise göster, `aktifExpanded` başlangıç `true` (otomatik expand). Yarıçap filtresinden hemen sonra, "Bekleyen Tekliflerim"in üstünde. Her kart `<ActiveOrderCard>`.
  - **✅ Tamamlanan Siparişler** — `tamamlananSiparisler.length > 0` ise göster, `tamamlananExpanded` başlangıç `false` (her zaman collapse). En altta, "Açık Talepler"den sonra.
- [ ] **Step 5:** `_layout.tsx`'te `my-orders` `<Tabs.Screen>`'i tab bar'dan kaldır → `href: null` gizli rota yap (diğer gizli rotalarla aynı pattern). Görünür 3 tab (Talepler/Mesajlar/Profil) kalır.
- [ ] **Step 6:** `my-orders.tsx` içeriğini `<Redirect href="/(baker)" />` döndüren basit ekrana indirge (dosyayı SİLME). Sebep: `navigateFromNotification`'taki `${base}/my-orders` fallback'leri (notifications.ts) eski bildirim derin linklerinde hâlâ bu route'a gidiyor; route var olmalı ama Talepler'e yönlendirmeli. `grep -rn "my-orders" apps/baker packages/shared` ile referansları doğrula.
- [ ] **Step 7:** tsc — `cd apps/baker && npx tsc --noEmit` → hata yok.
- [ ] **Step 8: Manuel doğrulama** — Siparişler tab'ı yok; teklif kabul edilmiş bir sipariş Talepler'de "Aktif Siparişler" altında expand; durum butonları çalışıyor; tamamlanan sipariş "Tamamlanan Siparişler" altında collapse.
- [ ] **Step 9: Commit**

```bash
git add apps/baker/app/(baker)
git commit -m "feat(baker): Siparişler sekmesini Talepler'e collapse bölüm olarak taşı (Item 9)"
```

---

### Task 6 (Agent A): Baker — mesaj başlığı (müşteri özeti) + klavye + badge + teklif-mesajı in-app notif

**Files:**
- Modify: `apps/baker/app/messages/[conversationId].tsx` (başlık, KeyboardAvoidingView, mesaj gönderiminde in-app notif)
- Modify: `apps/baker/app/(baker)/offer/[orderId].tsx` (teklif-mesajı insert'ünden sonra in-app notif)
- Modify: `apps/baker/hooks/useNotifications.ts` (badge set)

**Interfaces:**
- Consumes: `notifyNewMessage` (Task 2), `fetchUnreadBadgeCount`/`setAppBadge` (Task 3), `get_customer_summary_for_baker` RPC (mevcut).

- [ ] **Step 1: Mesaj başlığı** — `apps/baker/app/messages/[conversationId].tsx` header (customer ile aynı yapı, ~line 401-408): müşteri adı (`otherUserName`) tıklanabilir olsun. `onPress` → `get_customer_summary_for_baker` ile özet çek, bir modal'da göster (full_name, total/completed/cancelled orders, member_days). Tıklanabilirliği görsel belli et (alt çizgi/chevron). Geri tuşu mevcut.
- [ ] **Step 2: Klavye fix (Item 2)** — `KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}` yap (Android'de `undefined` yerine `height` + gerekirse `keyboardVerticalOffset={0}`; test edip input bar'ın klavye üstünde kaldığını doğrula). NOT: mesaj ekranında header var, FeedbackModal'dan farklı olarak burada `height` doğru davranışı verir; cihazda doğrula.
- [ ] **Step 3: Mesaj gönderiminde in-app notif (Item 6)** — `sendMessage` içinde (customer örneği: lines 221-228) `notifyUser({inApp:false})`'ı kaldır, yerine: önce alıcının push token'ını al (`getUserPushToken(otherUserId, 'customer')` — alıcı müşteri app'inde), sonra `notifyNewMessage({ receiverId: otherUserId, senderId: user.id, targetRole: 'customer', preview, pushToken })`. (Baker mesaj atınca alıcı müşteri.)
- [ ] **Step 4: Teklif-mesajı in-app notif (Item 6)** — `offer/[orderId].tsx`'te mesaj insert'ünden sonra (Explore: lines 162-167) **push'suz** in-app notif: `notifyNewMessage({ receiverId: customerId, senderId: user.id, targetRole: 'customer', preview: <teklif mesajı>, pushToken: undefined })`. (Teklif `new_offer` push'u zaten gidiyor.)
- [ ] **Step 5: Badge (Item 3)** — `apps/baker/hooks/useNotifications.ts`: token kaydından sonra ve realtime bildirim/mesaj geldiğinde `fetchUnreadBadgeCount(userId,'baker').then(setAppBadge)` çağır. Logout/temizlemede `setAppBadge(0)`. (Hook'taki mevcut notification listener + useUnreadMessages kaynaklı tetikleme noktalarına bağla.)
- [ ] **Step 6:** tsc — `cd apps/baker && npx tsc --noEmit` → hata yok.
- [ ] **Step 7: Commit**

```bash
git add apps/baker
git commit -m "feat(baker): mesaj başlığı müşteri özeti + klavye fix + ikon rozeti + mesaj/teklif in-app bildirim"
```

---

### Task 7 (Agent B): Customer — mesaj başlığı (dükkan→profil) + klavye + badge + mesaj in-app notif

**Files:**
- Modify: `apps/customer/app/messages/[conversationId].tsx` (başlık, KeyboardAvoidingView, sendMessage notif)
- Modify: `apps/customer/hooks/useNotifications.ts` (badge)

**Interfaces:**
- Consumes: `notifyNewMessage`, `getUserPushToken` (Task 2), `fetchUnreadBadgeCount`/`setAppBadge` (Task 3). Dükkan bilgisi: `pastry_shops` (otherUserId = baker user_id → shop'u bul).

- [ ] **Step 1: Başlıkta dükkan adı (Item 5)** — `[conversationId].tsx` header (lines 401-408): `otherUserName` yerine konuşmadaki pastacının **dükkan adını** göster. Veri: mevcut `otherUserId` (baker user) ile `pastry_shops` sorgusu — `_db.from('pastry_shops').select('id, name').eq('user_id', otherUserId).maybeSingle()`. Dükkan yoksa (karşı taraf pastacı değilse) `otherUserName`'e düş.
- [ ] **Step 2: Başlığa tıkla → profil** — header center'a `onPress` ekle: shop bulunduysa `router.push(`/(customer)/baker/${shopId}`)`. Tıklanabilirliği görsel belli et. Geri tuşuyla mesaja dönülür (mevcut).
- [ ] **Step 3: Klavye fix (Item 2)** — `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}` (line 394: şu an Android `undefined`). Cihazda input bar'ın klavye üstünde kaldığını doğrula.
- [ ] **Step 4: Mesaj in-app notif (Item 6)** — `sendMessage` (lines 221-228): `notifyUser({inApp:false})` yerine alıcının baker token'ını al (`getUserPushToken(otherUserId,'baker')`) + `notifyNewMessage({ receiverId: otherUserId, senderId: user.id, targetRole: 'baker', preview, pushToken })`. (Müşteri mesaj atınca alıcı pastacı.)
- [ ] **Step 5: Badge (Item 3)** — `apps/customer/hooks/useNotifications.ts`: `fetchUnreadBadgeCount(userId,'customer').then(setAppBadge)` token kaydı + bildirim/mesaj geldiğinde; logout'ta `setAppBadge(0)`.
- [ ] **Step 6:** tsc — `cd apps/customer && npx tsc --noEmit` → hata yok.
- [ ] **Step 7: Commit**

```bash
git add apps/customer/app/messages apps/customer/hooks/useNotifications.ts
git commit -m "feat(customer): mesaj başlığı dükkan adı+profil + klavye fix + ikon rozeti + mesaj in-app bildirim"
```

---

### Task 8 (Agent B): Customer — sipariş detayından şikayet butonunu kaldır + şikayetleri file_report'a bağla (Item 7)

**Files:**
- Modify: `apps/customer/app/(customer)/order/[id].tsx` (şikayet butonu kaldır — Explore: lines 287-294)
- Modify: `packages/shared/components/ReportModal.tsx` (gönderimi `fileReport`'a çevir — admin push)

> NOT: ReportModal shared'da. Bu task ReportModal'ı düzenliyor; Agent A bu dosyaya dokunmuyor → çakışma yok. (Faz 1 ReportModal'a dokunmadı.)

- [ ] **Step 1: Şikayet butonunu kaldır** — `order/[id].tsx:287-294` şikayet (`⚠️`) butonunu ve ilgili `showReport` state/`ReportModal` render'ını kaldır (kendi siparişin → kendini şikayet anlamsız). Mesaj ekranı ve dükkan profili şikayet butonları KALIR.
- [ ] **Step 2: ReportModal'ı fileReport'a bağla** — ReportModal'ın submit handler'ı şu an `reports`'a doğrudan insert ediyor. Bunu `fileReport({ targetType, targetId, reason, details, appName })` çağrısına çevir (admin'e in-app + push gider). `appName` = `'customer'` / `'baker'` (Constants.expoConfig'den veya prop'tan).
- [ ] **Step 3:** tsc — `cd apps/customer && npx tsc --noEmit` + `npm run tsc:shared` → hata yok.
- [ ] **Step 4: Manuel doğrulama** — Kendi sipariş detayında şikayet butonu YOK. Mesaj ekranından şikayet gönder → admin cihazına push + AdminReportsScreen'de görünür.
- [ ] **Step 5: Commit**

```bash
git add apps/customer/app/(customer)/order/[id].tsx packages/shared/components/ReportModal.tsx
git commit -m "fix(customer): kendi sipariş detayından şikayet butonu kaldır + şikayet admin push (Item 7)"
```

---

## Phase 3 — Doğrulama & kapanış

### Task 9: Tam doğrulama

- [ ] **Step 1:** `cd apps/customer && npx tsc --noEmit` → hata yok.
- [ ] **Step 2:** `cd apps/baker && npx tsc --noEmit` → hata yok.
- [ ] **Step 3:** `npm run tsc:shared` → hata yok.
- [ ] **Step 4:** `npm test` → tüm testler PASS.
- [ ] **Step 5:** Item-bazlı manuel doğrulama listesini kullanıcıya ver (spec'teki "Test/Doğrulama Kriterleri").
- [ ] **Step 6:** Item 1 araştırma bulgu raporunu + gereken kullanıcı aksiyonlarını özetle.
- [ ] **Step 7:** Branch finalize — `superpowers:finishing-a-development-branch` ile PR/merge seçeneği sun.

---

## Self-Review — Spec kapsam kontrolü

| Spec maddesi | Karşılayan task |
|---|---|
| Item 1 Android push | Task 0 (araştırma) |
| Item 2 klavye binme | Task 6 step2 (baker), Task 7 step3 (customer) |
| Item 3 ikon rozeti | Task 3 (helper) + Task 6 step5 + Task 7 step5 |
| Item 4 feedback klavye | Task 4 |
| Item 5 mesaj başlığı | Task 6 step1 (baker özet), Task 7 step1-2 (customer dükkan→profil) |
| Item 6 in-app mesaj bildirim | Task 1 (RPC) + Task 2 (helper) + Task 6 step3-4 + Task 7 step4 |
| Item 7 şikayet | Task 1 (file_report) + Task 2 (fileReport) + Task 8 |
| Item 8 şablonlar | Task 1 step1 |
| Item 9 restructure | Task 5 |

Tüm maddeler kapsanıyor. Type tutarlılığı: `notifyNewMessage`/`fileReport`/`computeBadgeCount`/`setAppBadge`/`fetchUnreadBadgeCount` Task 2-3'te tanımlı, Task 6-8'de tüketiliyor. RPC adları (`notify_new_message`, `file_report`) Task 1 ↔ Task 2 eşleşiyor.

# Test Feedback Batch — Tasarım (2026-06-27)

Test sonuçlarından gelen 9 maddelik düzeltme/iyileştirme batch'i. İki app (customer / baker) + shared + Supabase.

## Kapsam Özeti

| # | Madde | Tip | App |
|---|---|---|---|
| 1 | Android'de telefona push gelmiyor (in-app var) | Araştırma (muhtemelen infra) | Android (her iki) |
| 2 | Android'de klavye mesaj hücresinin üzerine biniyor | Bug fix | Android (her iki) |
| 3 | Bildirim sayısı uygulama ikonunda görünmüyor | Feature | iOS + Android |
| 4 | Geri bildirim gönder klavye flicker | Bug fix | Android |
| 5 | Mesaj başlığı: kullanıcı adı yerine dükkan adı + profile git | UX | iOS + Android |
| 6 | Mesajlar (ve teklif-mesajı) in-app bildirim feed'inde görünmüyor | Bug/feature | iOS + Android |
| 7 | Kendi siparişinde "şikayet et" butonu; admin bildirimi yok | Bug + feature | iOS + Android |
| 8 | Eksik bildirim şablonları (yeni sipariş, puanlama, vb.) | Feature | iOS + Android |
| 9 | Pastacı: Siparişler sekmesi kaldır → Talepler'e collapse bölümler | UX restructure | Baker |

## Kullanıcı Kararları (netleştirildi)

- **İkon rozeti (item 3):** okunmamış bildirim + okunmamış mesaj **toplamı**.
- **Pastacı tarafı mesaj başlığı (item 5):** müşteri adı; tıklanınca `get_customer_summary_for_baker` verisiyle özet kartı.
- **Şikayet bildirimi (item 7):** admin panelinde görünür **VE** admin cihazına push.

---

## Madde Detayları

### Item 1 — Android push teslimatı (ARAŞTIRMA)
Mevcut durum: `useNotifications.ts` (her iki app) Android kanalını `AndroidImportance.MAX` + `sound:'default'` ile doğru kuruyor. Kod tarafı sorun değil.
- Yapılacak: `eas credentials` (her iki proje) ile **FCM v1 service account JSON** tanımlı mı kontrol et; `google-services.json` paket adları (`com.pastacim.customer` / `com.pastacim.baker`) eşleşiyor mu; Expo push receipt loglarında `DeviceNotRegistered` / `InvalidCredentials` hatası var mı.
- **Beklenen sonuç:** Kod düzeltmesi olmayabilir; bulgu raporlanır, gerekirse kullanıcının Expo/Firebase dashboard aksiyonu listelenir.

### Item 2 — Klavye mesaj hücresine biniyor (Android)
`messages/[conversationId].tsx` (her iki app): `KeyboardAvoidingView` Android'de `behavior` tanımsız.
- Düzeltme: Android için uygun davranış (`behavior="height"` veya header yüksekliği kadar `keyboardVerticalOffset`) — input bar klavyenin üstünde kalsın, son mesaj hücresi kapanmasın. iOS davranışı korunur (`padding`).

### Item 3 — Uygulama ikon rozeti
- `expo-notifications` `setBadgeCountAsync(n)` hiç çağrılmıyor (`shouldSetBadge:true` ayarlı ama sayı set edilmiyor).
- `n` = okunmamış in-app bildirim + okunmamış mesaj toplamı.
- Güncelleme tetikleyicileri: yeni bildirim/mesaj gelince, bildirim feed'i okununca, mesaj okununca. Mevcut `useUnreadMessages` + notifications okunmamış sayısı kaynak alınır.
- Çıkış (logout) ve feed temizlenince `setBadgeCountAsync(0)`.

### Item 4 — FeedbackModal klavye flicker (Android)
`FeedbackModal.tsx`: `KeyboardAvoidingView` Android'de `behavior:'height'` → flicker. Android'de `undefined` yap (iOS `padding` korunur). Gerekirse `ScrollView keyboardShouldPersistTaps="handled"` korunur.

### Item 5 — Mesaj başlığı yeniden tasarımı
- **Customer app:** başlık = **dükkan adı** (konuşmadaki pastacının `pastry_shops.name`). Tıkla → `baker/[shopId]` profil rotası. Geri tuşu mesaja döner.
- **Baker app:** başlık = **müşteri adı** (`users.full_name`). Tıkla → müşteri özet kartı (`get_customer_summary_for_baker`, modal veya hafif sayfa).
- Başlığın tıklanabilir olduğu görsel olarak belli olsun (chevron/altçizgi vb.).

### Item 6 — Mesajlar in-app feed'inde görünmeli
Mevcut: mesaj gönderiminde `notifyUser({ type:'new_message', inApp:false })` — sadece push.
- Değişiklik: in-app `new_message` bildirimi de oluşturulsun.
- **Dedup:** alıcıda aynı `conversation_id` için **okunmamış** `new_message` bildirimi varsa yeni kayıt yerine onu güncelle (body = son mesaj önizleme + sayaç, ör. "3 yeni mesaj"). Okununca/konuşmaya girilince sıfırlanır.
- **Teklif-mesajı (baker `offer/[orderId].tsx`):** teklif gönderiminde eklenen mesaj için **push'suz** in-app `new_message` bildirimi oluştur (teklif `new_offer` bildirimi zaten push atıyor; çift çalma olmasın). Yine dedup uygulanır.
- Bildirime tıklayınca ilgili konuşmaya yönlendir.

### Item 7 — Şikayet butonu + admin bildirimi
- **Kaldır:** `apps/customer/.../order/[id].tsx` içindeki şikayet butonu (sipariş her zaman kullanıcının kendi siparişi; kendini şikayet etmek anlamsız). Mesaj ekranı (karşı tarafı şikayet) ve dükkan profili şikayet butonları **kalır**.
- **Admin bildirimi:** `reports` tablosuna kayıt eklendiğinde admin'e (anzelpatisserie@gmail.com) hem in-app bildirim hem **push** gitsin. Yaklaşım: SECURITY DEFINER bir RPC (`file_report`) veya report insert trigger'ı admin user_id'sini bulur, `create_notification` + push helper çağırır. Push helper (`notifyAdmins`) shared lib'de.
- Şikayet zaten `AdminReportsScreen`'de listeleniyor; bu korunur.

### Item 8 — Eksik bildirim şablonları
`notification_templates` tablosuna eklenecek (migration 0006):
- `new_order` — 🧁 "Yeni Sipariş Talebi" (hedef: baker) — yakındaki yeni sipariş.
- `review_request` — ⭐ "Siparişini Puanla" (hedef: customer) — tamamlanan siparişe yorum daveti.
- Eksik kalanlar da eklenir/tutarlı hale getirilir: `order_cancelled`, `offer_withdrawn`, `order_completed`, `order_reverted`, `new_message`.
- Kod tarafında hâlihazırda `notifyUser` ile gönderilen tipler şablona bağlanır (fallback string'ler yerine `notifyFromTemplate`).

### Item 9 — Pastacı sekme restructure
**Siparişler (`my-orders`) sekmesi kaldırılır.** İçeriği Talepler (`index.tsx`) ekranına collapse bölüm olarak taşınır.

Talepler ekranı sıralaması (yukarıdan aşağı):
1. Yarıçap filtresi (mevcut)
2. **🔵 Aktif Siparişler** — `offers` (status=accepted, order.status ∈ {accepted, in_progress, ready}). Aktif sipariş **varsa otomatik expand**, yoksa bölüm gizli/collapse. Kart üstünde durum-ilerletme butonu (Hazırlamaya Başla → Teslimata Hazır → Teslim Ettim) — `my-orders.tsx` mantığı taşınır.
3. **⏳ Bekleyen Tekliflerim** (mevcut)
4. **📋 Açık Talepler** (mevcut ana liste)
5. **📁 Siparişe Dönmeyen Tekliflerim** (mevcut, collapse)
6. **✅ Tamamlanan Siparişler** — order.status=completed. **Her zaman collapse**, en altta.

Notlar:
- `index.tsx` zaten ~38KB. Aktif/tamamlanan sipariş kartı + durum-geçiş mantığı ayrı bir component dosyasına çıkarılır (örn. `apps/baker/app/(baker)/_components/ActiveOrderCard.tsx` veya benzeri) ki ana dosya şişmesin.
- `_layout.tsx`'ten `my-orders` Tabs.Screen kaldırılır; route dosyası silinir veya `href:null` gizli rota yapılır (kaldırma tercih edilir).
- Mevcut realtime abonelikleri (offers + orders) aktif sipariş güncellemelerini zaten kapsıyor; durum değişince Aktif Siparişler güncellenir.
- Durum güncelleme sonrası bildirim/email mantığı (order_in_progress / order_ready / order_delivered) korunur.

---

## Yürütme Stratejisi (subagent + superpowers)

Dosya-bazlı çakışmasız dağıtım. Önce shared/DB temeli, sonra app'ler paralel.

**Faz 1 — Shared + DB (tek agent, önce):**
- Migration 0006: notification_templates eklemeleri + admin report push RPC/trigger (`file_report` / `notifyAdmins` desteği).
- `packages/shared/lib/notifications.ts`: mesaj in-app + dedup desteği, `notifyAdmins`, badge yardımcıları.
- `packages/shared/components/FeedbackModal.tsx`: klavye fix.
- Çıktı: app agent'larının kullanacağı stabil arayüz.

**Faz 2 — Paralel (iki agent):**
- **Agent A (baker app, `apps/baker/**`):** item 9 restructure (index/my-orders/_layout + component extraction), baker mesaj başlığı + klavye + badge, teklif-mesajı in-app notif, baker useNotifications badge.
- **Agent B (customer app, `apps/customer/**`):** mesaj başlığı (dükkan→profil) + klavye + badge, mesaj in-app notif, sipariş detayından şikayet butonu kaldırma, customer useNotifications badge.

**Faz 3 — Doğrulama:**
- `npx tsc --noEmit` (customer + baker) + `npm run tsc:shared`
- `npm test`
- Item 1 araştırma bulgusu raporu
- Kullanıcının manuel cihaz doğrulaması

Her agent TDD / verification-before-completion disiplinini uygular. Dosya çakışması yok: shared dosyaları yalnızca Faz 1 agent'ı düzenler; Faz 2 agent'ları kendi app klasörlerinde çalışır.

## Test / Doğrulama Kriterleri
- Item 2/4: Android cihazda klavye input bar'ı kapatmıyor, flicker yok.
- Item 3: Bildirim/mesaj gelince ikon rozeti artar, okununca azalır, logout'ta 0.
- Item 5: Başlığa tıklayınca doğru profil/özet açılır, geri ile mesaja dönülür.
- Item 6: Mesaj ve teklif-mesajı in-app feed'de görünür; dedup ile konuşma başına tek kayıt.
- Item 7: Kendi siparişinde şikayet butonu yok; test şikayeti admin'e push + panelde görünür.
- Item 8: Yeni şablonlar feed'de doğru başlık/emoji ile çıkar.
- Item 9: Siparişler sekmesi yok; aktif sipariş Talepler'de expand, tamamlanan collapse; durum butonları çalışır.

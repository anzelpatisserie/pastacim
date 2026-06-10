# Pastacım — Geliştirici Rehberi

## Proje Özeti
Armut.com benzeri, yalnızca pasta / börek / tatlı üzerine kurulu bir Türk marketplace uygulaması.
- Müşteri sipariş oluşturur → pastacılar teklif verir → müşteri en uygun teklifi seçer
- Konum bazlı eşleşme (radius seçici planlanmış, şu an hardcoded 20km)
- Tek Supabase backend; **iki ayrı mobil uygulama** (müşteri + pastacı)

---

## İki Uygulama, Tek Backend

| | Müşteri | Pastacı |
|---|---|---|
| **App Store adı** | Pastacım | Pastacım Pro |
| **iOS Bundle ID** | `com.pastacim.customer` | `com.pastacim.baker` |
| **Android Package** | `com.pastacim.customer` | `com.pastacim.baker` |
| **EAS Project ID** | `d513dbc9-8da6-4051-995f-6a7a40b37586` | `c8d3415d-5bce-4b61-95eb-fa4134a91fe7` |
| **Scheme** | `pastacim` | `pastacim-pro` |
| **Workspace** | `apps/customer/` | `apps/baker/` |
| **Backend** | Aynı Supabase projesi (`lvrbzhziayegyinkcuka`) | Aynı |

---

## Teknik Stack

| Katman | Teknoloji |
|---|---|
| Yapı | npm workspaces monorepo |
| Framework | Expo SDK 56 + React Native 0.85 + TypeScript (strict) |
| Routing | expo-router v4 (file-based), typedRoutes: true |
| Backend | Supabase (auth + database + storage + realtime) |
| Harita | react-native-maps + expo-location |
| Auth | expo-secure-store (iOS Keychain / Android Keystore) + expo-auth-session (Google OAuth) |
| Build | EAS Build + EAS Update (OTA) |
| Test | Jest + jest-expo |
| Hedef | iOS + Android |

---

## Klasör Yapısı

```
package.json                 # workspaces root: apps/* + packages/*
apps/
  customer/                  # Pastacım — müşteri uygulaması
    app.json
    eas.json
    google-services.json
    android/                 # Native Android (prebuild çıktısı)
    ios/                     # Native iOS (Podfile.lock dahil)
    hooks/
      useNotifications.ts    # Push token + bildirim dinleyici
      useUnreadMessages.ts   # Okunmamış mesaj sayısı (tab badge)
    app/
      _layout.tsx            # Auth durumuna göre yönlendirme + deep link + push handler
      (auth)/                # onboarding / login / register
      (customer)/            # Tab navigator — müşteri sekmeleri
        _layout.tsx          # Tab bar tanımı (gizli rotalar href:null)
        index.tsx            # Yakındaki pastacılar + sipariş oluştur CTA
        messages.tsx         # Konuşma listesi (tab)
        notifications.tsx    # Bildirim akışı (tab)
        my-orders.tsx        # Aktif & geçmiş siparişler
        order/
          create.tsx         # Yeni sipariş formu
          [id].tsx           # Sipariş detayı (realtime)
        offers/[orderId].tsx # Gelen teklifler (gizli rota)
        baker/[shopId].tsx   # Pastacı dükkan profili (gizli rota)
        review/[orderId].tsx # Yorum formu (gizli rota)
      messages/[conversationId].tsx  # Mesaj ekranı (gizli rota)
  baker/                     # Pastacım Pro — pastacı uygulaması
    app.json
    eas.json
    google-services.json
    ios/                     # Native iOS (Podfile.lock dahil)
    # NOT: android/ klasörü yok — EAS managed prebuild
    hooks/
      useNotifications.ts    # Push token + bildirim dinleyici
      useUnreadMessages.ts   # Okunmamış mesaj sayısı (tab badge)
    app/
      _layout.tsx            # Auth + isBaker kontrolü → setup yönlendirme
      (auth)/                # onboarding / login / register / setup
      (baker)/               # Tab navigator — pastacı sekmeleri
        _layout.tsx          # Tab bar tanımı
        index.tsx            # Yakındaki sipariş talepleri (realtime)
        profile.tsx          # Dükkan profili + sosyal medya + Google Maps
        messages.tsx         # Konuşma listesi (tab)
        notifications.tsx    # Bildirim akışı (tab)
        my-orders.tsx        # Kabul edilen siparişler
        wallet.tsx           # Cüzdan & hareketler
        offer/[orderId].tsx  # Teklif ver (gizli rota)
      messages/[conversationId].tsx  # Mesaj ekranı (gizli rota)

packages/
  shared/                    # @pastacim/shared — her iki uygulama kullanır
    index.ts                 # public exports
    lib/
      supabase.ts            # Tek client + typed RPC wrapper'ları
      constants.ts           # Renkler, tema, ölçüler, sabitler
      notifications.ts       # Push & in-app bildirim helper'ları + navigateFromNotification
    hooks/
      useAuth.ts             # Session + profil + isCustomer / isBaker + Google OAuth
    components/
      NotificationsScreen.tsx  # Bildirim akışı UI
      FeedbackModal.tsx        # Ekran görüntülü geri bildirim
    types/
      database.types.ts      # Supabase auto-gen tipler (gen komutuyla güncelle)
    __tests__/
      useAuth.test.ts

supabase/
  schema.sql                 # Baseline şema — ÖNEMLİ: production'dan geride, tam değil (bkz. Uyarılar)
  migrations/
    0001_dual_role_wallet.sql  # Tek migration; sonrası Dashboard üzerinden yapıldı

docs/
  superpowers/
    specs/                   # Tasarım kararları
    plans/                   # Uygulama planları (delivery-time, notifications, feedback)

scripts/
  broadcast.js               # Kampanya push bildirimi (service role key, ENV'den)
```

---

## Supabase Bağlantısı

```
URL:        https://lvrbzhziayegyinkcuka.supabase.co
Project ID: lvrbzhziayegyinkcuka
Owner:      anzelpatisserie
```

### Type Güncelleme Komutu (sık çalıştır)
```bash
npx supabase gen types typescript --project-id lvrbzhziayegyinkcuka \
  > packages/shared/types/database.types.ts
```

---

## Veritabanı Tabloları

| Tablo | Açıklama |
|---|---|
| `users` | Profil + `is_customer` / `is_baker` + `wallet_balance` + `push_token` |
| `pastry_shops` | Dükkan bilgileri, konum, çalışma saatleri, sosyal medya URL'leri, Google Maps |
| `orders` | Sipariş talepleri — `is_urgent`, `delivery_time`, `customer_email`, `customer_phone` dahil |
| `offers` | Pastacıların teklifleri |
| `messages` | Sipariş bazlı mesajlaşma |
| `notifications` | Kullanıcı bildirim akışı |
| `reviews` | Tamamlanan sipariş yorumları |
| `wallet_transactions` | Pastacı cüzdan hareketleri (`offer_fee` / `top_up` / `refund`) |
| `wallet_top_up_requests` | Pastacı cüzdan yükleme talepleri (pending/approved/rejected) — **sadece Dashboard'da, schema.sql'de yok** |
| `feedbacks` | Ekran görüntülü geri bildirimler + storage bucket — **sadece Dashboard'da, schema.sql'de yok** |

### Başlıca RPC'ler
| RPC | Amaç |
|---|---|
| `place_order` | Müşteri sipariş oluşturur (`p_is_urgent`, `p_delivery_time` dahil) |
| `submit_offer(p_order_id, p_shop_id, p_price, p_message, p_estimated_days)` | Pastacı teklif verir; pending/accepted varsa `mevcut_teklif` hatası, rejected/withdrawn'ı pending'e çevirir |
| `accept_offer` | Müşteri teklifi kabul eder + diğer pending teklifler otomatik rejected + reddedilen baker'lara DB notification |
| `reject_offer` / `withdraw_offer` | Teklif yaşam döngüsü |
| `cancel_order` | Sipariş iptal + pending/accepted teklifleri rejected'e çevirir + baker'lara "⌛ Sipariş İptal Edildi" bildirimi |
| `set_order_status` | Pastacı in_progress / ready geçişleri |
| `auto_cancel_overdue_orders` | pg_cron ile her 6 saatte: teslim tarihi > 2 gün geçmiş + pending/offers_received sipariş iptal |
| `create_shop(...8 opsiyonel alan)` | Dükkan açar (çalışma saatleri, sosyal medya, Google bilgileri opsiyonel), `is_baker=true`, **UNIQUE(user_id)** |
| `add_wallet_balance` | Cüzdana TL yükler |
| `nearby_bakers` | Konum bazlı pastacı eşleşmesi |
| `nearby_orders(lat, lng, radius_km)` | Yakındaki sipariş + müşteri özeti (full_name, avatar, total/completed orders, member_days) + delivery_address |
| `get_order_offer_summary(p_order_id)` | Bir sipariş için anonim teklif özeti (price + shop rating + review_count + **is_mine**) — sadece baker'lara açık |
| `get_customer_summary_for_baker(p_order_id)` | Teklif vereceği müşterinin özeti (full_name, avatar, total/completed/cancelled orders, member_days) |
| `get_conversations` | Mesajlaşma listesi |
| `create_notification` | Bildirim oluşturma |
| `register_push_token` | Kullanıcı push token kaydı |
| `request_wallet_top_up` / `approve_wallet_top_up` | Cüzdan yükleme talebi |
| `delete_conversation` / `delete_message_for_me` | Mesaj/konuşma silme |
| `delete_account` | Hesap silme |

> **⚠️ Migration hijyeni bozulmuş:** Yukarıdaki "Dashboard-only" RPC'ler ve tablolar Supabase SQL Editor'den eklenmiş, migration dosyası yazılmamış. Sıfırdan kurulum `schema.sql` ile **mümkün değil**. Acil çözüm: `supabase db dump --schema-only` → `schema.sql`'i güncelle, migration 0002 yaz.

---

## Kullanıcı Rolleri

Aynı Supabase hesabı **hem müşteri hem pastacı** olabilir. Rol enum'u yerine iki boolean flag kullanılır.

### Müşteri (`is_customer = true` — her kayıtlı kullanıcı)
- Sipariş oluşturur (ücretsiz); acil sipariş + teslim saati belirtebilir
- Teklifleri görür ve kabul eder
- Pastacıya mesaj atar
- Tamamlanan siparişe yorum yapar
- **Pastacım** uygulamasından giriş yapar (e-posta + Google OAuth)

### Pastacı (`is_baker = true` — dükkan oluşturunca aktif)
- `create_shop` RPC ile dükkan profili açar → `is_baker = true`
- Yakındaki talepleri görür, **cüzdanından** teklif verir (fee = `serving_size × ₺5`)
- Sosyal medya URL'leri, Google Maps bağlantısı profil ekranından düzenlenir
- Müşteriyle mesajlaşır, siparişlerini yönetir
- **Pastacım Pro** uygulamasından giriş yapar (giriş ekranında dükkan yoksa `setup` ekranına yönlendirilir)

---

## Özel Özellikler

### Pastacı Cüzdanı
- `users.wallet_balance NUMERIC(10,2)` — TL bakiye
- Teklif ücreti `submit_offer` RPC içinde otomatik düşülür
- Hareket kaydı: `wallet_transactions` (`offer_fee` / `top_up` / `refund`)
- `wallet_top_up_requests` tablosu mevcut; cüzdan yükleme akışı var (havale referans kodu sistemi)
- **Stripe/ödeme gateway entegrasyonu henüz yok** — Apple IAP politikası (3.1.1) ile çakışma riski, submit öncesi netleştirilmeli

### Konum Bazlı Eşleşme
- `nearby_bakers(lat, lng, radius_km)` ve `nearby_orders(lat, lng, radius_km)` PostgreSQL fonksiyonları
- Sipariş oluştururken arama yarıçapı gönderiliyor (şu an hardcoded 20km; UI slider henüz eklenmedi)

### Google OAuth
- `expo-auth-session` + `expo-web-browser` ile web-based OAuth flow
- Android: `google-services.json` ile FCM entegrasyonu mevcut (native Google Sign-In değil, webview-based)
- iOS: `GoogleService-Info.plist` **yok** — Firebase native entegrasyonu yok; auth çalışıyor ama Analytics/Crashlytics için eklenmeli

### Push Bildirimleri
- `useNotifications` hook her iki app'te push token'ı `register_push_token` RPC ile kaydeder
- `notifications.ts`'teki `navigateFromNotification` uygulama açılınca ilgili ekrana yönlendirir
- iOS entitlement (`aps-environment: production`) + `UIBackgroundModes: ["remote-notification"]` ✓ var
- `keychain-access-groups` entitlement ✓ var (expo-secure-store ve expo-notifications için iOS 26'da zorunlu)
- **Çalışması için**: Expo dashboard'da APNs Auth Key (p8) eklenmiş olmalı + Apple Developer'da bundle ID'ler için Push capability açık olmalı

### Açılış Animasyonu (SplashAnimation)
- `packages/shared/components/SplashAnimation.tsx` — her iki app'in root layout'unda kullanılır
- Kadife pembe arka plan → altın çizgi çizilir → pasta (tabak+gövde+krema) adım adım belirir → mumlar yanar + alev titrer → ✨ pırıltılar → "Pastacım" / "Pastacım Pro" + slogan fade-in → fade-out (~3.5sn)
- `useRef`-gated `useEffect` ile bir-defa-tetiklenir (re-mount koruması)

### Admin: Geri Bildirim Görüntüleyici
- `packages/shared/components/FeedbacksAdminScreen.tsx` — sadece `anzelpatisserie@gmail.com` görür
- Her iki app'te Profile > Hesap Ayarları altında 📬 link
- Filtre: Tümü / Müşteri / Pastacı; ekran görüntüsü modal
- RLS: feedbacks SELECT için admin email kontrolü + storage `feedbacks` bucket SELECT izni

### Geri Bildirim
- `FeedbackModal` ile ekran görüntüsü + metin gönderimi
- `feedbacks` Supabase tablosu ve storage bucket mevcut (Dashboard'da)
- `expo-image-picker` `MediaTypeOptions.Images` deprecated — `MediaType.Images`'a güncellenmeli

---

## ⚠️ Açık Sorunlar

### ✅ Çözülenler (App Store submit öncesi)
- ~~iOS push entitlement~~ — `aps-environment: production` + `UIBackgroundModes: remote-notification` + `keychain-access-groups` eklendi
- ~~Hesap silme akışı~~ — Profile > Hesap Ayarları'nda Hesabımı Sil (delete_account RPC)
- ~~Şifremi unuttum butonu~~ — `resetPasswordForEmail` ile çalışır, app-spesifik redirect URL
- ~~Auth e-posta doğrulama bypass~~ — `mailer_autoconfirm: false` Supabase'de + client-side fallback signOut
- ~~Privacy Policy URL / Terms of Use~~ — Edge function olarak deploy edildi
- ~~iOS Info.plist izin metinleri Türkçe~~ — Tamam
- ~~Google Places API key hardcode (baker)~~ — `app.json` extra'ya taşındı (commit 01948a5)
- ~~Supabase URL hardcoded fallback (supabase.ts)~~ — Sadece `Constants.expoConfig.extra`'dan okur, yoksa throw

### Kalan kritik
1. **Baker IBAN sahte**: `TR00 0000...` hardcoded — gerçek banka bilgisi gerekli
2. **Google Places API key (customer)**: Hâlâ baker'da `app.json` extra'da; customer'da kullanılıyorsa da kontrol edilmeli
3. **`schema.sql` production'dan geride** — staging kurulumuyla birlikte tazelenecek (plan task 4)
4. **Ödeme entegrasyonu yok**: Stripe / Apple IAP yok — wallet TL yükleme manuel (havale referans kodu); Apple IAP politikası (3.1.1) review'de takılırsa düşünülmeli

---

## Geliştirme Kuralları

1. **Tüm UI Türkçe** — hata mesajları, label'lar, placeholder'lar, Info.plist metinleri.
2. **TypeScript strict mode** — `any` yasak; tipleri `@pastacim/shared`'dan çek. (`_db: any` pattern'i tip eksikliğinden dolayı geçici olarak var; `supabase gen types` sonrası temizlenmeli.)
3. **Paylaşılan kod `packages/shared`'a** — iki uygulama da kullanıyorsa orada yaşar. Tek uygulamaya özelse `apps/<app>/hooks/` altında.
4. **Error handling** — try/catch + kullanıcıya Türkçe hata mesajı.
5. **Loading state** — her async işlemde göstergesi olsun.
6. **Supabase sorgularında** her zaman `.select()` ile gerekli kolonları belirt.
7. **RLS aktif** — client-side filtreleme yapma, DB'ye güven.
8. **Dark mode** — `useThemeColors()` hook'undan oku, `Colors` sabitlerini doğrudan kullanma.
9. **Her DB değişikliğini migration olarak yaz** — Dashboard SQL Editor'ı bypass olarak kullanma.
10. **`supabase gen types`'i sık çalıştır** — özellikle yeni tablo/RPC sonrası.

---

## Önemli Komutlar

```bash
# Geliştirme sunucusu (root'tan)
npm run customer    # Pastacım (müşteri)
npm run baker       # Pastacım Pro (pastacı)

# Test
npm test

# TypeScript kontrolü
cd apps/customer && npx tsc --noEmit
cd apps/baker    && npx tsc --noEmit
npm run tsc:shared

# Supabase type güncelleme (sık çalıştır)
npx supabase gen types typescript --project-id lvrbzhziayegyinkcuka \
  > packages/shared/types/database.types.ts

# EAS build (her app kendi klasöründen)
cd apps/customer && eas build --profile production --platform all
cd apps/baker    && eas build --profile production --platform all

# OTA güncelleme
cd apps/customer && eas update --branch main --message "..."
cd apps/baker    && eas update --branch main --message "..."

# Kampanya bildirimi (service role)
node scripts/broadcast.js
```

---

## EAS Build Profilleri (her app'te aynı yapı)

| Profil | Açıklama |
|---|---|
| `development` | Internal dist, `developmentClient: true` — Metro'ya bağlanır |
| `preview` | Internal dist, release build (OTA test eder) |
| `production` | Store submission; `autoIncrement: true` |

> **Not:** `submit.production` her iki `eas.json`'da boş — Apple ASC API key ve Google Play service account JSON ilk submit öncesi eklenmeli.

---

## App Store Durumu (2026-06-10 sabahı submit, review sürecinde)

| Gereksinim | Customer | Baker | Durum |
|---|---|---|---|
| iOS push entitlement | ✅ | ✅ | `aps-environment: production` + UIBackgroundModes |
| Privacy Policy URL | ✅ | ✅ | Edge function deployed |
| Terms of Use URL | ✅ | ✅ | Edge function deployed |
| Info.plist Türkçe izin metni | ✅ | ✅ | Tamam |
| Hesap silme akışı | ✅ | ✅ | `delete_account` RPC + Profile UI |
| Screenshot setleri | ✅ | ✅ | Yüklendi |
| App Store açıklaması TR | ✅ | ✅ | Yüklendi |
| EAS submit.production config | ✅ | ✅ | iOS dolduruldu |
| App icon (1024x1024) | ✅ | ✅ | Tamam |
| Bundle ID / Package | ✅ | ✅ | Tamam |
| **Apple review** | ⏳ | ⏳ | İnceleme bekliyor |

---

## Staging Ortamı (2026-06-10 itibarıyla kuruluyor)

Live'a geçildikten sonra yeni feature'lar staging'de test edilip prod'a geçirilir. Detay: `docs/staging-workflow.md`, tasarım: `docs/superpowers/specs/2026-06-10-staging-environment-design.md`.

| | Production | Staging |
|---|---|---|
| Supabase projesi | `lvrbzhziayegyinkcuka` | `pastacim-staging` (kuruluyor) |
| Customer bundle ID | `com.pastacim.customer` | `com.pastacim.customer.staging` |
| Baker bundle ID | `com.pastacim.baker` | `com.pastacim.baker.staging` |
| Scheme | `pastacim` / `pastacim-pro` | `pastacim-staging` / `pastacim-pro-staging` |
| Dağıtım | App Store + Play Store | TestFlight Internal |
| EAS channel | `production` | `staging` |

**Branch stratejisi:** Trunk-based. `main` her zaman prod-ready. Feature branch → staging'de test → PR → squash merge.

**Komutlar:**
```bash
# Staging Supabase'e bağlı lokal dev
APP_ENV=staging npm run customer
APP_ENV=staging npm run baker

# Staging build (TestFlight)
cd apps/customer && eas build --profile preview --platform ios
cd apps/baker    && eas build --profile preview --platform ios

# OTA push
eas update --channel staging --message "..."
eas update --channel production --message "..."
```

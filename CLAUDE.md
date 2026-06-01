# Pastacım — Geliştirici Rehberi

## Proje Özeti
Armut.com benzeri, yalnızca pasta / börek / tatlı üzerine kurulu bir Türk marketplace uygulaması.
- Müşteri sipariş oluşturur → pastacılar teklif verir → müşteri en uygun teklifi seçer
- Konum bazlı eşleşme (0–50 km slider)
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
| Routing | expo-router v4 (file-based) |
| Backend | Supabase (auth + database + storage + realtime) |
| Harita | react-native-maps + expo-location |
| Oturum | expo-secure-store (iOS Keychain / Android Keystore) |
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
    app/
      _layout.tsx            # Auth durumuna göre yönlendirme
      (auth)/                # onboarding / login / register
      (customer)/            # Tab navigator — müşteri sekmeleri
        index.tsx            # Yakındaki pastacılar
        order/create.tsx     # Yeni sipariş
        order/[id].tsx       # Sipariş detayı
        offers/[orderId].tsx # Gelen teklifler
        my-orders.tsx        # Aktif & geçmiş siparişler
        baker/[shopId].tsx   # Pastacı dükkan profili
        review/[orderId].tsx # Yorum
      messages/[conversationId].tsx
  baker/                     # Pastacım Pro — pastacı uygulaması
    app.json
    eas.json
    google-services.json
    app/
      _layout.tsx
      (auth)/                # onboarding / login / register / setup
      (baker)/               # Tab navigator — pastacı sekmeleri
        index.tsx            # Yakındaki sipariş talepleri
        profile.tsx          # Dükkan profili
        offer/[orderId].tsx  # Teklif ver
        my-orders.tsx        # Kabul edilen siparişler
        wallet.tsx           # Cüzdan & hareketler
      messages/[conversationId].tsx

packages/
  shared/                    # @pastacim/shared — her iki uygulama kullanır
    index.ts                 # public exports
    lib/
      supabase.ts            # Tek client + typed RPC wrapper'ları
      constants.ts           # Renkler, tema, ölçüler, sabitler
      notifications.ts       # Push & in-app bildirim helper'ları
    hooks/
      useAuth.ts             # Session + profil + isCustomer / isBaker
    components/
      NotificationsScreen.tsx
    types/
      database.types.ts      # Supabase auto-gen tipler

supabase/
  schema.sql                 # Baseline şema (sıfırdan kurulum)
  migrations/                # Tarih sıralı, additive migration'lar
    0001_dual_role_wallet.sql

docs/
  superpowers/
    specs/                   # Tasarım kararları
    plans/                   # Uygulama planları

scripts/
  broadcast.js               # Kampanya push bildirimi (service role)
```

---

## Supabase Bağlantısı

```
URL:        https://lvrbzhziayegyinkcuka.supabase.co
Project ID: lvrbzhziayegyinkcuka
```

### Type Güncelleme Komutu
```bash
npx supabase gen types typescript --project-id lvrbzhziayegyinkcuka \
  > packages/shared/types/database.types.ts
```

---

## Veritabanı Tabloları

| Tablo | Açıklama |
|---|---|
| `users` | Profil bilgileri + `is_customer` / `is_baker` flag + `wallet_balance` (auth.users'a bağlı) |
| `pastry_shops` | Pastacı dükkanı bilgileri, konum, çalışma saatleri |
| `orders` | Müşteri sipariş talepleri |
| `offers` | Pastacıların teklifleri |
| `messages` | Sipariş bazlı mesajlaşma |
| `notifications` | Kullanıcı bildirim akışı |
| `reviews` | Tamamlanan sipariş yorumları |
| `wallet_transactions` | Pastacı cüzdan hareketleri (`offer_fee` / `top_up` / `refund`) |

### Başlıca RPC'ler
| RPC | Amaç |
|---|---|
| `place_order` | Müşteri sipariş oluşturur |
| `submit_offer` | Pastacı cüzdandan ücret düşerek teklif verir (`serving_size × ₺5`) |
| `accept_offer` / `reject_offer` / `withdraw_offer` | Teklif yaşam döngüsü |
| `cancel_order` / `set_order_status` | Sipariş yönetimi |
| `create_shop` | Dükkan açar, `is_baker = true` yapar |
| `add_wallet_balance` | Cüzdana TL yükler |
| `nearby_bakers` / `nearby_orders` | Konum bazlı eşleşme |
| `get_conversations` | Mesajlaşma listesi |
| `create_notification` | Bildirim oluşturma |

---

## Kullanıcı Rolleri

Aynı Supabase hesabı **hem müşteri hem pastacı** olabilir. Rol enum'u yerine iki boolean flag kullanılır.

### Müşteri (`is_customer = true` — her kayıtlı kullanıcı)
- Sipariş oluşturur (ücretsiz)
- Teklifleri görür ve kabul eder
- Pastacıya mesaj atar
- Tamamlanan siparişe yorum yapar
- **Pastacım** uygulamasından giriş yapar

### Pastacı (`is_baker = true` — dükkan oluşturunca aktif)
- `create_shop` RPC ile dükkan profili açar → `is_baker = true`
- Yakındaki talepleri görür, **cüzdanından** teklif verir (fee = `serving_size × ₺5`)
- Müşteriyle mesajlaşır, siparişlerini yönetir
- **Pastacım Pro** uygulamasından giriş yapar (giriş ekranında dükkan yoksa `setup` ekranına yönlendirilir)

---

## Özel Özellikler

### Pastacı Cüzdanı
- `users.wallet_balance NUMERIC(10,2)` — TL bakiye
- Teklif ücreti `submit_offer` RPC içinde otomatik düşülür
- Hareket kaydı: `wallet_transactions` (`offer_fee` / `top_up` / `refund`)
- Stripe yükleme — ileride eklenecek

### Konum Bazlı Eşleşme
- `nearby_bakers(lat, lng, radius_km)` ve `nearby_orders(lat, lng, radius_km)` PostgreSQL fonksiyonları
- Müşteri sipariş oluştururken konum + arama yarıçapı ekler
- Yalnızca belirlenen km içindeki pastacılar talebi görür

---

## Geliştirme Kuralları

1. **Tüm UI Türkçe** — hata mesajları, label'lar, placeholder'lar.
2. **TypeScript strict mode** — `any` yasak; tipleri `@pastacim/shared`'dan çek.
3. **Paylaşılan kod `packages/shared`'a** — iki uygulama da kullanıyorsa orada yaşar. Tek uygulamaya özelse `apps/<app>/app/` veya `apps/<app>/hooks/` altında.
4. **Error handling** — try/catch + kullanıcıya Türkçe hata mesajı.
5. **Loading state** — her async işlemde göstergesi olsun.
6. **Supabase sorgularında** her zaman `.select()` ile gerekli kolonları belirt.
7. **RLS aktif** — client-side filtreleme yapma, DB'ye güven.
8. **Dark mode** — `useThemeColors()` hook'undan oku, `Colors` sabitlerini doğrudan kullanma.

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

# Supabase type güncelleme
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

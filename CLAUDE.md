# Pastacım — Geliştirici Rehberi

## Proje Özeti
Armut.com benzeri, yalnızca pasta/börek/tatlı üzerine kurulu bir Türk marketplace uygulaması.
- Müşteri sipariş oluşturur → pastacılar teklif verir → müşteri en uygun teklifi seçer
- Konum bazlı eşleşme (0–50 km slider)

---

## Teknik Stack

| Katman | Teknoloji |
|---|---|
| Framework | Expo SDK 56 + React Native + TypeScript (strict) |
| Routing | expo-router v4 (file-based) |
| Backend | Supabase (auth + database + storage + realtime) |
| Harita | react-native-maps + expo-location |
| Oturum | expo-secure-store (iOS Keychain / Android Keystore) |
| Hedef | iOS + Android + Web |

---

## Klasör Yapısı

```
app/                     # expo-router sayfaları
  _layout.tsx            # Root: auth durumuna göre yönlendirme
  index.tsx              # → (auth)/onboarding veya (customer)/(baker)
  (auth)/                # Giriş yapılmamış kullanıcılar
    onboarding.tsx
    login.tsx
    register.tsx
  (customer)/            # Tab navigator — müşteri
    index.tsx            # Yakındaki pastacılar
    order/create.tsx     # Yeni sipariş
    order/[id].tsx       # Sipariş detayı
    offers/[orderId].tsx # Gelen teklifler
    my-orders.tsx        # Aktif & geçmiş siparişler
  (baker)/               # Tab navigator — pastacı
    index.tsx            # Gelen talepler
    profile.tsx          # Dükkan profili
    offer/[orderId].tsx  # Teklif ver
    my-orders.tsx        # Kabul edilen siparişler
  messages/[id].tsx      # Mesajlaşma

components/
  ui/                    # Button, Input, Card, Badge, Avatar, LoadingSkeleton
  auth/                  # RoleSelector
  customer/              # BakerCard, OrderCard, OfferCard
  baker/                 # RequestCard, ProfileEditor

hooks/
  useAuth.ts             # Supabase session + rol yönetimi (isBaker / isCustomer)
  useLocation.ts         # expo-location wrapper
  useSupabase.ts         # Genel Supabase query hook'ları

lib/
  supabase.ts            # Supabase client (tek instance)
  constants.ts           # Renkler, ölçüler, sabitler

types/
  database.types.ts      # Supabase auto-gen (veya manuel) tipler
  app.types.ts           # UI-layer özel tipler

supabase/
  schema.sql             # Tüm tablolar + RLS + trigger + fonksiyonlar
```

---

## Supabase Bağlantısı

```
URL:  https://lvrbzhziayegyinkcuka.supabase.co
Proje ID: lvrbzhziayegyinkcuka
```

### Type Güncelleme Komutu
```bash
npx supabase gen types typescript --project-id lvrbzhziayegyinkcuka > types/database.types.ts
```

---

## Veritabanı Tabloları

| Tablo | Açıklama |
|---|---|
| `users` | Profil bilgileri + is_customer / is_baker flag + wallet_balance (auth.users'a bağlı) |
| `pastry_shops` | Pastacı dükkanı bilgileri, konum, çalışma saatleri |
| `orders` | Müşteri sipariş talepleri |
| `offers` | Pastacıların teklifleri |
| `messages` | Sipariş bazlı mesajlaşma |
| `reviews` | Tamamlanan sipariş yorumları |
| `wallet_transactions` | Pastacı cüzdan hareketleri (offer_fee / top_up / refund) |

---

## Kullanıcı Rolleri

Aynı hesap hem müşteri hem pastacı olabilir. Rol enum'u kaldırıldı; iki boolean flag kullanılır.

### Müşteri (`is_customer = true` — her kayıtlı kullanıcı)
- Sipariş oluşturur (ücretsiz)
- Teklifleri görür ve kabul eder
- Pastacıya mesaj atar
- Tamamlanan siparişe yorum yapar

### Pastacı (`is_baker = true` — dükkan oluşturunca aktif)
- Dükkan profili oluşturur (create_shop RPC → is_baker = true)
- Yakınındaki sipariş taleplerine **cüzdanından** teklif verir (fee = kişi_sayısı × ₺5)
- Müşteriye mesaj atar
- Aktif siparişlerini yönetir

---

## Özel Özellikler

### Pastacı Cüzdanı
- `users.wallet_balance NUMERIC(10,2)` — TL bakiye
- Teklif başına düşen ücret: `serving_size × ₺5` (`submit_offer` RPC içinde)
- Hareket kaydı: `wallet_transactions` tablosu (`offer_fee` / `top_up` / `refund`)
- Stripe ile cüzdan yükleme — ileride eklenecek

### Konum Bazlı Eşleşme
- `nearby_bakers(lat, lng, radius_km)` PostgreSQL fonksiyonu
- Müşteri sipariş oluştururken konumunu ekler
- Yalnızca belirlenen km içindeki pastacılar talebi görür

---

## Geliştirme Kuralları

1. **Tüm UI Türkçe** — hata mesajları, label'lar, placeholder'lar
2. **TypeScript strict mode** — `any` yasak, her zaman tip tanımla
3. **Error handling** — try/catch + kullanıcıya Türkçe hata mesajı
4. **Loading state** — her async işlemde `isLoading` state'i göster
5. **Component'lar** `/components` altında, ekranlar `/app` altında
6. **Supabase sorguları** her zaman `.select()` ile gerekli kolonları belirt
7. **RLS aktif** — client-side filtering yapma, DB'ye güven
8. **Dark mode** — her component'ta `dark:` class'ları ekle

---

## Önemli Komutlar

```bash
# Geliştirme sunucusu
npx expo start

# iOS simülatör
npx expo run:ios

# Android emülatör
npx expo run:android

# Supabase type güncelleme
npx supabase gen types typescript --project-id lvrbzhziayegyinkcuka > types/database.types.ts

# TypeScript kontrolü
npx tsc --noEmit
```

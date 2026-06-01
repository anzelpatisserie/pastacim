# Pastacım — İki Uygulamaya Bölme & App Store Hazırlık

**Tarih:** 2026-05-28  
**Durum:** Uygulandı (2026-05-31). Monorepo (`apps/customer` + `apps/baker` + `packages/shared`), dual role + wallet şeması, EAS build profilleri ve test altyapısı kuruldu. Açık kalan tek iş App Store Connect asset yüklemesi ve TestFlight gönderimi.

---

## Amaç

Tek Expo projesindeki müşteri ve pastacı deneyimini iki bağımsız App Store uygulamasına ayırmak; test altyapısını kurmak; App Store inceleme sürecine hazır hale getirmek.

---

## Uygulama Kimlikleri

| | Müşteri | Pastacı |
|---|---|---|
| **Ad** | Pastacım | Pastacım Pro |
| **Bundle ID (iOS)** | `com.pastacim.customer` | `com.pastacim.baker` |
| **Android Package** | `com.pastacim.customer` | `com.pastacim.baker` |
| **Backend** | Aynı Supabase projesi | Aynı Supabase projesi |

---

## İş Modeli (Güncel)

- **Müşteri:** Tamamen ücretsiz. Sipariş oluşturmak için hiçbir ücret ödemez. Jeton/bakiye kavramı yoktur.
- **Pastacı:** Cüzdanı (wallet) vardır. Teklif verirken cüzdanından `kişi_sayısı × ₺5` düşer.
- **Stripe:** İleride pastacıların cüzdana TL yüklemesi için eklenecek (bu spec kapsamı dışı).

---

## Bölüm 1 — Monorepo Yapısı

npm workspaces kullanılır. Mevcut repo root olarak kalır.

```
pastacim/
  apps/
    customer/                    "Pastacım" uygulaması
      app/
        _layout.tsx              Sadeleştirilmiş — sadece customer navigator
        (auth)/                  @pastacim/shared'den bileşen import eden sarmalayıcılar
        (customer)/              Mevcut ekranlar taşınır
        messages/[id].tsx        Shared bileşen sarmalayıcısı
      assets/                    Müşteri ikonları ve splash
      app.json
      package.json
      eas.json
      babel.config.js
      tsconfig.json

    baker/                       "Pastacım Pro" uygulaması
      app/
        _layout.tsx
        (auth)/
        (baker)/
        messages/[id].tsx
      assets/
      app.json
      package.json
      eas.json
      babel.config.js
      tsconfig.json

  packages/
    shared/                      @pastacim/shared paketi
      lib/
        supabase.ts
        constants.ts
        notifications.ts
      hooks/
        useAuth.ts
        useNotifications.ts
        useUnreadMessages.ts
      types/
        database.types.ts
        app.types.ts
      components/
        ui/
        NotificationsScreen.tsx
      package.json
      tsconfig.json

  supabase/                      Root'ta kalır (tek backend)
  docs/
  package.json                   workspaces: ["apps/*", "packages/*"]
  tsconfig.json                  Base TypeScript config
```

### Paylaşılan Ekranlar

Expo Router ekran dosyaları `app/` altında olmak zorunda olduğundan `(auth)/` ve `messages/` ekranları her uygulamada birer ince sarmalayıcı dosyası olur; asıl bileşen `@pastacim/shared`'den import edilir.

### `_layout.tsx` Sadeleşmesi

Mevcut root `_layout.tsx` rol kontrolü yapıyor ve iki navigator içeriyor. Bölünmüş uygulamalarda her `_layout.tsx` yalnızca kendi navigatorunu barındırır; `isAuthenticated` kontrolü → `/(auth)/onboarding`, aksi halde ana ekran.

---

## Bölüm 2 — EAS Yapılandırması & Uzak Test

### EAS Development Build Nedir?

Expo Go uygulaması yalnızca aynı WiFi ağında çalışır çünkü geliştirme sunucusuna lokal IP üzerinden bağlanır. **EAS Development Build** ise Expo Cloud'da derlenen gerçek bir `.ipa` dosyasıdır:

- TestFlight üzerinden dağıtılır
- Dış testçiler internet olan her yerden yükleyebilir
- WiFi bağımlılığı tamamen ortadan kalkar
- Üretim yapılandırmasına yakın çalışır (push bildirim, konum vs. gerçek davranır)

### Profiller

Her uygulamada üç EAS profili:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  }
}
```

- `development` → geliştirici ve dış test (TestFlight internal)
- `preview` → TestFlight external test (App Store öncesi)
- `production` → App Store gönderimi

### Build Komutları

```bash
# Müşteri uygulaması dev build
cd apps/customer && eas build --profile development --platform ios

# Pastacı uygulaması dev build
cd apps/baker && eas build --profile development --platform ios
```

Build tamamlandığında EAS, TestFlight'a otomatik yükler. Dış testçiler e-posta daveti ile TestFlight'tan indirir.

### EAS Submit

```bash
cd apps/customer && eas submit --platform ios --profile production
cd apps/baker   && eas submit --platform ios --profile production
```

---

## Bölüm 3 — Veritabanı & Backend Değişiklikleri

### Çift Rol Desteği (Aynı Hesap — İki Uygulama)

Mevcut `users.role` tek değerli enum (`customer | baker`) — aynı hesabın her iki uygulamada çalışmasını engelliyor.

**Yeni yaklaşım:**

| Alan | Tip | Varsayılan | Açıklama |
|---|---|---|---|
| `users.is_customer` | `BOOLEAN` | `true` | Her kayıtlı kullanıcı otomatik müşteridir |
| `users.is_baker` | `BOOLEAN` | `false` | Dükkan oluşturulduğunda `true` olur |
| `users.role` | — | **Kaldırılır** | Artık kullanılmaz |
| `user_role` enum | — | **Kaldırılır** | Artık kullanılmaz |

**Kayıt akışı:**
- `(auth)/register.tsx`'teki rol seçimi (customer / baker) **kaldırılır**
- Her yeni kullanıcı `is_customer = true`, `is_baker = false` ile oluşturulur
- Pastacım Pro'da giriş yapan kullanıcı dükkanı yoksa → dükkan oluşturma ekranına yönlendirilir; dükkan oluşturulunca `is_baker = true` yapılır

**İki uygulama davranışı:**

| Uygulama | Giriş yapan kullanıcı | Davranış |
|---|---|---|
| Pastacım | Herhangi biri | Müşteri ekranına gider |
| Pastacım Pro | Dükkanı var (`is_baker = true`) | Pastacı ekranına gider |
| Pastacım Pro | Dükkanı yok (`is_baker = false`) | Dükkan oluşturma ekranına yönlendirilir |

**`_layout.tsx` yönlendirme mantığı (baker app):**
```
isAuthenticated = false → /(auth)/onboarding
isAuthenticated = true, is_baker = false → /(baker)/setup (yeni dükkan kurulum ekranı)
isAuthenticated = true, is_baker = true  → /(baker) ana ekran
```

### Tablo Değişiklikleri

| Mevcut | Yeni | Açıklama |
|---|---|---|
| `users.role user_role` | `users.is_customer BOOLEAN`, `users.is_baker BOOLEAN` | Rol mantığı iki flag'e ayrılır |
| `users.token_balance INTEGER` | `users.wallet_balance NUMERIC(10,2)` | Sadece pastacı kullanır |
| `token_transactions` | `wallet_transactions` | Yeniden adlandırılır |
| `token_type` enum | `wallet_transaction_type` enum | `offer_fee`, `top_up`, `refund` |

### RLS Politika Güncellemeleri

`role = 'baker'` kontrolü → `is_baker = true` veya `EXISTS (SELECT 1 FROM pastry_shops WHERE user_id = auth.uid())` ile değiştirilir.

### Trigger Değişiklikleri

- `handle_new_user`: `is_customer = true`, `is_baker = false` ile profil oluşturur; jeton/bakiye başlatmaz
- Dükkan oluşturma RPC: `INSERT INTO pastry_shops` + `UPDATE users SET is_baker = true`
- `wallet_balance` `users` tablosunda kalır; Supabase kolon düzeyinde RLS desteklemez. Güvenlik client tarafında sağlanır: müşteri uygulaması `wallet_balance` alanını hiçbir zaman sorgulamaz veya göstermez.

### Yeni / Güncellenen RPC

```sql
-- Teklif verme (bakiye kontrolü dahil)
submit_offer(order_id, price, message, estimated_days)
  fee := (SELECT serving_size FROM orders WHERE id = order_id) * 5
  IF wallet_balance < fee THEN
    RAISE EXCEPTION 'yetersiz_bakiye'
  END IF
  INSERT INTO offers ...
  UPDATE users SET wallet_balance = wallet_balance - fee
  INSERT INTO wallet_transactions (type='offer_fee', amount=-fee)

-- Stripe (ileride — bu spec kapsamı dışı)
top_up_wallet(amount_tl)
```

---

## Bölüm 4 — Test Stratejisi

### Katman 1 — TypeScript

```bash
npx tsc --noEmit
```

Mevcut `any` kullanımları temizlenir. CI'da zorunlu geçiş koşulu.

### Katman 2 — Unit / Entegrasyon (Jest + React Native Testing Library)

**`packages/shared/__tests__/`**

| Dosya | Kapsam |
|---|---|
| `useAuth.test.ts` | signIn, signUp, signOut, profil yükleme |
| `useUnreadMessages.test.ts` | okunmamış sayım, realtime güncelleme |
| `useNotifications.test.ts` | push token kayıt, izin akışı |

**`apps/baker/__tests__/`**

| Dosya | Kapsam |
|---|---|
| `offerSubmit.test.ts` | bakiye yeterli → teklif gönderilir |
| `offerSubmit.test.ts` | bakiye yetersiz → Türkçe hata gösterilir |
| `wallet.test.ts` | bakiye doğru gösterilir |

**`apps/customer/__tests__/`**

| Dosya | Kapsam |
|---|---|
| `orderCreate.test.ts` | form validasyon, kişi sayısı zorunlu |
| `offerList.test.ts` | teklif sıralama, kabul butonu akışı |

### Katman 3 — E2E (Maestro)

Maestro seçildi çünkü Expo ile sıfır native yapılandırma gerektirir.

```
flows/
  customer-login.yaml
  customer-create-order.yaml
  baker-check-wallet.yaml
  baker-submit-offer.yaml
  accept-offer.yaml
  messaging.yaml
```

TestFlight'a yüklemeden önce tüm Maestro akışları geçmeli.

---

## Bölüm 5 — App Store Hazırlık

### Apple Zorunlulukları

| Gereksinim | Yapılacak |
|---|---|
| Gizlilik Politikası URL | `https://pastacim.com/gizlilik` — basit statik sayfa |
| İkon 1024×1024 PNG | Her uygulama için ayrı tasarım |
| Ekran görüntüleri | 6.5" + 5.5" iPhone (iPad opsiyonel) |
| Uygulama açıklaması | TR + EN |
| Age Rating | 4+ |
| APNs sertifikası | Her uygulama için ayrı (EAS otomatik yönetir) |

### Gizlilik Politikası İçeriği (Zorunlu Maddeler)

- Konum verisi (sipariş ve eşleşme için kullanılır)
- Push bildirimleri
- Supabase'de saklanan kişisel veriler (e-posta, ad)
- Üçüncü taraf: Supabase (ABD sunucuları)

---

## Bölüm 6 — Uygulama Fazları

| Faz | Kapsam | Bağımlılık |
|---|---|---|
| **Faz 0** | EAS dev build + TestFlight dağıtımı | Yok — ilk yapılacak |
| **Faz 1** | Monorepo kurulumu (workspaces, shared paket) | Yok |
| **Faz 2a** | Kod taşıma — customer uygulaması | Faz 1 |
| **Faz 2b** | Kod taşıma — baker uygulaması | Faz 1 (2a ile paralel) |
| **Faz 3** | DB & backend refactor (çift rol + wallet): `role` → `is_customer/is_baker`; `token_balance` → `wallet_balance`; RLS güncelleme; kayıt ekranından rol seçimi kaldırma | Faz 1 |
| **Faz 4** | App.json + EAS production yapılandırması | Faz 2a + 2b |
| **Faz 5a** | Test altyapısı — shared hooks | Faz 1 |
| **Faz 5b** | Test — customer ekranları | Faz 2a + 5a (paralel) |
| **Faz 5c** | Test — baker ekranları | Faz 2b + 5a (paralel) |
| **Faz 6** | TypeScript kalite geçişi (`any` temizleme) | Faz 2a + 2b |
| **Faz 7** | App Store hazırlık (ikon, ekran görüntüsü, metin) | Faz 4 |
| **Faz 8** | TestFlight external → App Store gönderimi | Tüm fazlar |

### Paralel Subagent Dağılımı

```
subagent-0   Faz 0  EAS dev build + TestFlight
subagent-1   Faz 1  Monorepo kurulumu
─── Faz 1 tamamlandıktan sonra ───────────────────────────
subagent-2   Faz 2a Customer kod taşıma     ┐ paralel
subagent-3   Faz 2b Baker kod taşıma        ┘
subagent-4   Faz 3  DB & backend refactor
─── Faz 2a + 2b tamamlandıktan sonra ────────────────────
subagent-5   Faz 4  App yapılandırması
subagent-6   Faz 5a Shared test altyapısı
─── Faz 5a tamamlandıktan sonra ─────────────────────────
subagent-7   Faz 5b Customer testleri       ┐ paralel
subagent-8   Faz 5c Baker testleri          ┘
subagent-9   Faz 6  TypeScript kalite geçişi
─── Tüm testler yeşil ───────────────────────────────────
subagent-10  Faz 7  App Store hazırlık
subagent-11  Faz 8  TestFlight → App Store
```

---

## Kapsam Dışı (Bu Spec)

- Stripe ödeme entegrasyonu
- Android Play Store gönderimi
- Admin paneli
- Yeni özellik ekleme

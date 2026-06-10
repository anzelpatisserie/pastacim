# Pastacım — Staging Ortam Tasarımı

**Tarih:** 2026-06-10
**Durum:** Onaylandı, implementation plan'a hazır
**Bağlam:** App Store'a 2026-06-10 sabahı submit edildi (review sürecinde). Bundan sonra eklenecek özellikler (örn. "Kendin Yap" AI asistanı, "Hazır Pastalar" son dakika fırsatları) canlıya geçmeden önce izole bir ortamda test edilmeli.

---

## 1. Amaç

Canlı kullanıcıları etkilemeden yeni özellik geliştirmek ve test etmek için izole bir staging ortamı kurmak. Hedefler:

- **DB izolasyonu:** Staging schema/data değişiklikleri prod'a sızmamalı
- **Paralel kurulum:** Geliştiricinin telefonunda prod ve staging app'leri aynı anda yan yana durmalı
- **Gerçekçi test:** TestFlight üzerinden dağıtım — gerçek cihaz, gerçek push notification, gerçek deeplink davranışı
- **Düşük overhead:** Solo dev için fazla ceremoni yok; mümkün olduğunca otomatik

## 2. Mimari

### 2.1 Supabase
- **Yeni proje:** Free tier'da `pastacim-staging` adlı ayrı bir Supabase projesi
- **Schema bootstrap:** Mevcut prod'dan `pg_dump --schema-only` ile şema export → staging'e import. RPC ve SQL function'lar şema dump'ına dahildir.
- **Edge Functions:** `supabase/functions/` altındaki kod hem prod hem staging'e ayrı ayrı deploy edilir (`--project-ref` farklı)
- **Data:** Staging'e production verisi kopyalanmaz. Manuel seed data oluşturulur (test müşterileri, test pastacılar). Bu, gerçek kullanıcıların staging'de push notification almasını da engeller (farklı push token havuzu).
- **Project ID (placeholder):** Kurulum sırasında atanacak; staging için ayrı PAT da gerekebilir

### 2.2 Environment Switching

App'ler `app.json` yerine `app.config.js` kullanır (dinamik konfig). `APP_ENV` ortam değişkenine göre değişen alanlar:

| Alan | staging | production |
|---|---|---|
| `name` | "Pastacım (Staging)" / "Pastacım Pro (Staging)" | "Pastacım" / "Pastacım Pro" |
| `ios.bundleIdentifier` | `com.pastacim.customer.staging` / `com.pastacim.baker.staging` | `com.pastacim.customer` / `com.pastacim.baker` |
| `android.package` | `.staging` suffix | mevcut |
| `scheme` | `pastacim-staging` / `pastacim-pro-staging` | `pastacim` / `pastacim-pro` |
| `extra.supabaseUrl` | staging URL | prod URL |
| `extra.supabaseAnonKey` | staging anon key | prod anon key |
| `extra.googlePlacesApiKey` | (paylaşımlı veya ayrı) | mevcut |

Env dosyaları (her app altında):
- `.env.production` — git'e commit edilebilir (anon key public)
- `.env.staging` — git'e commit edilebilir
- `.env.local` — gitignore (geliştirme overrides)

`packages/shared/lib/supabase.ts` artık hardcoded URL yerine `Constants.expoConfig.extra` üzerinden okur.

### 2.3 EAS Profilleri

Her iki app'in `eas.json`'ı şu şekilde güncellenir:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": { "APP_ENV": "staging" }
    },
    "preview": {
      "distribution": "internal",
      "env": { "APP_ENV": "staging" },
      "ios": { "simulator": false },
      "channel": "staging"
    },
    "production": {
      "autoIncrement": true,
      "env": { "APP_ENV": "production" },
      "channel": "production"
    }
  }
}
```

EAS Update channel'lar:
- `staging` → preview build'leri günceller
- `production` → store build'leri günceller

### 2.4 App Store Connect

Staging app'leri TestFlight üzerinden dağıtmak için ASC'de iki yeni app girişi açılır:
- "Pastacım Staging" — `com.pastacim.customer.staging`
- "Pastacım Pro Staging" — `com.pastacim.baker.staging`

TestFlight Internal Testing grubu (yalnızca geliştirici) — review beklemez. Bundle ID'ler için ayrı App ID'ler Apple Developer portal'da da oluşturulmalı (push notification capability ile).

### 2.5 Branch Stratejisi

Trunk-based:
```
main ──●──●──●──●──●──→ (her zaman prod-ready)
        \      /
    feature/kendin-yap (staging'de test → PR → squash merge)
```

- `main` her zaman canlıya gidebilir durumda olmalı
- Feature branch'ler kısa ömürlü; staging'de doğrulanır, PR ile merge edilir
- Hotfix akışı: feature branch ile aynı — `fix/...` prefix kullanılır

## 3. Feature Shipping Workflow (Standart)

Örnek: "Kendin Yap" butonu eklemek.

1. **Branch aç:** `git checkout -b feature/kendin-yap`
2. **Migration yaz (gerekiyorsa):** `supabase/migrations/000X_recipes.sql`
3. **Staging Supabase'e uygula:** `supabase db push` (staging projesi linkli iken)
4. **Type regenerate:** `npx supabase gen types typescript --project-id <staging-id> > packages/shared/types/database.types.ts`
5. **Kod yaz** (UI, RPC çağrıları, vs.)
6. **EAS preview build:** `cd apps/customer && eas build --profile preview --platform ios`
7. **TestFlight'a otomatik upload** (eas.json'da submit config'iyle) veya manuel
8. **Telefonda staging app'ten test et** — prod app'ine dokunmaz
9. **PR aç → review → squash merge to main**
10. **Prod Supabase'e migration uygula** (sadece şema değiştiyse)
11. **Type regenerate** (prod'dan; staging ile aynı olmalı)
12. **Prod'a deploy:**
    - Sadece JS değişikliği → `eas update --channel production` (OTA)
    - Native değişiklik → `eas build --profile production` + store submit

## 4. Migration Disiplini

Mevcut sorun: `supabase/schema.sql` prod'dan geride; RPC ve tablolar Dashboard üzerinden eklenmiş.

Staging kurulumuyla birlikte düzeltilir:
- **Baseline yenileme:** Prod'dan `pg_dump --schema-only` alıp `supabase/schema.sql`'i güncelle
- **Migration 0002+:** Bundan sonra tüm DB değişiklikleri migration dosyası ile (Dashboard yasak)
- **Sıra:** Önce staging'e uygula, test et, sonra prod'a

## 5. Risk Analizi

| Risk | Etki | Önlem |
|---|---|---|
| Push notification staging'de prod'a gider | Yanlış kullanıcıya bildirim | Ayrı APNs key veya staging build'de push fonksiyonlarını mock |
| Google Places API quota tükenir | Hem dev hem prod down | Ayrı API key (staging için ücretsiz tier yeterli) |
| Edge Functions paylaşılır | Staging değişiklik prod'u etkiler | Edge Function'ları staging projesine deploy et |
| Type drift (staging ≠ prod schema) | Build hatası | Her merge öncesi prod schema ile staging'i karşılaştır |
| TestFlight 90-gün sona erer | Staging build çalışmaz | 60 günde bir yeni preview build (gerekirse) |

## 6. Maliyet

- **Supabase:** Free tier yeterli (staging düşük trafik). $0
- **Apple Developer:** Mevcut hesap kullanılır; ek ASC app'leri ücretsiz. $0
- **EAS Build:** Mevcut plan; preview build'ler aynı kotaya dahil. $0 ek
- **Google Places API:** Free tier (10k req/ay) yeterli. $0

Toplam ek maliyet: **$0/ay**.

## 7. Out of Scope (YAGNI)

Bu spec şunları **kapsamaz**:
- CI/CD otomasyonu (GitHub Actions, otomatik test) — sonraki spec
- Automated end-to-end testing (Detox vs.) — sonraki spec
- Birden fazla staging ortamı (staging-1, staging-2) — gerek yok
- Production data sync to staging — manuel seed yeterli
- Feature flag sistemi (LaunchDarkly vs.) — gerekirse sonra

## 8. Başarı Kriterleri

Implementation tamamlandığında geliştirici şunları yapabilmeli:
- [ ] Telefonunda hem "Pastacım" hem "Pastacım (Staging)" ikonlarını yan yana görür
- [ ] Staging app'i staging Supabase'e bağlanır; prod app'i prod'a
- [ ] `eas build --profile preview` TestFlight'a yüklenir, anında install edilebilir
- [ ] Yeni feature için workflow §3'ü 30 dakikada uygulayabilir (migration + build hariç süre)
- [ ] DB migration disiplini: tüm değişiklikler `supabase/migrations/` altında

## 9. Sonraki Adımlar

1. Bu spec onaylandığında → `writing-plans` skill ile implementation plan yazılır
2. Plan adım adım uygulanır (büyük olasılıkla 2-3 oturum sürer)
3. İlk gerçek feature ("Kendin Yap" veya "Hazır Pastalar") yeni workflow ile shipped — staging'in çalıştığı doğrulanır

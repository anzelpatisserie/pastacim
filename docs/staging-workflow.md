# Staging Workflow — Yeni Feature Shipping

Pastacım'da yeni özellik eklerken kullanılacak standart akış. Detaylı tasarım: `docs/superpowers/specs/2026-06-10-staging-environment-design.md`.

## Mimari Özet

- **Ayrı Supabase projesi:** `pastacim-staging` (Free tier)
- **Ayrı bundle ID:** `com.pastacim.{customer,baker}.staging`
- **Dağıtım:** TestFlight Internal Testing
- **App config:** `app.config.js` (dinamik), `APP_ENV` env var ile geçiş
- **EAS Update channels:** `staging` / `production`
- **Branch stratejisi:** Trunk-based; feature branch → staging test → PR → squash merge

## Komut Cheatsheet

| Komut | Açıklama |
|---|---|
| `APP_ENV=staging npx expo start` | Lokal dev'de staging Supabase'e bağlı çalış |
| `cd apps/customer && eas build --profile preview --platform ios` | Staging build (TestFlight) |
| `eas submit --profile preview --platform ios --latest` | TestFlight'a yükle |
| `eas update --channel staging --message "..."` | Staging OTA push |
| `eas build --profile production --platform ios` | Prod store build |
| `eas update --channel production --message "..."` | Prod OTA push |

## Feature Ekleme Çek Listesi

Örnek: "Kendin Yap" butonu ekliyorsun.

### 1. Branch
```bash
git checkout main && git pull
git checkout -b feature/kendin-yap
```

### 2. DB değişikliği varsa
```bash
# supabase/migrations/000X_kendin_yap.sql oluştur
# Staging'e link olduğundan emin ol:
SUPABASE_ACCESS_TOKEN=<PAT> npx supabase link --project-ref <STAGING_PROJECT_ID>
SUPABASE_ACCESS_TOKEN=<PAT> npx supabase db push
```

### 3. Type regenerate
```bash
npx supabase gen types typescript --project-id <STAGING_PROJECT_ID> \
  > packages/shared/types/database.types.ts
```

### 4. Kod yaz, lokal test et
```bash
APP_ENV=staging npm run customer
# veya
APP_ENV=staging npm run baker
```

### 5. Staging build + TestFlight test
```bash
cd apps/customer
eas build --profile preview --platform ios
eas submit --profile preview --platform ios --latest
# TestFlight'tan telefonuna düşünce gerçek cihazda test et
```

Sadece JS değişikliği varsa build atlayıp OTA push edebilirsin:
```bash
eas update --channel staging --message "feat: kendin-yap UI"
```

### 6. PR + merge
```bash
git push -u origin feature/kendin-yap
gh pr create --title "feat: Kendin Yap asistanı" --body "..."
# Review → squash merge
```

### 7. Prod'a deploy

**Sadece DB değiştiyse:**
```bash
SUPABASE_ACCESS_TOKEN=<PAT> npx supabase link --project-ref lvrbzhziayegyinkcuka
SUPABASE_ACCESS_TOKEN=<PAT> npx supabase db push
npx supabase gen types typescript --project-id lvrbzhziayegyinkcuka \
  > packages/shared/types/database.types.ts
git add packages/shared/types/database.types.ts
git commit -m "chore: regenerate types from production"
```

**JS değişikliği — OTA (en hızlı, kullanıcılar saatler içinde alır):**
```bash
cd apps/customer
eas update --channel production --message "feat: Kendin Yap asistanı"
```

**Native değişiklik — yeni build (App Store review gerekir):**
```bash
cd apps/customer
eas build --profile production --platform ios
eas submit --profile production --platform ios --latest
# ASC'de manual submit for review
```

## Önemli Kurallar

- **Dashboard'da SQL yazma.** Tüm DB değişiklikleri `supabase/migrations/` altında migration olarak.
- **Önce staging, sonra prod.** Hiçbir migration prod'a önce gitmemeli.
- **Type drift kontrolü.** Her merge sonrası types regenerate edilmeli.
- **`runtimeVersion` değişirse OTA kırılır.** Native değişiklik = yeni build. JS-only = OTA güvenli.
- **APP_ENV=staging unutursan** lokal dev prod'a bağlanır — `app.config.js` default'u production.

## Sorun Giderme

**Staging app açılıyor ama Supabase auth çalışmıyor:**
- Staging Supabase → Auth → URL Configuration → `pastacim-staging://` redirect listesinde mi?
- Email confirmation `mailer_autoconfirm` ayarı prod ile aynı mı?

**TestFlight build "Invalid Bundle":**
- Apple Developer portal'da `com.pastacim.{customer,baker}.staging` App ID'leri push capability ile mi açık?
- ASC'de staging app girişleri açık mı?

**Type errors after merge:**
- `npx supabase gen types ...` çalıştırıldı mı?
- Staging ve prod schema senkron mu? Kontrol:
  ```bash
  SUPABASE_ACCESS_TOKEN=<PAT> npx supabase db diff --linked
  ```

**OTA update telefona inmiyor:**
- `runtimeVersion` build ile uyumlu mu? (`1.0.0`)
- `eas channel:view <channel>` ile son update görünüyor mu?
- App'i tamamen kapatıp tekrar aç (background'dan kaldır).

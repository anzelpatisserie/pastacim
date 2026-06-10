# Staging Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pastacım monorepo'su için izole bir staging ortamı kurmak — ayrı Supabase projesi, paralel bundle ID'li TestFlight build'leri, trunk-based feature workflow.

**Architecture:** App'ler `app.config.js` ile dinamik konfigürasyon kullanır; `APP_ENV` ortam değişkenine göre bundle ID, Supabase URL/key ve EAS Update channel değişir. Staging Supabase'i ayrı bir proje (Free tier), prod ile aynı schema. TestFlight Internal Testing ile yan yana paralel kurulum.

**Tech Stack:** Expo SDK 56, EAS Build + EAS Update, Supabase, TypeScript.

---

## File Structure

**Yeni dosyalar:**
- `apps/customer/app.config.js` (replaces `app.json`)
- `apps/baker/app.config.js` (replaces `app.json`)
- `docs/staging-workflow.md` (feature shipping cheatsheet)

**Modifiye edilecek:**
- `apps/customer/eas.json` (staging env + channels)
- `apps/baker/eas.json` (staging env + channels)
- `packages/shared/lib/supabase.ts` (remove hardcoded fallback URLs)
- `supabase/schema.sql` (baseline'ı prod'dan tazele)
- `CLAUDE.md` (post-launch + staging notları)

**Silinecek:**
- `apps/customer/app.json`
- `apps/baker/app.json`

**Manual web/CLI işleri (kod değil):**
- Supabase staging projesi oluştur
- Apple Developer staging App ID'leri
- ASC staging app girişleri

---

## Phase A — Pre-flight (Manuel Setup)

### Task 1: Staging Supabase Projesini Oluştur

**Files:** Yok (manuel web işi)

- [ ] **Step 1: Supabase Dashboard'a git**

Tarayıcıda https://supabase.com/dashboard adresine git, `anzelpatisserie` org'una geç.

- [ ] **Step 2: New Project**

"New project" → şu ayarlarla:
- Name: `pastacim-staging`
- Database password: güçlü bir şifre üret, **password manager'a kaydet**
- Region: `Frankfurt (eu-central-1)` (prod ile aynı bölge — latency tutarlı kalsın)
- Pricing: Free tier

- [ ] **Step 3: Proje açıldıktan sonra bilgileri kopyala**

Settings → API:
- Project URL: `https://XXXXXXX.supabase.co` — kaydet
- `anon` `public` key (publishable): `sb_publishable_XXXXX` — kaydet

Settings → General:
- Project ID (Reference ID): `XXXXXXX` — kaydet

- [ ] **Step 4: Bilgileri geçici scratch dosyaya not et**

`~/Desktop/pastacim-staging-secrets.txt` (gitignored konum):
```
STAGING_PROJECT_URL=https://XXXXXXX.supabase.co
STAGING_PROJECT_ID=XXXXXXX
STAGING_ANON_KEY=sb_publishable_XXXXX
STAGING_DB_PASSWORD=<saved-in-pwmanager>
```

Bu dosya sonraki task'larda referans olarak kullanılır.

- [ ] **Step 5: Commit (boş — bu task no-code)**

Bu task'ta commit yok.

---

### Task 2: Apple Developer Portal — Staging App ID'leri

**Files:** Yok (manuel web işi)

- [ ] **Step 1: Apple Developer'a giriş**

https://developer.apple.com/account → Certificates, Identifiers & Profiles → Identifiers

- [ ] **Step 2: Customer staging App ID**

"+" → App IDs → App → Continue:
- Description: `Pastacim Customer Staging`
- Bundle ID: Explicit, `com.pastacim.customer.staging`
- Capabilities: **Push Notifications** ✅, **Associated Domains** (varsa prod'da)
- Continue → Register

- [ ] **Step 3: Baker staging App ID**

Aynı şekilde:
- Description: `Pastacim Baker Staging`
- Bundle ID: `com.pastacim.baker.staging`
- Capabilities: **Push Notifications** ✅
- Register

- [ ] **Step 4: Doğrula**

Identifiers listesinde her iki staging App ID'sinin göründüğünü doğrula.

---

### Task 3: App Store Connect — Staging App Girişleri

**Files:** Yok (manuel web işi)

- [ ] **Step 1: ASC'ye giriş**

https://appstoreconnect.apple.com → Apps → "+" → New App

- [ ] **Step 2: Customer staging app**

- Platform: iOS
- Name: `Pastacim Staging` (kullanıcı tarafından görünmez, sadece TestFlight)
- Primary Language: Turkish
- Bundle ID: `com.pastacim.customer.staging` (dropdown'dan seç)
- SKU: `pastacim-customer-staging`
- User Access: Full Access

Create → açıldı.

- [ ] **Step 3: Baker staging app**

Aynı şekilde:
- Name: `Pastacim Pro Staging`
- Bundle ID: `com.pastacim.baker.staging`
- SKU: `pastacim-baker-staging`

- [ ] **Step 4: Her iki staging app'in `ascAppId` değerlerini not al**

ASC App page → App Information → Apple ID (numerik). Notlara ekle:
```
CUSTOMER_STAGING_ASC_APP_ID=XXXXXXXXXX
BAKER_STAGING_ASC_APP_ID=XXXXXXXXXX
```

---

## Phase B — DB Schema Sync

### Task 4: Prod Schema'sını Dump Et ve Baseline'ı Tazele

**Files:**
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Supabase CLI'ın login olduğundan emin ol**

```bash
supabase --version
supabase projects list
```

Eğer `not logged in` derse:
```bash
supabase login
```
(Memory'de PAT var, gerekirse oradan kullan.)

- [ ] **Step 2: Prod schema dump**

```bash
cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım
supabase db dump \
  --project-ref lvrbzhziayegyinkcuka \
  --schema public \
  -f supabase/schema.sql
```

Expected: `Dumped schema to supabase/schema.sql` veya benzeri başarı mesajı. Dosya yenisiyle değişmeli.

- [ ] **Step 3: Diff'i incele**

```bash
git diff supabase/schema.sql | head -200
```

Yeni RPC'ler, `wallet_top_up_requests`, `feedbacks` gibi Dashboard-only eklenen şeyler artık schema.sql'de olmalı.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "chore(db): refresh schema.sql baseline from production

Dashboard üzerinden eklenen RPC'ler ve tablolar (wallet_top_up_requests,
feedbacks, vb.) artık schema.sql'de. Migration disiplini tazelendi.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Staging DB'yi Bootstrap Et

**Files:** Yok (DB işi)

- [ ] **Step 1: Staging projesinin CLI link'ini kur**

```bash
cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım
supabase link --project-ref <STAGING_PROJECT_ID>
```

(Task 1'de kaydettiğin STAGING_PROJECT_ID.) Şifre sorarsa STAGING_DB_PASSWORD.

- [ ] **Step 2: Schema'yı push et**

```bash
supabase db push --include-all
```

Veya manuel:
```bash
PGPASSWORD='<STAGING_DB_PASSWORD>' psql \
  -h aws-0-eu-central-1.pooler.supabase.com \
  -p 5432 \
  -U postgres.<STAGING_PROJECT_ID> \
  -d postgres \
  -f supabase/schema.sql
```

Expected: Tüm tablolar/RPC'ler oluşturuldu, hata yok.

- [ ] **Step 3: Doğrula**

Supabase Dashboard → staging project → Table Editor: `users`, `pastry_shops`, `orders`, vb. tablolar görünmeli.

SQL Editor'de:
```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' ORDER BY routine_name;
```
Expected: `place_order`, `submit_offer`, `nearby_bakers`, vb. listelensin.

- [ ] **Step 4: Storage bucket'ları manuel oluştur (varsa)**

Schema dump storage bucket'ları içermez. Dashboard → Storage:
- `avatars` (public)
- `shop-photos` (public)
- `feedbacks` (private — sadece admin email SELECT)
- `order-photos` (varsa)

Her birinin RLS politikalarını prod'dan kopyala (Storage → Policies).

- [ ] **Step 5: Edge Functions deploy**

```bash
cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım
supabase functions deploy --project-ref <STAGING_PROJECT_ID>
```

Mevcut `privacy-policy` ve `terms-of-use` function'ları staging'e de gider.

- [ ] **Step 6: Auth ayarları**

Staging Supabase → Authentication → Providers:
- Email: enable, `mailer_autoconfirm: false` (prod ile aynı)
- Google: enable, OAuth client ID girişi (prod ile aynı veya yeni bir OAuth client)

URL allow list:
- `pastacim-staging://`
- `pastacim-pro-staging://`
- (varsa Supabase redirect URL'leri)

- [ ] **Step 7: Commit (boş — bu task no-code)**

---

## Phase C — App Config Refactor

### Task 6: Customer App — app.config.js'e Geçir

**Files:**
- Create: `apps/customer/app.config.js`
- Delete: `apps/customer/app.json`

- [ ] **Step 1: app.config.js'i yaz**

```js
// apps/customer/app.config.js
const ENV = process.env.APP_ENV ?? 'production';

const envs = {
  staging: {
    nameSuffix: ' (Staging)',
    bundleSuffix: '.staging',
    schemeSuffix: '-staging',
    supabaseUrl: process.env.STAGING_SUPABASE_URL ?? 'https://REPLACE_ME.supabase.co',
    supabaseAnonKey: process.env.STAGING_SUPABASE_ANON_KEY ?? 'REPLACE_ME',
    channel: 'staging',
  },
  production: {
    nameSuffix: '',
    bundleSuffix: '',
    schemeSuffix: '',
    supabaseUrl: 'https://lvrbzhziayegyinkcuka.supabase.co',
    supabaseAnonKey: 'sb_publishable_GRPzr4yIvnC54VpN6G7K3A_awa6OyWp',
    channel: 'production',
  },
};

const env = envs[ENV];
if (!env) throw new Error(`Unknown APP_ENV: ${ENV}`);

module.exports = {
  expo: {
    name: 'Pastacım' + env.nameSuffix,
    slug: 'pastacim-customer',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'pastacim' + env.schemeSuffix,
    userInterfaceStyle: 'automatic',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.pastacim.customer' + env.bundleSuffix,
      buildNumber: '1',
      entitlements: {
        'aps-environment': 'production',
        'keychain-access-groups': ['$(AppIdentifierPrefix)$(CFBundleIdentifier)'],
      },
      infoPlist: {
        UIBackgroundModes: ['remote-notification'],
        NSLocationWhenInUseUsageDescription: 'Pastacım yakındaki pastacıları gösterebilmek için konumunuza erişir.',
        NSLocationAlwaysAndWhenInUseUsageDescription: 'Pastacım yakındaki pastacıları gösterebilmek için konumunuza erişir.',
        NSLocationAlwaysUsageDescription: 'Pastacım yakındaki pastacıları gösterebilmek için konumunuza erişir.',
        NSCameraUsageDescription: 'Geri bildirim ekran görüntüsü veya fotoğraf için kamera erişimi gerekir.',
        NSPhotoLibraryUsageDescription: 'Sipariş veya dükkan görseli seçmek için fotoğraflarınıza erişim gerekir.',
        NSMicrophoneUsageDescription: 'Uygulama mikrofon kullanmamaktadır; sistem gerekliliği nedeniyle beyan edilmiştir.',
        NSMotionUsageDescription: 'Uygulama hareket sensörü kullanmamaktadır; sistem gerekliliği nedeniyle beyan edilmiştir.',
        LSApplicationQueriesSchemes: ['message', 'googlegmail'],
      },
    },
    android: {
      package: 'com.pastacim.customer' + env.bundleSuffix,
      versionCode: 1,
      googleServicesFile: './google-services.json',
      adaptiveIcon: {
        backgroundColor: '#000000',
        foregroundImage: './assets/images/android-icon-foreground.png',
      },
      permissions: [
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
      ],
    },
    plugins: [
      'expo-router',
      'expo-location',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          resizeMode: 'cover',
          backgroundColor: '#8B1A3D',
        },
      ],
      'expo-secure-store',
      [
        'expo-notifications',
        {
          icon: './assets/images/icon.png',
          color: '#D4526E',
          sounds: [],
        },
      ],
    ],
    updates: {
      url: 'https://u.expo.dev/d513dbc9-8da6-4051-995f-6a7a40b37586',
      enabled: true,
      fallbackToCacheTimeout: 0,
      checkAutomatically: 'ON_LOAD',
      requestHeaders: {
        'expo-channel-name': env.channel,
      },
    },
    runtimeVersion: '1.0.0',
    experiments: {
      typedRoutes: true,
    },
    extra: {
      eas: {
        projectId: 'd513dbc9-8da6-4051-995f-6a7a40b37586',
      },
      router: {
        origin: false,
      },
      supabaseUrl: env.supabaseUrl,
      supabaseAnonKey: env.supabaseAnonKey,
      appEnv: ENV,
    },
    owner: 'anzelpatisserie',
  },
};
```

**Önemli:** `REPLACE_ME` değerlerini Task 1'den aldığın `STAGING_PROJECT_URL` ve `STAGING_ANON_KEY` ile değiştir veya CI/local'de `STAGING_SUPABASE_URL` env vars set et. Solo dev için en pratik: doğrudan hardcode et (anon key public).

- [ ] **Step 2: app.json'ı sil**

```bash
rm apps/customer/app.json
```

- [ ] **Step 3: Config'i doğrula**

```bash
cd apps/customer
APP_ENV=production npx expo config --type prebuild | head -50
```

Expected: JSON çıkışı, `"name": "Pastacım"`, `"bundleIdentifier": "com.pastacim.customer"`.

```bash
APP_ENV=staging npx expo config --type prebuild | head -50
```

Expected: `"name": "Pastacım (Staging)"`, `"bundleIdentifier": "com.pastacim.customer.staging"`.

- [ ] **Step 4: Commit**

```bash
cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım
git add apps/customer/app.config.js apps/customer/app.json
git commit -m "refactor(customer): migrate app.json to dynamic app.config.js

APP_ENV ortam değişkeniyle staging/production arasında geçiş yapılır.
Bundle ID, scheme, Supabase bağlantı ve EAS update channel dinamik.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Baker App — app.config.js'e Geçir

**Files:**
- Create: `apps/baker/app.config.js`
- Delete: `apps/baker/app.json`

- [ ] **Step 1: app.config.js'i yaz**

```js
// apps/baker/app.config.js
const ENV = process.env.APP_ENV ?? 'production';

const envs = {
  staging: {
    nameSuffix: ' (Staging)',
    bundleSuffix: '.staging',
    schemeSuffix: '-staging',
    supabaseUrl: process.env.STAGING_SUPABASE_URL ?? 'https://REPLACE_ME.supabase.co',
    supabaseAnonKey: process.env.STAGING_SUPABASE_ANON_KEY ?? 'REPLACE_ME',
    channel: 'staging',
  },
  production: {
    nameSuffix: '',
    bundleSuffix: '',
    schemeSuffix: '',
    supabaseUrl: 'https://lvrbzhziayegyinkcuka.supabase.co',
    supabaseAnonKey: 'sb_publishable_GRPzr4yIvnC54VpN6G7K3A_awa6OyWp',
    channel: 'production',
  },
};

const env = envs[ENV];
if (!env) throw new Error(`Unknown APP_ENV: ${ENV}`);

module.exports = {
  expo: {
    name: 'Pastacım Pro' + env.nameSuffix,
    slug: 'pastacim-baker',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'pastacim-pro' + env.schemeSuffix,
    userInterfaceStyle: 'automatic',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.pastacim.baker' + env.bundleSuffix,
      buildNumber: '1',
      entitlements: {
        'aps-environment': 'production',
        'keychain-access-groups': ['$(AppIdentifierPrefix)$(CFBundleIdentifier)'],
      },
      infoPlist: {
        UIBackgroundModes: ['remote-notification'],
        NSLocationWhenInUseUsageDescription: 'Pastacım yakındaki pastacıları gösterebilmek için konumunuza erişir.',
        NSLocationAlwaysAndWhenInUseUsageDescription: 'Pastacım yakındaki pastacıları gösterebilmek için konumunuza erişir.',
        NSLocationAlwaysUsageDescription: 'Pastacım yakındaki pastacıları gösterebilmek için konumunuza erişir.',
        NSCameraUsageDescription: 'Geri bildirim ekran görüntüsü veya fotoğraf için kamera erişimi gerekir.',
        NSPhotoLibraryUsageDescription: 'Sipariş veya dükkan görseli seçmek için fotoğraflarınıza erişim gerekir.',
        NSMicrophoneUsageDescription: 'Uygulama mikrofon kullanmamaktadır; sistem gerekliliği nedeniyle beyan edilmiştir.',
        NSMotionUsageDescription: 'Uygulama hareket sensörü kullanmamaktadır; sistem gerekliliği nedeniyle beyan edilmiştir.',
        LSApplicationQueriesSchemes: ['message', 'googlegmail'],
      },
    },
    android: {
      package: 'com.pastacim.baker' + env.bundleSuffix,
      versionCode: 1,
      googleServicesFile: './google-services.json',
      adaptiveIcon: {
        backgroundColor: '#000000',
        foregroundImage: './assets/images/android-icon-foreground.png',
      },
      permissions: [
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
      ],
    },
    plugins: [
      'expo-router',
      'expo-location',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          resizeMode: 'cover',
          backgroundColor: '#8B1A3D',
        },
      ],
      'expo-secure-store',
      [
        'expo-notifications',
        {
          icon: './assets/images/icon.png',
          color: '#9F7AEA',
          sounds: [],
        },
      ],
    ],
    updates: {
      url: 'https://u.expo.dev/c8d3415d-5bce-4b61-95eb-fa4134a91fe7',
      enabled: true,
      fallbackToCacheTimeout: 0,
      checkAutomatically: 'ON_LOAD',
      requestHeaders: {
        'expo-channel-name': env.channel,
      },
    },
    runtimeVersion: '1.0.0',
    experiments: {
      typedRoutes: true,
    },
    extra: {
      eas: {
        projectId: 'c8d3415d-5bce-4b61-95eb-fa4134a91fe7',
      },
      router: {
        origin: false,
      },
      supabaseUrl: env.supabaseUrl,
      supabaseAnonKey: env.supabaseAnonKey,
      googlePlacesApiKey: 'AIzaSyCunYQzVUP2Ue8HraYn-PIpx6jvpSSC4Zo',
      appEnv: ENV,
    },
    owner: 'anzelpatisserie',
  },
};
```

`REPLACE_ME` değerlerini staging URL/key ile değiştir.

- [ ] **Step 2: app.json'ı sil**

```bash
rm apps/baker/app.json
```

- [ ] **Step 3: Config'i doğrula**

```bash
cd apps/baker
APP_ENV=production npx expo config --type prebuild | head -50
APP_ENV=staging npx expo config --type prebuild | head -50
```

Expected: production'da `Pastacım Pro` + `com.pastacim.baker`, staging'de `Pastacım Pro (Staging)` + `com.pastacim.baker.staging`.

- [ ] **Step 4: Commit**

```bash
cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım
git add apps/baker/app.config.js apps/baker/app.json
git commit -m "refactor(baker): migrate app.json to dynamic app.config.js

APP_ENV ortam değişkeniyle staging/production arasında geçiş yapılır.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 8: supabase.ts — Hardcoded URL'leri Temizle

**Files:**
- Modify: `packages/shared/lib/supabase.ts:7-13`

- [ ] **Step 1: Hardcoded fallback'leri kaldır, runtime error fırlat**

`packages/shared/lib/supabase.ts` dosyasında 7-13. satırları şununla değiştir:

```ts
// ─── Supabase Bağlantı Bilgileri ─────────────────────────────────────────────
const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    'Supabase config eksik. app.config.js içinde extra.supabaseUrl ve extra.supabaseAnonKey tanımlı olmalı.'
  );
}
```

- [ ] **Step 2: Type check**

```bash
cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım
npm run tsc:shared
```

Expected: Hata yok.

- [ ] **Step 3: Customer app type check**

```bash
cd apps/customer && npx tsc --noEmit
```

Expected: Hata yok.

- [ ] **Step 4: Baker app type check**

```bash
cd apps/baker && npx tsc --noEmit
```

Expected: Hata yok.

- [ ] **Step 5: Commit**

```bash
cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım
git add packages/shared/lib/supabase.ts
git commit -m "refactor(shared): remove hardcoded Supabase URL fallback

Config artık zorunlu olarak app.config.js'den okunur. Yanlış env'de
sessizce prod'a bağlanma riski ortadan kalktı.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Phase D — EAS Profile Updates

### Task 9: Customer eas.json — Staging Profile + Channels

**Files:**
- Modify: `apps/customer/eas.json`

- [ ] **Step 1: eas.json'ı tam içerikle yaz**

```json
{
  "cli": {
    "version": ">= 14.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "APP_ENV": "staging"
      },
      "channel": "staging"
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false
      },
      "env": {
        "APP_ENV": "staging"
      },
      "channel": "staging"
    },
    "production": {
      "autoIncrement": true,
      "env": {
        "APP_ENV": "production"
      },
      "channel": "production"
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "anzelpatisserie@gmail.com",
        "ascAppId": "BURAYA_APP_STORE_CONNECT_APP_ID",
        "appleTeamId": "BURAYA_APPLE_TEAM_ID"
      }
    },
    "preview": {
      "ios": {
        "appleId": "anzelpatisserie@gmail.com",
        "ascAppId": "<CUSTOMER_STAGING_ASC_APP_ID>",
        "appleTeamId": "BURAYA_APPLE_TEAM_ID"
      }
    }
  }
}
```

**`<CUSTOMER_STAGING_ASC_APP_ID>` Task 3 Step 4'te aldığın değerle değiştir.** `BURAYA_*` satırlarını (varsa) prod submit setup'ında doldur.

- [ ] **Step 2: Doğrula**

```bash
cd apps/customer
cat eas.json | python3 -m json.tool > /dev/null && echo "valid JSON"
```

Expected: `valid JSON`.

- [ ] **Step 3: Commit**

```bash
cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım
git add apps/customer/eas.json
git commit -m "feat(eas/customer): add staging profile with env + channel

development ve preview profilleri APP_ENV=staging ile staging channel'a
basar. production profili APP_ENV=production ile production channel'a basar.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 10: Baker eas.json — Staging Profile + Channels

**Files:**
- Modify: `apps/baker/eas.json`

- [ ] **Step 1: eas.json'ı tam içerikle yaz**

```json
{
  "cli": {
    "version": ">= 14.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "APP_ENV": "staging"
      },
      "channel": "staging"
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false
      },
      "env": {
        "APP_ENV": "staging"
      },
      "channel": "staging"
    },
    "production": {
      "autoIncrement": true,
      "env": {
        "APP_ENV": "production"
      },
      "channel": "production"
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "anzelpatisserie@gmail.com",
        "ascAppId": "BURAYA_APP_STORE_CONNECT_APP_ID",
        "appleTeamId": "BURAYA_APPLE_TEAM_ID"
      }
    },
    "preview": {
      "ios": {
        "appleId": "anzelpatisserie@gmail.com",
        "ascAppId": "<BAKER_STAGING_ASC_APP_ID>",
        "appleTeamId": "BURAYA_APPLE_TEAM_ID"
      }
    }
  }
}
```

`<BAKER_STAGING_ASC_APP_ID>` Task 3'ten aldığın değer.

- [ ] **Step 2: Doğrula**

```bash
cd apps/baker
cat eas.json | python3 -m json.tool > /dev/null && echo "valid JSON"
```

- [ ] **Step 3: Commit**

```bash
cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım
git add apps/baker/eas.json
git commit -m "feat(eas/baker): add staging profile with env + channel

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Phase E — First Staging Build & Smoke Test

### Task 11: EAS Update Channel'larını Hazırla

**Files:** Yok (EAS CLI)

- [ ] **Step 1: Customer channel'larını listele**

```bash
cd apps/customer
eas channel:list
```

Mevcut channel'lara bak — varsa `main` veya başka isim. Yoksa boş liste.

- [ ] **Step 2: Customer için staging ve production channel'ları oluştur**

```bash
eas channel:create staging
eas channel:create production
```

Expected: Her biri için "Channel created" mesajı.

- [ ] **Step 3: Baker için aynısı**

```bash
cd ../baker
eas channel:create staging
eas channel:create production
```

- [ ] **Step 4: Commit (boş)**

---

### Task 12: Customer Staging Build

**Files:** Yok (EAS Build)

- [ ] **Step 1: Prebuild temizliği**

```bash
cd apps/customer
APP_ENV=staging npx expo prebuild --clean --platform ios
```

Expected: `ios/` klasörü staging bundle ID ile yeniden oluşur. Bundle ID'yi doğrula:

```bash
grep PRODUCT_BUNDLE_IDENTIFIER ios/*.xcodeproj/project.pbxproj | head -5
```
Expected: `com.pastacim.customer.staging`.

- [ ] **Step 2: EAS preview build**

```bash
eas build --profile preview --platform ios
```

İlk seferinde push notification credential sorabilir — "Generate new" seç. Build kuyruğa girer; bitmesi ~15-20 dk.

Expected: Build URL döner, "Finished" status.

- [ ] **Step 3: Build artifact'ı doğrula**

EAS dashboard'ta build sayfasına git, Info section'ında:
- Bundle Identifier: `com.pastacim.customer.staging` ✓
- Channel: `staging` ✓
- Distribution: Internal ✓

- [ ] **Step 4: Commit (boş — build artefakt'ı kod değil)**

---

### Task 13: Baker Staging Build

**Files:** Yok (EAS Build)

- [ ] **Step 1: Prebuild**

```bash
cd apps/baker
APP_ENV=staging npx expo prebuild --clean --platform ios
```

- [ ] **Step 2: EAS preview build**

```bash
eas build --profile preview --platform ios
```

- [ ] **Step 3: Doğrula**

EAS dashboard'da: bundle = `com.pastacim.baker.staging`, channel = `staging`.

---

### Task 14: TestFlight Yükle ve Telefonda Kur

**Files:** Yok (manuel)

- [ ] **Step 1: Customer staging'i TestFlight'a yükle**

```bash
cd apps/customer
eas submit --profile preview --platform ios --latest
```

Expected: ASC'ye upload başarılı, processing ~5-10 dk.

- [ ] **Step 2: Baker staging'i TestFlight'a yükle**

```bash
cd ../baker
eas submit --profile preview --platform ios --latest
```

- [ ] **Step 3: ASC'de internal testing grubuna ekle**

ASC → Pastacim Staging → TestFlight → Internal Testing:
- "+" → kendi App Store hesabını ekle (anzelpatisserie@gmail.com)
- Build hazır olunca "Available to Test" durumuna geçer

Pastacim Pro Staging için aynısı.

- [ ] **Step 4: Telefonda TestFlight app'ten kur**

iPhone → TestFlight → "Redeem" veya gelen davet linkinden Open:
- "Pastacim Staging" install
- "Pastacim Pro Staging" install

Ana ekranında prod versiyonlarının yanında iki yeni ikon (Staging etiketli) görünmeli.

---

### Task 15: Smoke Test — Staging Çalışıyor mu?

**Files:** Yok (manuel test)

- [ ] **Step 1: Customer staging app'i aç**

Settings ekranına kadar git, geri bildirim modalında veya log'larda Supabase URL'yi doğrula. Veya geliştirme amacıyla bir debug satırı (geçici):

```ts
console.log('[ENV]', Constants.expoConfig?.extra?.appEnv);
console.log('[SUPABASE]', Constants.expoConfig?.extra?.supabaseUrl);
```

Expected: `appEnv: 'staging'`, URL staging projesinin URL'si.

- [ ] **Step 2: Test hesabı oluştur**

Staging app'te yeni bir kullanıcı kaydı yap. Supabase Dashboard → staging proje → Authentication → Users: yeni user görünmeli.

- [ ] **Step 3: Prod app'in etkilenmediğini doğrula**

Prod (App Store'dan inen) app'i aç → mevcut hesabınla giriş yapabilmelisin. Verisinde herhangi bir test verisi olmamalı.

- [ ] **Step 4: Bulgu varsa task aç**

Çalışmayan bir şey varsa Issues'a not düş; geri dönüp düzelt.

---

## Phase F — Documentation & Memory

### Task 16: staging-workflow.md Yaz

**Files:**
- Create: `docs/staging-workflow.md`

- [ ] **Step 1: Workflow dökümanını yaz**

```markdown
# Staging Workflow — Yeni Feature Shipping

Pastacım'da yeni özellik eklerken kullanılacak standart akış.

## Komut Cheatsheet

| Komut | Açıklama |
|---|---|
| `APP_ENV=staging npx expo start` | Lokal dev'de staging Supabase'e bağlı çalış |
| `cd apps/customer && eas build --profile preview --platform ios` | Staging build (TestFlight) |
| `eas update --channel staging --message "fix: ..."` | Staging OTA push |
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
supabase link --project-ref <STAGING_PROJECT_ID>
supabase db push
```

### 3. Type regenerate
```bash
npx supabase gen types typescript --project-id <STAGING_PROJECT_ID> \
  > packages/shared/types/database.types.ts
```

### 4. Kod yaz, lokal test et
```bash
APP_ENV=staging npm run customer
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
supabase link --project-ref lvrbzhziayegyinkcuka
supabase db push
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
- **APP_ENV=staging unutursan** lokal dev prod'a bağlanır — verilerle oyna oyna düzelt.

## Sorun Giderme

**Staging app açılıyor ama Supabase auth çalışmıyor:**
- Staging Supabase → Auth → URL Configuration → `pastacim-staging://` redirect listesinde mi?
- Email confirmation `mailer_autoconfirm` ayarı prod ile aynı mı?

**TestFlight build "Invalid Bundle":**
- Apple Developer portal'da `com.pastacim.{customer,baker}.staging` App ID'leri push capability ile mi açık?
- ASC'de staging app girişleri açık mı?

**Type errors after merge:**
- `npx supabase gen types ...` çalıştırıldı mı?
- Staging ve prod schema senkron mu? (`supabase db diff` ile kontrol et)
```

- [ ] **Step 2: Commit**

```bash
git add docs/staging-workflow.md
git commit -m "docs: add staging workflow cheatsheet

Feature ekleme akışı, OTA vs build kararı, migration disiplini ve
yaygın sorun-çözüm rehberi.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 17: CLAUDE.md Güncelle

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Aşağıdaki bölümleri güncelle**

**"App Store Hazırlık Durumu" tablosunu** şu satırlarla değiştir (gönderildi):

```markdown
## App Store Hazırlık Durumu (2026-06-10 sabahı submit edildi, review sürecinde)

| Gereksinim | Customer | Baker | Durum |
|---|---|---|---|
| iOS push entitlement | ✅ | ✅ | Tamam |
| Privacy Policy URL | ✅ | ✅ | Edge function deployed |
| Info.plist Türkçe izin metni | ✅ | ✅ | Tamam |
| Hesap silme akışı | ✅ | ✅ | delete_account RPC |
| Screenshot setleri | ✅ | ✅ | Yüklendi |
| App Store açıklaması TR | ✅ | ✅ | Yüklendi |
| EAS submit.production config | ✅ | ✅ | Tamam |
| App icon (1024x1024) | ✅ | ✅ | Tamam |
| Bundle ID / Package | ✅ | ✅ | Tamam |
| **Apple review** | ⏳ | ⏳ | İnceleme bekliyor |
```

**"Klasör Yapısı" altına** staging app.config.js bilgisini ekle:

```
apps/
  customer/
    app.config.js              # Dinamik konfig — APP_ENV ile staging/production seçimi
    ...
  baker/
    app.config.js              # Dinamik konfig — APP_ENV ile staging/production seçimi
    ...
```

**"Önemli Komutlar" altına** staging komutlarını ekle:

```bash
# Staging Supabase'e bağlı dev
APP_ENV=staging npm run customer
APP_ENV=staging npm run baker

# Staging build (TestFlight)
cd apps/customer && eas build --profile preview --platform ios
cd apps/baker    && eas build --profile preview --platform ios

# OTA push
eas update --channel staging --message "..."
eas update --channel production --message "..."
```

Detaylı workflow için: `docs/staging-workflow.md`.

**"Açık Sorunlar" listesinden** çözülenleri kaldır:
- Privacy Policy URL (artık var)
- iOS Info.plist Türkçe (artık var)
- Hesap silme (artık var)
- EAS submit.production config (artık dolu)

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for post-launch state + staging workflow

App Store submit sonrası durum tablosu, staging dev komutları ve
app.config.js klasör yapısı güncellendi.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 18: Memory Hijyeni

**Files:**
- Modify: `/Users/soneripekci/.claude/projects/-Users-soneripekci-Documents-Dev-VsCode-Pastac-m/memory/MEMORY.md`
- Modify: `~/.claude/projects/.../memory/github-account.md` (artık "geliştirme bittikten sonra" eski)
- Create: `~/.claude/projects/.../memory/staging-workflow.md` (post-launch workflow özet)

- [ ] **Step 1: github-account.md güncelle**

Eski içerik: "geliştirme bittikten sonra push" → yeni: "Live in App Store as of 2026-06-10; feature dev artık branch'lerde, main her zaman prod-ready."

- [ ] **Step 2: Yeni staging-workflow.md memory dosyası yaz**

İçerik kısa pointer:
```markdown
---
name: staging-workflow
description: Staging Supabase + paralel TestFlight ile feature shipping akışı
metadata:
  type: project
---

Staging ortamı kuruldu 2026-06-10.
- Ayrı Supabase projesi: pastacim-staging (free tier)
- Bundle suffix: .staging (customer + baker)
- TestFlight Internal Testing — review beklemez
- EAS Update channel: staging / production
- Detay: docs/staging-workflow.md

**Why:** App Store'a submit edildikten sonra canlı kullanıcıları
etkilemeden yeni feature test edebilmek için.

**How to apply:** Yeni özellik eklerken APP_ENV=staging ile çalış,
EAS preview build ile TestFlight'a yükle, doğrulandıktan sonra
main'e merge edip prod'a OTA/build push.
```

- [ ] **Step 3: MEMORY.md index'ini güncelle**

`- [Staging Workflow](staging-workflow.md) — Post-launch feature dev akışı, ayrı Supabase + TestFlight` satırını ekle.

Eskimiş satırları gözden geçir:
- `github-account.md` description'ını "Live App Store, branch'li dev" gibi güncelle

- [ ] **Step 4: Doğrula (memory dosyaları git'te değil, commit yok)**

```bash
ls ~/.claude/projects/-Users-soneripekci-Documents-Dev-VsCode-Pastac-m/memory/
cat ~/.claude/projects/-Users-soneripekci-Documents-Dev-VsCode-Pastac-m/memory/MEMORY.md
```

Yeni dosyaları gör, eskileri güncel.

---

## Spec Coverage Doğrulama

| Spec Bölümü | Hangi Task |
|---|---|
| §2.1 Supabase setup | Task 1, 4, 5 |
| §2.2 Environment switching | Task 6, 7, 8 |
| §2.3 EAS profiles | Task 9, 10, 11 |
| §2.4 ASC + Apple Developer | Task 2, 3 |
| §2.5 Branch stratejisi | Task 16 (docs) |
| §3 Feature workflow | Task 16 |
| §4 Migration disiplini | Task 4 (schema baseline) |
| §5 Risk analizi | (planda explicit risk önlemleri Task 8'de — supabase.ts'de hardcoded URL kaldırma — sessiz prod bağlantı engellenir) |
| §8 Başarı kriterleri | Task 15 (smoke test) |

## Execution Notları

- Phase A'daki manuel task'lar (1, 2, 3) seri ve **insan tarafından** yapılmalı — agent web UI'a giremez.
- Task 6-10 paralel yapılabilir teknik olarak ama sırayla yapmak commit history'yi düzgün tutar.
- Task 12-14 sırayla yapılmalı — birinin çıktısı diğerinin girdisi.
- İlk staging build (Task 12) başarısız olursa: önce `npx expo config` ile config'i doğrula, sonra `npx expo prebuild --clean` ile native projeyi yenile.

# App Store / Play Store Submission Readiness
**Tarih:** 2026-06-07  
**Yaklaşım:** A — Önce iOS (App Store), ardından Android (Play Store)

---

## Hedef

İki uygulamayı (Pastacım müşteri + Pastacım Pro pastacı) birkaç gün içinde App Store'a göndermek. Android için Google Play Console kaydı açılınca aynı yapıyı uygulamak.

---

## Mevcut Durum

### Tamamlanmış
- iOS push entitlement (`aps-environment: production`, `keychain-access-groups`) ✅
- `UIBackgroundModes: remote-notification` ✅
- Hesap silme akışı (her iki app) ✅
- Şifremi unuttum akışı ✅
- App ikonları (iOS 1024×1024 + Android adaptive) ✅
- Android prebuild dosyaları (baker) ✅
- FCM `google-services.json` ✅
- Türkçe: konum, kamera, fotoğraf izin metinleri ✅

### Eksik — Kod Değişiklikleri (bu spec kapsamı)
| # | Görev | Dosyalar |
|---|---|---|
| 1 | Info.plist 5 eksik izin metnini Türkçe yap | `apps/*/ios/*/Info.plist`, `apps/*/app.json` infoPlist bloğu |
| 2 | Privacy Policy HTML oluştur + GitHub Pages'a push | `docs/privacy/index.html` |
| 3 | Onboarding'e tıklanabilir Privacy Policy + Kullanım Koşulları linkleri | `apps/*/app/(auth)/onboarding.tsx` |
| 4 | Google Places API key hardcode'u kaldır → app.json extra | `apps/baker/app/(baker)/setup.tsx`, `apps/baker/app/(baker)/profile.tsx`, `apps/baker/app.json` |
| 5 | EAS submit.production config Apple parametreleriyle doldur | `apps/*/eas.json` |

### Eksik — Kullanıcı Yapacak (bu spec dışı)
- APNs p8 key → Expo dashboard Credentials
- App Store Connect'te iki app kaydı
- iOS screenshots (iPhone fiziksel cihaz, 6.5")
- Google Play Console kaydı ($25)
- EAS submit için Apple ASC API key ID + Issuer ID

---

## Kod Değişiklikleri Detayı

### 1. Info.plist Türkçeleştirme

Her iki app, her iki dosya (Info.plist + app.json infoPlist bloğu):

| Key | Türkçe Metin |
|---|---|
| `NSFaceIDUsageDescription` | `Güvenli giriş için Face ID kullanılır.` |
| `NSLocationAlwaysAndWhenInUseUsageDescription` | `Pastacım yakındaki pastacıları gösterebilmek için konumunuza erişir.` |
| `NSLocationAlwaysUsageDescription` | `Pastacım yakındaki pastacıları gösterebilmek için konumunuza erişir.` |
| `NSMicrophoneUsageDescription` | `Uygulama mikrofon kullanmamaktadır; sistem gerekliliği nedeniyle beyan edilmiştir.` |
| `NSMotionUsageDescription` | `Uygulama hareket sensörü kullanmamaktadır; sistem gerekliliği nedeniyle beyan edilmiştir.` |

> **Not:** NSMicrofone ve NSMotion gerçekte kullanılmıyor; Apple bu key'lerin var olmasını zorunlu kılmadığı sürece kaldırılabilir. Ancak bazı bağımlı paketler (expo-sensors, expo-av) manifest'e eklediği için Türkçe bırakmak daha güvenli.

### 2. Privacy Policy HTML

`docs/privacy/index.html` — Türkçe, tek sayfa, mobil uyumlu.

İçerik zorunlu maddeleri:
- Toplanan kişisel veriler: e-posta, konum, fotoğraf, push token
- Veri saklama: Supabase (AB Standard Contractual Clauses)
- Üçüncü taraflar: Google OAuth, Firebase Cloud Messaging
- Kullanıcı hakları: hesap silme (`delete_account`), veri talebi
- İletişim: `anzelpatisserie@gmail.com`
- Yürürlük tarihi

GitHub Pages aktifleştirme: `gh api` ile repo settings → GitHub Pages → source: `docs/` klasörü, `main` branch.

URL: `https://anzelpatisserie.github.io/pastacim/privacy/`

### 3. Onboarding Linki

Her iki `onboarding.tsx`'te mevcut `<Text>` "Gizlilik Politikası" ve "Kullanım Koşulları" kısımlarını `<TouchableOpacity>` ile `Linking.openURL()` çağrısına dönüştür.

```
Privacy Policy URL: https://anzelpatisserie.github.io/pastacim/privacy/
Terms URL:          https://anzelpatisserie.github.io/pastacim/terms/
```

### 4. Google Places API Key Taşıma

`apps/baker/app.json` → `extra.googlePlacesApiKey: "AIzaSyCunYQzVUP2Ue8HraYn-PIpx6jvpSSC4Zo"`

`setup.tsx` ve `profile.tsx`'teki `const PLACES_API_KEY = '...'` satırını kaldır, yerine:
```ts
import Constants from 'expo-constants';
const PLACES_API_KEY = Constants.expoConfig?.extra?.googlePlacesApiKey ?? '';
```

> **Not:** Gerçek güvenlik için Edge Function'a taşınmalı, ancak store submission için bu yeterli.

### 5. EAS Submit Config

`apps/*/eas.json` `submit.production` bloğuna:
```json
{
  "ios": {
    "appleId": "anzelpatisserie@gmail.com",
    "ascAppId": "PLACEHOLDER — App Store Connect'ten alınacak",
    "appleTeamId": "PLACEHOLDER — Apple Developer'dan alınacak"
  }
}
```
Android kısmı Play Console açılınca eklenir.

---

## GitHub Push Planı

1. Tüm kod değişiklikleri tek commit: `feat: app store submission readiness`
2. `docs/privacy/index.html` + `docs/terms/index.html` ayrı commit: `docs: add privacy policy and terms of use pages`
3. GitHub Pages'ı `gh api` ile aktifleştir (source: `/docs`, branch: `main`)
4. `git push origin main`

---

## Başarı Kriterleri

- [ ] iOS simulator'da her iki app `npx tsc --noEmit` hatasız geçer
- [ ] `https://anzelpatisserie.github.io/pastacim/privacy/` erişilebilir
- [ ] Onboarding ekranında "Gizlilik Politikası"na dokunulunca tarayıcı açılır
- [ ] `eas build --profile production --platform ios` hatasız tamamlanır
- [ ] App Store Connect'e `eas submit` komutuyla gönderilebilir

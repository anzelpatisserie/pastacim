# App Store Submission Readiness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** iOS App Store'a gönderim için gereken 5 kod değişikliğini tamamla, Privacy Policy'yi GitHub Pages'a yayınla ve git push yap.

**Architecture:** Saf config + küçük UI değişiklikleri. Paylaşılan backend yok. Her task bağımsız commit alır. TDD uygulanamaz (config/HTML/JSON değişiklikleri), doğrulama TypeScript check + manuel kontrol ile yapılır.

**Tech Stack:** Expo SDK 56 / React Native / TypeScript / app.json / Info.plist / GitHub Pages / gh CLI / EAS

---

## Dosya Haritası

| Görev | Dosya(lar) | İşlem |
|---|---|---|
| T1 | `apps/baker/ios/PastacmPro/Info.plist` | Modify |
| T1 | `apps/customer/ios/Pastacm/Info.plist` | Modify |
| T1 | `apps/baker/app.json` | Modify (infoPlist bloğu) |
| T1 | `apps/customer/app.json` | Modify (infoPlist bloğu) |
| T2 | `docs/privacy/index.html` | Create |
| T2 | `docs/terms/index.html` | Create |
| T3 | GitHub repo settings | gh CLI ile GitHub Pages aktif et |
| T4 | `apps/baker/app/(auth)/onboarding.tsx` | Modify |
| T4 | `apps/customer/app/(auth)/onboarding.tsx` | Modify |
| T5 | `apps/baker/app.json` | Modify (extra bloğu) |
| T5 | `apps/baker/app/(baker)/setup.tsx` | Modify |
| T5 | `apps/baker/app/(baker)/profile.tsx` | Modify |
| T6 | `apps/baker/eas.json` | Modify |
| T6 | `apps/customer/eas.json` | Modify |
| T7 | — | git push origin main |

---

## Task 1: Info.plist — 5 İngilizce İzin Metnini Türkçeleştir

**Files:**
- Modify: `apps/baker/ios/PastacmPro/Info.plist`
- Modify: `apps/customer/ios/Pastacm/Info.plist`
- Modify: `apps/baker/app.json` (infoPlist bloğu)
- Modify: `apps/customer/app.json` (infoPlist bloğu)

- [ ] **Step 1: Baker Info.plist — 5 string'i değiştir**

`apps/baker/ios/PastacmPro/Info.plist` dosyasında şu 5 key'i güncelle:

```xml
<!-- NSFaceIDUsageDescription — mevcut İngilizce değeri değiştir -->
<key>NSFaceIDUsageDescription</key>
<string>Güvenli giriş için Face ID kullanılır.</string>

<!-- NSLocationAlwaysAndWhenInUseUsageDescription — mevcut değeri değiştir -->
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Pastacım yakındaki pastacıları gösterebilmek için konumunuza erişir.</string>

<!-- NSLocationAlwaysUsageDescription — mevcut değeri değiştir -->
<key>NSLocationAlwaysUsageDescription</key>
<string>Pastacım yakındaki pastacıları gösterebilmek için konumunuza erişir.</string>

<!-- NSMicrophoneUsageDescription — mevcut değeri değiştir -->
<key>NSMicrophoneUsageDescription</key>
<string>Uygulama mikrofon kullanmamaktadır; sistem gerekliliği nedeniyle beyan edilmiştir.</string>

<!-- NSMotionUsageDescription — mevcut değeri değiştir -->
<key>NSMotionUsageDescription</key>
<string>Uygulama hareket sensörü kullanmamaktadır; sistem gerekliliği nedeniyle beyan edilmiştir.</string>
```

- [ ] **Step 2: Customer Info.plist — aynı 5 string'i değiştir**

`apps/customer/ios/Pastacm/Info.plist` dosyasında Step 1 ile aynı değerleri uygula (NSLocationWhenInUseUsageDescription zaten Türkçe, dokunma).

- [ ] **Step 3: Baker app.json — infoPlist bloğuna 5 key ekle**

`apps/baker/app.json` dosyasında `"infoPlist"` bloğunu şu hale getir:

```json
"infoPlist": {
  "UIBackgroundModes": ["remote-notification"],
  "NSLocationWhenInUseUsageDescription": "Pastacım yakındaki pastacıları gösterebilmek için konumunuza erişir.",
  "NSLocationAlwaysAndWhenInUseUsageDescription": "Pastacım yakındaki pastacıları gösterebilmek için konumunuza erişir.",
  "NSLocationAlwaysUsageDescription": "Pastacım yakındaki pastacıları gösterebilmek için konumunuza erişir.",
  "NSCameraUsageDescription": "Geri bildirim ekran görüntüsü veya fotoğraf için kamera erişimi gerekir.",
  "NSPhotoLibraryUsageDescription": "Sipariş veya dükkan görseli seçmek için fotoğraflarınıza erişim gerekir.",
  "NSFaceIDUsageDescription": "Güvenli giriş için Face ID kullanılır.",
  "NSMicrophoneUsageDescription": "Uygulama mikrofon kullanmamaktadır; sistem gerekliliği nedeniyle beyan edilmiştir.",
  "NSMotionUsageDescription": "Uygulama hareket sensörü kullanmamaktadır; sistem gerekliliği nedeniyle beyan edilmiştir.",
  "LSApplicationQueriesSchemes": ["message", "googlegmail"]
}
```

- [ ] **Step 4: Customer app.json — infoPlist bloğuna 5 key ekle**

`apps/customer/app.json` dosyasında Step 3 ile aynı `infoPlist` bloğunu uygula (aynı içerik, yalnızca uygulama adı fark yaratmaz).

- [ ] **Step 5: TypeScript check**

```bash
cd apps/baker && npx tsc --noEmit && echo "baker OK"
cd apps/customer && npx tsc --noEmit && echo "customer OK"
```

Beklenen: her ikisi de hatasız.

- [ ] **Step 6: Commit**

```bash
git add apps/baker/ios/PastacmPro/Info.plist \
        apps/customer/ios/Pastacm/Info.plist \
        apps/baker/app.json \
        apps/customer/app.json
git commit -m "fix(ios): translate all Info.plist permission strings to Turkish"
```

---

## Task 2: Privacy Policy + Terms of Use HTML Sayfaları

**Files:**
- Create: `docs/privacy/index.html`
- Create: `docs/terms/index.html`

- [ ] **Step 1: `docs/privacy/index.html` oluştur**

```html
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gizlilik Politikası — Pastacım</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; margin: 0 auto; padding: 24px 16px; color: #1a1a1a; line-height: 1.7; }
    h1 { color: #D4526E; }
    h2 { color: #333; margin-top: 32px; }
    a { color: #D4526E; }
    .updated { color: #888; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>Gizlilik Politikası</h1>
  <p class="updated">Son güncelleme: 8 Haziran 2026</p>

  <p>Bu gizlilik politikası, <strong>Pastacım</strong> ve <strong>Pastacım Pro</strong> mobil uygulamalarının kişisel verilerinizi nasıl topladığını, kullandığını ve koruduğunu açıklar. Uygulamalarımızı kullanarak bu politikayı kabul etmiş sayılırsınız.</p>

  <h2>1. Geliştirici Bilgisi</h2>
  <p>
    Uygulama Geliştirici: Anzel Patisserie<br>
    İletişim: <a href="mailto:anzelpatisserie@gmail.com">anzelpatisserie@gmail.com</a>
  </p>

  <h2>2. Topladığımız Veriler</h2>
  <ul>
    <li><strong>Hesap bilgileri:</strong> E-posta adresi ve ad-soyad (kayıt sırasında alınır).</li>
    <li><strong>Konum:</strong> Yakındaki pastacıları veya sipariş taleplerini listelemek için yalnızca uygulama ön plandayken anlık konum alınır. Konum sürekli izlenmez ve cihaz dışında saklanmaz.</li>
    <li><strong>Profil fotoğrafı:</strong> Yüklemeyi tercih etmeniz hâlinde depolanır.</li>
    <li><strong>Push token:</strong> Sipariş ve teklif bildirimlerini iletmek için cihaz push token'ı kaydedilir.</li>
    <li><strong>Sipariş ve teklif içerikleri:</strong> Platform üzerindeki ticari işlemlerin yürütülmesi için saklanır.</li>
    <li><strong>Mesajlar:</strong> Müşteri–pastacı iletişimi platform üzerinde şifreli olarak saklanır.</li>
  </ul>

  <h2>3. Verilerin Kullanım Amacı</h2>
  <ul>
    <li>Hesap oluşturma ve kimlik doğrulama</li>
    <li>Konum bazlı pastacı / sipariş eşleştirmesi</li>
    <li>Sipariş, teklif ve mesaj bildirimlerinin iletilmesi</li>
    <li>Platform güvenliği ve sahteciliğin önlenmesi</li>
  </ul>

  <h2>4. Üçüncü Taraf Hizmetler</h2>
  <ul>
    <li><strong>Supabase</strong> (veri tabanı ve kimlik doğrulama): Verileriniz AB Standart Sözleşme Hükümleri (SCC) kapsamında işlenir. Bkz. <a href="https://supabase.com/privacy" target="_blank">Supabase Gizlilik Politikası</a>.</li>
    <li><strong>Google OAuth / Firebase Cloud Messaging</strong>: Google hesabıyla giriş ve push bildirimleri için kullanılır. Bkz. <a href="https://policies.google.com/privacy" target="_blank">Google Gizlilik Politikası</a>.</li>
    <li><strong>Google Maps / Places API</strong>: Pastacı dükkan konumu doğrulaması için kullanılır.</li>
    <li><strong>Expo (EAS)</strong>: Uygulama dağıtımı ve OTA güncellemeleri için kullanılır.</li>
  </ul>

  <h2>5. Veri Saklama Süresi</h2>
  <p>Verileriniz hesabınız aktif olduğu sürece saklanır. Hesabınızı uygulama içindeki "Hesabımı Sil" seçeneğiyle silebilirsiniz; bu işlem tüm kişisel verilerinizi kalıcı olarak siler.</p>

  <h2>6. Çocukların Gizliliği</h2>
  <p>Uygulamalarımız 13 yaşın altındaki çocuklara yönelik değildir ve bu yaş grubundan bilerek veri toplamıyoruz.</p>

  <h2>7. Haklarınız</h2>
  <ul>
    <li>Verilerinize erişim talep edebilirsiniz.</li>
    <li>Verilerinizin düzeltilmesini isteyebilirsiniz.</li>
    <li>Hesabınızı ve tüm verilerinizi kalıcı olarak silebilirsiniz (uygulama içi "Hesabımı Sil").</li>
    <li>Her türlü soru ve talep için <a href="mailto:anzelpatisserie@gmail.com">anzelpatisserie@gmail.com</a> adresine yazabilirsiniz.</li>
  </ul>

  <h2>8. Değişiklikler</h2>
  <p>Bu politikayı zaman zaman güncelleyebiliriz. Önemli değişikliklerde uygulama içi bildirim veya e-posta ile bilgilendirme yapılır.</p>
</body>
</html>
```

- [ ] **Step 2: `docs/terms/index.html` oluştur**

```html
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kullanım Koşulları — Pastacım</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; margin: 0 auto; padding: 24px 16px; color: #1a1a1a; line-height: 1.7; }
    h1 { color: #D4526E; }
    h2 { color: #333; margin-top: 32px; }
    a { color: #D4526E; }
    .updated { color: #888; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>Kullanım Koşulları</h1>
  <p class="updated">Son güncelleme: 8 Haziran 2026</p>

  <p>Bu kullanım koşulları, <strong>Pastacım</strong> ve <strong>Pastacım Pro</strong> uygulamalarını kullanırken geçerli olan kuralları belirler. Uygulamaları kullanarak bu koşulları kabul etmiş sayılırsınız.</p>

  <h2>1. Hizmet Tanımı</h2>
  <p>Pastacım, müşterilerin pasta / tatlı / börek siparişi oluşturduğu; yakınlarındaki pastacıların bu siparişlere teklif verdiği bir aracı platformdur. Platform yalnızca müşteri ile pastacı arasında aracılık sağlar; siparişin kalitesi veya tesliminden doğrudan sorumlu değildir.</p>

  <h2>2. Hesap Koşulları</h2>
  <ul>
    <li>Gerçek ve güncel bilgilerle kayıt olmanız zorunludur.</li>
    <li>Hesap güvenliğiniz sizin sorumluluğunuzdadır.</li>
    <li>Bir hesap birden fazla kişi tarafından kullanılamaz.</li>
  </ul>

  <h2>3. Müşteri Yükümlülükleri</h2>
  <ul>
    <li>Sipariş oluştururken gerçek ve eksiksiz bilgi verilmelidir.</li>
    <li>Kabul edilen teklif için pastacıyla iyi niyetli iletişim kurulmalıdır.</li>
    <li>Sipariş iptallerinde pastacı bildirilmelidir.</li>
  </ul>

  <h2>4. Pastacı Yükümlülükleri</h2>
  <ul>
    <li>Yalnızca gerçekçi ve yerine getirebileceğiniz teklifler veriniz.</li>
    <li>Kabul edilen siparişleri belirlenen sürede teslim etmeye çalışınız.</li>
    <li>Dükkan profilinizde güncel ve doğru bilgilere yer veriniz.</li>
  </ul>

  <h2>5. Yasaklı Kullanımlar</h2>
  <ul>
    <li>Platform üzerinden yanıltıcı, sahte veya yasadışı içerik paylaşmak</li>
    <li>Diğer kullanıcıları taciz etmek veya spam göndermek</li>
    <li>Uygulamanın güvenlik önlemlerini aşmaya çalışmak</li>
    <li>Üçüncü taraf yazılımlarla platformu otomatize etmek</li>
  </ul>

  <h2>6. Ödeme ve Cüzdan</h2>
  <p>Pastacı cüzdanı yalnızca platform teklif ücretlerini ödemek için kullanılır. Yüklenen bakiyeler iade edilmez; ancak hizmet hatası durumunda destek hattından talep edilebilir.</p>

  <h2>7. Sorumluluk Sınırı</h2>
  <p>Platform, aracı konumundadır. Müşteri ile pastacı arasındaki ticari anlaşmazlıklarda platform doğrudan taraf değildir; arabuluculuk amacıyla destek verebilir.</p>

  <h2>8. Değişiklikler</h2>
  <p>Koşulları önceden haber vererek değiştirebiliriz. Önemli değişikliklerde uygulama içi bildirim yapılır.</p>

  <h2>9. İletişim</h2>
  <p><a href="mailto:anzelpatisserie@gmail.com">anzelpatisserie@gmail.com</a></p>
</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add docs/privacy/index.html docs/terms/index.html
git commit -m "docs: add Turkish Privacy Policy and Terms of Use pages"
```

---

## Task 3: GitHub Pages Aktifleştir

**Files:** GitHub repo settings (gh CLI)

- [ ] **Step 1: GitHub Pages'ı `docs/` klasörü üzerinden aktif et**

```bash
gh api repos/anzelpatisserie/pastacim/pages \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  -f source='{"branch":"main","path":"/docs"}'
```

Beklenen çıktı: `{"url": "https://api.github.com/repos/anzelpatisserie/pastacim/pages", "status": "queued", ...}`

Hata alırsan (zaten aktifse):
```bash
gh api repos/anzelpatisserie/pastacim/pages \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  -f source='{"branch":"main","path":"/docs"}'
```

- [ ] **Step 2: Sayfanın yayınlandığını doğrula**

```bash
gh api repos/anzelpatisserie/pastacim/pages | grep '"html_url"'
```

Beklenen: `"html_url": "https://anzelpatisserie.github.io/pastacim/"` görünür.

> Not: Sayfa aktif olana kadar 1-3 dakika beklemek gerekebilir. `https://anzelpatisserie.github.io/pastacim/privacy/` adresine tarayıcıdan girildiğinde HTML sayfa açılmalı.

---

## Task 4: Onboarding — Tıklanabilir Privacy & Terms Linkleri

**Files:**
- Modify: `apps/baker/app/(auth)/onboarding.tsx`
- Modify: `apps/customer/app/(auth)/onboarding.tsx`

- [ ] **Step 1: Baker onboarding — Linking import ekle ve legal Text'i güncelle**

`apps/baker/app/(auth)/onboarding.tsx` dosyasında:

**Import satırını değiştir** (satır 1-8):
```tsx
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Dimensions,
  Linking,
} from 'react-native';
```

**Legal Text bloğunu değiştir** (satır 67-69, mevcut `<Text>...</Text>`):
```tsx
<Text style={[styles.legal, { color: C.placeholder }]}>
  {'Devam ederek '}
  <Text
    style={{ color: C.primary, textDecorationLine: 'underline' }}
    onPress={() => Linking.openURL('https://anzelpatisserie.github.io/pastacim/terms/')}
  >
    Kullanım Koşulları
  </Text>
  {' ve\n'}
  <Text
    style={{ color: C.primary, textDecorationLine: 'underline' }}
    onPress={() => Linking.openURL('https://anzelpatisserie.github.io/pastacim/privacy/')}
  >
    Gizlilik Politikası
  </Text>
  {"'nı kabul etmiş olursunuz."}
</Text>
```

- [ ] **Step 2: Customer onboarding — aynı değişikliği uygula**

`apps/customer/app/(auth)/onboarding.tsx` dosyasında Step 1 ile tamamen aynı iki değişikliği yap (import + legal Text bloğu).

- [ ] **Step 3: TypeScript check**

```bash
cd apps/baker && npx tsc --noEmit && echo "baker OK"
cd apps/customer && npx tsc --noEmit && echo "customer OK"
```

Beklenen: hatasız.

- [ ] **Step 4: Commit**

```bash
git add apps/baker/app/\(auth\)/onboarding.tsx \
        apps/customer/app/\(auth\)/onboarding.tsx
git commit -m "feat: add tappable Privacy Policy and Terms links in onboarding screens"
```

---

## Task 5: Google Places API Key — Hardcode'u Kaldır

**Files:**
- Modify: `apps/baker/app.json` (extra bloğu)
- Modify: `apps/baker/app/(baker)/setup.tsx`
- Modify: `apps/baker/app/(baker)/profile.tsx`

- [ ] **Step 1: Baker app.json extra bloğuna key ekle**

`apps/baker/app.json` dosyasında `"extra"` bloğunu şu hale getir:

```json
"extra": {
  "eas": {
    "projectId": "c8d3415d-5bce-4b61-95eb-fa4134a91fe7"
  },
  "router": {
    "origin": false
  },
  "supabaseUrl": "https://lvrbzhziayegyinkcuka.supabase.co",
  "supabaseAnonKey": "sb_publishable_GRPzr4yIvnC54VpN6G7K3A_awa6OyWp",
  "googlePlacesApiKey": "AIzaSyCunYQzVUP2Ue8HraYn-PIpx6jvpSSC4Zo"
}
```

- [ ] **Step 2: setup.tsx — hardcode'u kaldır**

`apps/baker/app/(baker)/setup.tsx` dosyasında:

**Import ekle** (mevcut importların altına, satır 9 civarı):
```tsx
import Constants from 'expo-constants';
```

**Satır 25'teki hardcoded sabiti değiştir**:
```tsx
// ESKİ: const PLACES_API_KEY = 'AIzaSyCunYQzVUP2Ue8HraYn-PIpx6jvpSSC4Zo';
const PLACES_API_KEY: string = Constants.expoConfig?.extra?.googlePlacesApiKey ?? '';
```

- [ ] **Step 3: profile.tsx — hardcode'u kaldır**

`apps/baker/app/(baker)/profile.tsx` dosyasında aynı iki değişikliği yap:

**Import ekle** (mevcut importların altına):
```tsx
import Constants from 'expo-constants';
```

**Hardcoded sabiti değiştir** (satır 47 civarı):
```tsx
// ESKİ: const PLACES_API_KEY = 'AIzaSyCunYQzVUP2Ue8HraYn-PIpx6jvpSSC4Zo';
const PLACES_API_KEY: string = Constants.expoConfig?.extra?.googlePlacesApiKey ?? '';
```

- [ ] **Step 4: expo-constants kurulu mu doğrula**

```bash
grep '"expo-constants"' apps/baker/package.json || grep '"expo-constants"' package.json
```

Beklenen: satır bulunur (expo-constants Expo SDK ile birlikte gelir). Bulunamazsa:
```bash
cd apps/baker && npx expo install expo-constants
```

- [ ] **Step 5: TypeScript check**

```bash
cd apps/baker && npx tsc --noEmit && echo "baker OK"
```

- [ ] **Step 6: Commit**

```bash
git add apps/baker/app.json \
        apps/baker/app/\(baker\)/setup.tsx \
        apps/baker/app/\(baker\)/profile.tsx
git commit -m "refactor(baker): move Google Places API key from hardcode to app.json extra"
```

---

## Task 6: EAS Submit Production Config

**Files:**
- Modify: `apps/baker/eas.json`
- Modify: `apps/customer/eas.json`

- [ ] **Step 1: Baker eas.json submit.production bloğunu doldur**

`apps/baker/eas.json` dosyasında `"submit"` bloğunu şu hale getir:

```json
"submit": {
  "production": {
    "ios": {
      "appleId": "anzelpatisserie@gmail.com",
      "ascAppId": "BURAYA_APP_STORE_CONNECT_APP_ID",
      "appleTeamId": "BURAYA_APPLE_TEAM_ID"
    }
  }
}
```

> **ASC App ID nasıl alınır:** App Store Connect (appstoreconnect.apple.com) → Apps → Yeni Uygulama Oluştur (com.pastacim.baker) → oluştuktan sonra URL'deki sayı App ID'dir.
> **Apple Team ID nasıl alınır:** developer.apple.com → Account → Membership → Team ID.

- [ ] **Step 2: Customer eas.json submit.production bloğunu doldur**

`apps/customer/eas.json` dosyasında aynı yapıyı uygula (ascAppId değeri `com.pastacim.customer` için farklı olacak):

```json
"submit": {
  "production": {
    "ios": {
      "appleId": "anzelpatisserie@gmail.com",
      "ascAppId": "BURAYA_APP_STORE_CONNECT_APP_ID",
      "appleTeamId": "BURAYA_APPLE_TEAM_ID"
    }
  }
}
```

> App Store Connect'te `com.pastacim.customer` için ayrı bir app kaydı oluşturunca farklı bir ASC App ID verilir.

- [ ] **Step 3: Commit**

```bash
git add apps/baker/eas.json apps/customer/eas.json
git commit -m "chore: add EAS submit production config for iOS App Store"
```

---

## Task 7: Git Push

- [ ] **Step 1: Tüm commit'lerin temiz olduğunu doğrula**

```bash
git status
git log --oneline -8
```

Beklenen: working tree clean, son 6 commit görünür.

- [ ] **Step 2: Push**

```bash
git push origin main
```

- [ ] **Step 3: GitHub Pages URL'ini tarayıcıda aç**

`https://anzelpatisserie.github.io/pastacim/privacy/` adresine git.
Sayfanın "Gizlilik Politikası" başlığıyla açıldığını doğrula (deploy 1-3 dk sürebilir).

---

## Sonraki Adımlar (Siz Yapacaksınız)

Bu plan bittikten sonra sıra sizde:

1. **Apple Developer → APNs Key:**
   - developer.apple.com → Certificates, Identifiers & Profiles → Keys → "+" → "Apple Push Notifications service (APNs)" → Download `.p8` dosyasını
   - expo.dev → Projects → Pastacım (customer) → Credentials → iOS → Add APNs Authentication Key → dosyayı yükle
   - Aynısını Pastacım Pro (baker) için tekrarla

2. **App Store Connect — İki App Kaydı:**
   - appstoreconnect.apple.com → My Apps → "+" → New App
   - Platform: iOS, Bundle ID: `com.pastacim.customer`, Name: "Pastacım"
   - Aynısını `com.pastacim.baker` / "Pastacım Pro" için tekrarla
   - Her uygulamanın App ID numarasını Task 6'daki `ascAppId` placeholder'larına yaz

3. **Apple Team ID:**
   - developer.apple.com → Account → Membership → Team ID'yi Task 6'daki `appleTeamId` placeholder'larına yaz

4. **iOS Production Build:**
   ```bash
   cd apps/customer && eas build --profile production --platform ios
   cd apps/baker    && eas build --profile production --platform ios
   ```

5. **App Store Submit:**
   ```bash
   cd apps/customer && eas submit --platform ios
   cd apps/baker    && eas submit --platform ios
   ```

6. **Screenshots (App Store Connect'te gerekli):**
   - iPhone'dan her app için en az 3 ekran görüntüsü (Ayarlar → Ekran Görüntüsü)
   - App Store Connect → Her app → App Screenshots → yükle

7. **Google Play Console:**
   - play.google.com/console → Kaydol ($25 tek seferlik) → Create app × 2
   - Android build: `cd apps/customer && eas build --profile production --platform android`

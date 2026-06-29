# Pastacım Web Sürümleri — Tasarım (Expo Web)

**Tarih:** 2026-06-29
**Durum:** Onaylandı (brainstorming)
**Hedef:** `apps/customer` ve `apps/baker` uygulamalarının web + mobil-web sürümlerini, mevcut kod tabanını yeniden kullanarak `ipekciapp.com` alt alan adları üzerinden yayınlamak.

## Amaç & Bağlam

Reklam/yaygınlaştırma aşamasında, uygulamayı indirmeden kullanmak isteyen kullanıcılar için web ve mobil-web sürümleri gerekli. İki ayrı uygulama olduğundan iki ayrı web sayfası olacak. Her web sayfasının üstünde iOS ve Android store linkleri görünecek. "Herşey aynı mantıkta olsun" → mobil uygulamayla aynı kod tabanı.

## Kararlar (brainstorming çıktısı)

| Konu | Karar |
|---|---|
| Teknik yaklaşım | **Expo Web (react-native-web)** — mevcut `apps/customer`/`apps/baker` ekranları web'e derlenir; yeni app yok |
| Domain | Müşteri: `pastacim.ipekciapp.com` — Pastacı: `pastacimpro.ipekciapp.com` |
| Hosting | **Cloudflare Pages** (DNS zaten Cloudflare'de) — statik SPA export |
| Kapsam | **Tam parite**, web fallback'li (auth, sipariş/teklif, mesajlaşma, profil) |
| Harita (web) | **Tam etkileşimli Google Maps JavaScript API** |
| Push (web) | Kapsam dışı (sonraki faz: web-push) |

## A. Mimari — Tek Kod Tabanı

Mevcut `apps/customer` ve `apps/baker` olduğu gibi web'e derlenir. Yeni uygulama oluşturulmaz.

Her iki app'e eklenecekler:
- **Dev/runtime bağımlılıkları:** `react-native-web`, `react-dom`, `@expo/metro-runtime` (SDK 56 ile uyumlu sürümler — `npx expo install` ile)
- **`app.config.js` web bloğu:**
  ```js
  web: { bundler: "metro", output: "single", favicon: "./assets/favicon.png", name: "Pastacım" /* veya "Pastacım Pro" */ }
  ```
- **`package.json` script'leri:** `"web": "expo start --web"`, `"export:web": "expo export -p web"`

Metro `.web.tsx` / `.web.ts` uzantılarını platform-bazlı otomatik çözer; native ekranlara dokunulmaz.

## B. Native Modül Web Shim'leri

Web'de patlayan/çalışmayan 3 native bağımlılık:

### B1. Oturum Depolama — `packages/shared/lib/supabase.ts`
**Sorun:** Storage adapter doğrudan `expo-secure-store` kullanıyor (web'de desteklenmez → throw) ve `detectSessionInUrl: false` (web OAuth redirect dönüşünde session yakalanmaz).

**Çözüm:** Tek dosyada `Platform.OS === 'web'` koşulu:
- Web: `localStorage` tabanlı adapter (`getItem`/`setItem`/`removeItem`) + `detectSessionInUrl: true`
- Native: mevcut `ExpoSecureStoreAdapter` + `detectSessionInUrl: false`

Ayrı dosya gerekmez; koşul en temiz çözüm.

### B2. Harita — `react-native-maps`
**Sorun:** `react-native-maps` web'de desteklenmez.

**Çözüm:** `MapView` kullanan ekranlar için `*.web.tsx` shim; web'de **Google Maps JavaScript API** ile tam etkileşimli harita (lat/lng seçici + işaretçi). Mevcut native ekran dosyaları değişmez. Map bileşeni paylaşılan bir sarmalayıcıya (`packages/shared/components/MapView` + `.web.tsx`) çıkarılır ki iki app de kullansın.

**Config:** Google Maps JS API key (web origin kısıtlı). Mevcut Places API key'i (baker `app.json` extra) ile aynı GCP projesinden Maps JavaScript API etkinleştirilir; web origin allowlist'e domainler eklenir.

### B3. Push — `expo-notifications`
**Çözüm:** Web'de no-op shim (`useNotifications.web.ts` boş/early-return). Push bu fazda kapsam dışı.

## C. Üst Banner — Store Linkleri + Responsive Layout

Her iki app'in root layout'una **sticky üst banner** (`Platform.OS === 'web'` koşuluyla yalnız web'de render):
- Sol: "Pastacım" / "Pastacım Pro" logo + ad
- Sağ: **App Store** + **Google Play** rozet linkleri (store URL'lerine; onay sonrası canlı)
- Mobil web'de banner daralır; içerik responsive `maxWidth` ile ortalanır

Bileşen: `packages/shared/components/WebStoreBanner.tsx` (sadece web'de mount). Store URL'leri her app'in config'inden (extra) okunur.

## D. Google OAuth — Web Flow

Web'de `expo-auth-session` yerine Supabase native web redirect:
```ts
supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
```
`detectSessionInUrl: true` (B1) ile dönüşte session yakalanır. `useAuth` içindeki Google giriş fonksiyonu `Platform.OS === 'web'` dalı alır.

**Gereken config (kod dışı):**
- Supabase Auth → Redirect URLs: `https://pastacim.ipekciapp.com/*`, `https://pastacimpro.ipekciapp.com/*`
- Google Cloud Console OAuth → Authorized JavaScript origins + redirect URIs: aynı origin'ler

## E. Hosting & Deploy — Cloudflare Pages

- Build: `expo export -p web` → `dist/` (statik SPA)
- İki ayrı Cloudflare Pages projesi:
  - `pastacim-web` → `pastacim.ipekciapp.com`
  - `pastacimpro-web` → `pastacimpro.ipekciapp.com`
- **SPA fallback:** `dist/_redirects` içine `/* /index.html 200` (expo-router client-side routing için zorunlu)
- DNS zaten Cloudflare'de → custom domain bağlama CNAME ile otomatik

### E1. Mevcut Yasal Worker ile Birlikte Yaşama (KRİTİK — URL kırılmamalı)
`pastacim.ipekciapp.com` şu an `web/legal/` Cloudflare Worker'ı tarafından **custom domain** olarak tutuluyor ve şu yolları sunuyor: `/terms`, `/privacy` (Apple & Play'e verilen yasal URL'ler), `/unsubscribe` (gönderilmiş e-postalardaki abonelikten-çık linki — dolaşımda).

**Bu 3 URL aynen korunmalı.** Çözüm:
1. `web/legal/wrangler.toml` → Worker'ı `custom_domain = true` (tüm subdomain) yerine **path-route'lara** çevir:
   `pastacim.ipekciapp.com/terms*`, `/privacy*`, `/unsubscribe*`
2. `pastacim.ipekciapp.com`'u `pastacim-web` Pages projesine custom domain olarak bağla.
3. Cloudflare'de **Worker route'ları Pages'ten önceliklidir** → bu 3 yol Worker'a, geri kalan her şey Pages'e (web app) gider.

Sonuç: web app kökte (`/`), mevcut yasal/unsubscribe URL'leri hiç değişmeden çalışır. `pastacimpro.ipekciapp.com`'da worker yok → doğrudan Pages.

## F. Kapsam Dışı (Bu Faz)

- Push bildirimleri (web-push sonraki faz)
- Native harita etkileşim detayları web'de sadeleştirilebilir (kritik akış: konum seçimi çalışır)
- Apple IAP / ödeme gateway (zaten yok)

## G. Test & Doğrulama

1. `cd apps/customer && npx tsc --noEmit` + `cd apps/baker && npx tsc --noEmit` — hatasız
2. `npm run tsc:shared` — hatasız
3. `expo export -p web` her iki app'te hatasız tamamlanır
4. Lokal `expo start --web` ile duman testi: email girişi, Google girişi, sipariş oluştur/teklif ver, mesajlaşma (realtime), profil
5. Cloudflare Pages preview deploy → custom domain doğrulaması

## Riskler / Açık Noktalar

- **react-native-maps web build'i kırabilir:** import edilen native modül web bundler'da fail edebilir → `*.web.tsx` shim + gerekirse metro resolver alias ile izole edilmeli.
- **Reanimated/worklets web uyumu:** SDK 56 ile genelde sorunsuz; export sırasında doğrulanır.
- **Store linkleri henüz canlı değil** (Apple review ⏳, Play kapalı test) → rozetler eklenir, URL'ler hazır olunca güncellenir.
- **expo-secure-store dışındaki native importlar** (örn. dosya/galeri) web fallback gerektirebilir → export hatalarıyla ortaya çıkar, tek tek shim'lenir.

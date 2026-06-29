# Web Sürümleri — Deploy & Config Rehberi

Customer (`pastacim.ipekciapp.com`) ve Baker (`pastacimpro.ipekciapp.com`) web sürümleri.
Expo Web (react-native-web) → statik SPA → Cloudflare Pages. Mevcut yasal Worker korunur.

## Korunan URL'ler (DEĞİŞMEZ)
- `https://pastacim.ipekciapp.com/terms`
- `https://pastacim.ipekciapp.com/privacy`
- `https://pastacim.ipekciapp.com/unsubscribe`

Bunlar `web/legal/` Cloudflare Worker'ında kalır; Pages app'i kökü (`/`) ve diğer rotaları sunar. Cloudflare'de Worker route'ları Pages'ten önceliklidir.

## 1. Web build (her deploy öncesi)
```bash
cd apps/customer && npx expo export -p web   # → apps/customer/dist
cd apps/baker    && npx expo export -p web   # → apps/baker/dist
```
`dist/index.html` ve `dist/_redirects` (`/* /index.html 200`) üretilir.

## 2. Yasal Worker'ı route moduna al (custom_domain → path routes)
`web/legal/wrangler.toml` zaten path-route'lara çevrildi (`/terms*`, `/privacy*`, `/unsubscribe*`).
Önce bunu deploy et ki subdomain Pages'e açılabilsin (legal URL'ler route'lar sayesinde çalışmaya devam eder):
```bash
cd web/legal && npx wrangler deploy
# Doğrula:
curl -sI https://pastacim.ipekciapp.com/terms | head -1   # 200, HTML
```
> İlk sefer Cloudflare girişi gerekir: `npx wrangler login` (ipekciapp.com hesabı). Claude bu interaktif adımı yapamaz — `! npx wrangler login` ile sen çalıştır.

## 3. Cloudflare Pages deploy
```bash
cd apps/customer && npx wrangler pages deploy dist --project-name pastacim-web
cd apps/baker    && npx wrangler pages deploy dist --project-name pastacimpro-web
```
Her biri bir `*.pages.dev` preview URL döndürür.

## 4. Custom domain bağla (Cloudflare Dashboard)
- Pages → `pastacim-web` → Custom domains → `pastacim.ipekciapp.com`
- Pages → `pastacimpro-web` → Custom domains → `pastacimpro.ipekciapp.com`

DNS zaten Cloudflare'de. Doğrula:
```bash
curl -sI https://pastacim.ipekciapp.com/        | head -1   # 200 (app)
curl -sI https://pastacim.ipekciapp.com/terms    | head -1   # 200 (worker - HTML yasal)
curl -sI https://pastacimpro.ipekciapp.com/      | head -1   # 200 (app)
```

## 5. Supabase Auth — Redirect URLs
Authentication → URL Configuration → Redirect URLs'e ekle:
```
https://pastacim.ipekciapp.com/*
https://pastacimpro.ipekciapp.com/*
http://localhost:8081/*          # lokal web test
```
(Management API + PAT ile de yapılabilir.)

## 6. Google OAuth (Cloud Console)
OAuth 2.0 Client → Authorized JavaScript origins:
```
https://pastacim.ipekciapp.com
https://pastacimpro.ipekciapp.com
```
Redirect URI olarak Supabase callback zaten ekli olmalı:
`https://lvrbzhziayegyinkcuka.supabase.co/auth/v1/callback`

## 7. Google Maps API key — ⚠️ GÜVENLİK (billing abuse koruması)
Web'de Maps JS key bundle'da herkese görünür. Kısıtlama ŞART, aksi halde kötüye kullanımla faturalandırılabilirsin.

**Önerilen:** Web için **AYRI bir Maps JavaScript API key** oluştur (mevcut native Places key'ini yeniden kullanma — o muhtemelen Android/iOS app-kısıtlı; web'de ya çalışmaz ya da kısıtsız kalır).
1. GCP → Credentials → Create API key (web).
2. Application restrictions → **HTTP referrers** → ekle:
   `https://pastacim.ipekciapp.com/*`, `https://pastacimpro.ipekciapp.com/*`
3. API restrictions → Maps JavaScript API (+ Places API gerekiyorsa).
4. Bu key'i build sırasında `GOOGLE_MAPS_API_KEY` env ile ver (config bunu okur; yoksa eski Places key'e düşer):
   ```bash
   GOOGLE_MAPS_API_KEY=<web-key> npx expo export -p web
   ```
   Böylece hardcoded key yerine env'den gelir.

## Deploy sırası özeti
build → worker route deploy (legal korunur) → pages deploy → custom domain bağla → Supabase/Google/Maps config → doğrula.

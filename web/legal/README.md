# Pastacım — Yasal Dokümanlar (Cloudflare Worker)

Kullanım Koşulları ve Gizlilik Politikası'nı **düzgün `text/html`** ile servis eder.

**Neden Worker?** Supabase Edge Functions, `*.supabase.co` paylaşılan alan adında
yanıtı zorla `text/plain` + `sandbox` CSP ile döndürür (anti-phishing). Bu yüzden
eski `.../functions/v1/terms` ve `/privacy` URL'leri App Store'da ham HTML olarak
görünüyordu. Bu Worker temiz HTML döner.

## URL'ler

- https://pastacim.ipekciapp.com/terms
- https://pastacim.ipekciapp.com/privacy

## Deploy

```bash
cd web/legal
npx wrangler login        # ilk sefer Cloudflare girişi (ipekciapp.com hesabı)
npx wrangler deploy
```

`wrangler.toml` içindeki route'lar `pastacim.ipekciapp.com` subdomain'ini bu
Worker'a bağlar. ipekciapp.com zaten Cloudflare'de yönetildiği için ek DNS
gerekmez; Cloudflare proxied bir route kaydı otomatik oluşturur.

## Deploy sonrası

App Store Connect ve Google Play Console'da eski Supabase URL'lerini bu yenilerle
değiştir. İçeriği değiştirmek için `src/index.js` içindeki `TERMS` / `PRIVACY`
sabitlerini düzenle, tekrar `wrangler deploy`.

İçerik, uygulama içindeki native ekranlarla (`apps/*/app/(auth)/terms.tsx`,
`privacy.tsx`) tutarlı tutulmalıdır.

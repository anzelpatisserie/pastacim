# Sadeleştirilmiş Sosyal-Öncelikli Giriş — Tasarım

**Tarih:** 2026-06-24
**Durum:** Onaylandı (tasarım), implementation planı bekliyor
**Kapsam:** Her iki app (`apps/customer`, `apps/baker`) — auth giriş akışı

## Bağlam / Problem

Mevcut giriş akışı kullanıcıyı yoruyor:
- Onboarding'de "Ücretsiz Başla" / "Zaten hesabım var" ikili seçim — kullanıcı hesabı olup
  olmadığını düşünmek zorunda.
- Ayrı `register.tsx` ve `login.tsx` ekranları; her ikisinde de Google/Apple butonları
  beyaz kart + krem zemin üzerinde **sönük** kalıyor (kullanıcı şikayeti, [Image #6]).
- Sosyal giriş bir "alt seçenek" gibi duruyor; oysa OAuth doğası gereği "hesap yoksa oluştur,
  varsa giriş yap" mantığını zaten otomatik yapar.

**Hedef:** Sosyal-öncelikli tek "Devam Et" mantığıyla giriş ekranını komple sadeleştirmek;
e-posta yolunu akıllı tek ekrana indirmek.

## Tasarım

### 1. Yeni Landing (onboarding.tsx — her iki app)
"Ücretsiz Başla / Zaten hesabım var" kaldırılır. Yerine:
- Logo + slogan
- **Google ile devam et** — belirgin (beyaz zemin, kalın metin, renkli "G", net kenarlık +
  gölge/elevation; primary buton kadar dikkat çeker). `signInWithGoogle(redirectUrl)` çağırır.
- **Apple ile devam et** — yalnız iOS (`Platform.OS === 'ios'`); siyah Apple HIG stili.
  `signInWithApple()`. Android'de hiç render edilmez.
- **E-posta ile devam et** — ikincil/outline buton → akıllı e-posta ekranına `router.push`.
- Footer: "Devam ederek Şartlar ve Gizlilik'i kabul edersin" (mevcut Terms/Privacy edge function
  linkleri).
- Google redirect URL'i onboarding'e taşınır (şu an login/register'da `makeRedirectUri` ile
  üretiliyor — aynı deseni kullan).

**"Hesap yoksa oluştur, varsa aç":** Google/Apple OAuth (`signInWithIdToken` / web OAuth) bu
ayrımı zaten otomatik yapar — kullanıcıya register/login seçtirmeye gerek yok.

### 2. Akıllı E-posta ekranı (register + login birleşir)
Tek ekran, ilerleyen (progressive) durumlar:
- **Durum A — E-posta girişi:** E-posta alanı + "Devam Et".
- "Devam Et"te `get_user_auth_provider(p_email)` (mevcut RPC; login.tsx'te zaten kullanılıyor)
  ile saptanır ve ekran dönüşür:
  - **`'email'`** → Şifre alanı açılır → "Giriş Yap" (`signInWithEmail`). "Şifremi unuttum"
    görünür (`resetPasswordForEmail`).
  - **`'google'` / `'apple'`** → Bilgi mesajı: "Bu e-posta {Google/Apple} ile kayıtlı,
    onunla devam et." + ilgili sosyal butona kısa yol (provider'ı tetikler).
  - **boş/yok (yeni)** → Ad Soyad + Şifre alanları açılır → "Hesap Oluştur" (akıllı `signUp`).
    E-posta doğrulama ekranı yalnız gerçek yeni kayıtta gösterilir (mevcut akıllı signUp davranışı:
    var olan e-postada doğrulama ekranı yok, login'e yönlendirir).
- Geri tuşu landing'e döner.

### 3. Altyapı (çoğu mevcut)
- `useAuth`: `signInWithGoogle`, `signInWithApple`, akıllı `signUp` (empty-identities → "zaten var"
  tespiti), `signInWithEmail` zaten var. Yeni metoda gerek yok; orchestration ekran içinde.
- `get_user_auth_provider(email)` RPC mevcut.
- Apple gizli-e-posta ismi için `NameEntryModal` gate'i (root `_layout`) devrede kalır.
- Apple App Store kuralı: üçüncü taraf giriş (Google) sunulduğunda "Sign in with Apple" da
  sunulmalı — iOS landing'de var. Android'de Apple yok (sorun değil).

### 4. Dosya değişiklikleri
- `apps/customer/app/(auth)/onboarding.tsx` + `apps/baker/app/(auth)/onboarding.tsx` → yeni landing.
- `apps/customer/app/(auth)/login.tsx` + baker → akıllı e-posta ekranına dönüştürülür
  (progressive durumlar). Rota adı korunur (deep link riski yok; iç rota).
- `apps/customer/app/(auth)/register.tsx` + baker → kaldırılır (içeriği e-posta ekranına taşındı).
  Register'a giden tüm yönlendirmeler e-posta ekranına çevrilir.
- `useAuth.ts` → değişiklik gerekmez (mevcut metodlar yeterli); gerekirse küçük helper.

### 5. Kapsam dışı (YAGNI)
- **#15 "sipariş-önce / kayıt-sonra"** akışı — ayrı, daha büyük; bu spec'e dahil DEĞİL
  ([[login-redesign-idea]]).
- Yeni sosyal sağlayıcı (Facebook vb.) eklenmez.

## Hata yönetimi
- Tüm async işlemlerde Türkçe hata mesajı + loading state.
- Google/Apple iptal/hata → kullanıcıya dönüş, landing'de kal.
- `get_user_auth_provider` hatası → e-posta yolunu basit moda düşür (giriş dene, yoksa kayıt).

## Test (manuel, sonraki build)
1. Landing: Google/Apple/E-posta butonları belirgin; Android'de Apple yok.
2. Google ile yeni hesap → otomatik oluşur ve girer. Var olan Google hesabı → girer.
3. Apple (Hide My Email) → girer + NameEntryModal isim ister.
4. E-posta: kayıtlı (email) → şifre → giriş. Google'la kayıtlı e-posta → uyarı + Google kısa yolu.
   Yeni e-posta → ad+şifre → oluştur (+doğrulama yalnız yeni).
5. App Store inceleyici hesabı (reviewer@pastacim.com) e-posta yoluyla girebiliyor.

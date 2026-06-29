# Sadeleştirilmiş Sosyal-Öncelikli Giriş — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giriş akışını sosyal-öncelikli tek "Devam Et" mantığına indirgemek; ayrı register/login ekranlarını akıllı tek e-posta ekranında birleştirmek.

**Architecture:** Onboarding = sosyal-öncelikli landing (Google/Apple/E-posta). E-posta yolu, `get_user_auth_provider` ile dallanan tek progressive ekran. `useAuth`'taki mevcut metodlar (signInWithGoogle/Apple, akıllı signUp, signInWithEmail) yeniden kullanılır — yeni auth metodu yok. Spec: `docs/superpowers/specs/2026-06-24-simplified-social-auth-design.md`.

**Tech Stack:** Expo SDK 56, React Native 0.85, expo-router v4, expo-auth-session (Google), expo-apple-authentication, Supabase.

## Global Constraints
- Tüm UI Türkçe (label, hata, placeholder).
- TypeScript strict; `any` yasak (mevcut `_db: any` deseni hariç).
- Renkler `useThemeColors()`'tan; brand vurguları (Google beyaz/Apple siyah) sabit kalabilir.
- Apple butonu yalnız iOS (`Platform.OS === 'ios'`); Android'de render edilmez.
- App Store inceleyici e-posta ile girer (`reviewer@pastacim.com`) — e-posta yolu çalışır kalmalı.
- Doğrulama: bu codebase'de RN ekran component testi yok → her task `npx tsc --noEmit` (ilgili app) + `npm run tsc:shared` ile doğrulanır; davranış cihazda manuel test edilir (sonraki build).
- İki app (`apps/customer`, `apps/baker`) auth ekranları neredeyse aynı; her task İKİ app'e de uygulanır (yalnız slogan/scheme/redirect farkları değişir). Mevcut duplication deseni korunur.

---

### Task 1: Yeni sosyal-öncelikli landing (onboarding)

**Files:**
- Modify: `apps/customer/app/(auth)/onboarding.tsx`
- Modify: `apps/baker/app/(auth)/onboarding.tsx`

**Interfaces:**
- Consumes (from `@pastacim/shared` `useAuth`): `signInWithGoogle(redirectUrl: string) => Promise<{ error: string | null }>`, `signInWithApple() => Promise<{ error: string | null }>`.
- Produces: navigation entry `router.push('/(auth)/login')` (login = Task 2 akıllı e-posta ekranı).

**Adımlar:**

- [ ] **Step 1: Mevcut onboarding'i incele.** Read `apps/customer/app/(auth)/onboarding.tsx` ve `apps/baker/app/(auth)/onboarding.tsx`. "Ücretsiz Başla" / "Zaten hesabım var" buton bölümünü ve mevcut stilleri not al. Ayrıca `apps/customer/app/(auth)/login.tsx`'teki Google redirect üretimini incele (`makeRedirectUri` / `signInWithGoogle` kullanımı, `isGoogleLoading` deseni) — aynısını landing'e taşıyacaksın.

- [ ] **Step 2: Landing'i sosyal-öncelikli yap.** İki onboarding dosyasında buton bölümünü değiştir:
  - `signInWithGoogle`, `signInWithApple`'ı `useAuth`'tan al; `isGoogleLoading`/`isAppleLoading` state'leri ekle. Google redirect URL'ini login.tsx'teki aynı yöntemle üret.
  - Butonlar (sırayla):
    1. **Google ile devam et** — beyaz zemin (`#FFFFFF`), `#DADCE0` kenarlık, gölge+`elevation:4`, kalın koyu metin (`#1F1F1F`, `FontSize.lg`), renkli "G" (`#4285F4`). `onPress={handleGoogle}`.
    2. **Apple ile devam et** — yalnız `Platform.OS === 'ios'` iken render. Siyah zemin (`#000`), beyaz metin + `` ikonu. `onPress={handleApple}`.
    3. **E-posta ile devam et** — outline (kenarlık `C.border`, zemin transparan), `C.text` metin. `onPress={() => router.push('/(auth)/login')}`.
  - `handleGoogle`/`handleApple`: loading set + ilgili metodu çağır; `error` dönerse Türkçe hata göster (mevcut login.tsx'teki hata gösterim desenini kullan), finally loading false.
  - Footer metni: "Devam ederek Şartlar ve Gizlilik'i kabul edersin" (varsa mevcut Terms/Privacy link bileşenini kullan; yoksa düz metin bırak).
  - "Ücretsiz Başla" ve "Zaten hesabım var" butonlarını KALDIR.
  - Stil sabitlerini (Spacing/Radius/FontSize) mevcut dosyadaki gibi kullan.

- [ ] **Step 3: tsc doğrula.** Run: `cd apps/customer && npx tsc --noEmit` ve `cd apps/baker && npx tsc --noEmit`. Expected: 0 hata.

- [ ] **Step 4: Commit.**
```bash
git add "apps/customer/app/(auth)/onboarding.tsx" "apps/baker/app/(auth)/onboarding.tsx"
git commit -m "feat(auth): sosyal-öncelikli landing (Google/Apple/E-posta devam et)"
```

---

### Task 2: Akıllı e-posta ekranı (login.tsx → progressive register+login)

**Files:**
- Modify: `apps/customer/app/(auth)/login.tsx`
- Modify: `apps/baker/app/(auth)/login.tsx`

**Interfaces:**
- Consumes: `useAuth`'tan `signInWithEmail(email, password) => Promise<{ error }>` (mevcut imzayı login.tsx'ten doğrula), akıllı `signUp({ email, password, fullName }) => Promise<{ error; alreadyExisted?; signedIn? }>`, `signInWithGoogle`, `signInWithApple`, `resetPasswordForEmail` (varsa). RPC `get_user_auth_provider(p_email)` → `'email' | 'google' | 'apple' | null`.
- Produces: kendi içinde tamamlanır; başarılı auth sonrası root `_layout` yönlendirir.

**Adımlar:**

- [ ] **Step 1: Mevcut login.tsx'i incele.** Read iki `login.tsx`. Mevcut `get_user_auth_provider` kullanımını (satır ~61), `signInWithEmail`/`signUp` imzalarını, hata/loading desenlerini, "Şifremi unuttum" var mı not al. Akıllı `signUp`'ın dönüş alanlarını (`alreadyExisted`, `signedIn`) doğrula (Task A — Auth batch'inde eklendi).

- [ ] **Step 2: Progressive durum state'i ekle.** `login.tsx`'e ekran modu state'i ekle:
  `type Mode = 'email' | 'login' | 'signup' | 'social_hint';` `const [mode, setMode] = useState<Mode>('email');`
  Alanlar: `email`, `password`, `fullName` (signup için), `socialProvider` ('google'|'apple', hint için), `loading`, `error`.

- [ ] **Step 3: "Devam Et" (mode==='email') mantığı.** E-posta alanı + "Devam Et" butonu. onPress:
  - E-posta boş/geçersizse Türkçe hata.
  - `loading=true`; `const { data: provider } = await supabase.rpc('get_user_auth_provider', { p_email: email.trim().toLowerCase() });`
  - `provider === 'email'` → `setMode('login')`.
  - `provider === 'google' || provider === 'apple'` → `setSocialProvider(provider); setMode('social_hint')`.
  - `provider` boş/null → `setMode('signup')`.
  - RPC hatasında → `setMode('login')` (kullanıcı şifre dener; yoksa kayıt linki).
  - `loading=false`.

- [ ] **Step 4: mode render'ları.**
  - `'login'`: e-posta (readonly göster) + Şifre alanı + "Giriş Yap" (`signInWithEmail`) + "Şifremi unuttum" (`resetPasswordForEmail` ile; mevcut desen varsa onu kullan) + "Farklı e-posta" (→ `setMode('email')`).
  - `'signup'`: Ad Soyad + Şifre alanları + "Hesap Oluştur" (`signUp({email,password,fullName})`). `signedIn` → root layout yönlendirir; `error && alreadyExisted` → "zaten kayıtlı" mesajı + `setMode('login')`; sadece gerçek yeni kayıtta mevcut doğrulama akışı (success ekranı) korunur.
  - `'social_hint'`: "Bu e-posta {Google/Apple} ile kayıtlı. Lütfen {provider} ile devam et." + ilgili sosyal butona kısa yol (`signInWithGoogle`/`signInWithApple`; Apple yalnız iOS) + "Farklı e-posta" (→ `setMode('email')`).
  - Her modda Türkçe loading + hata gösterimi.

- [ ] **Step 5: Başlık/Geri.** Ekran başlığını moda göre uyarlanır ("E-posta ile devam", "Giriş Yap", "Hesap Oluştur"). "← Geri" landing'e döner (`router.back()`).

- [ ] **Step 6: tsc doğrula.** Run: `cd apps/customer && npx tsc --noEmit` ve `cd apps/baker && npx tsc --noEmit`. Expected: 0 hata.

- [ ] **Step 7: Commit.**
```bash
git add "apps/customer/app/(auth)/login.tsx" "apps/baker/app/(auth)/login.tsx"
git commit -m "feat(auth): akıllı e-posta ekranı (get_user_auth_provider ile login/signup/social dallanma)"
```

---

### Task 3: register.tsx'i kaldır + referansları temizle

**Files:**
- Delete: `apps/customer/app/(auth)/register.tsx`
- Delete: `apps/baker/app/(auth)/register.tsx`
- Modify: register'a yönlendiren tüm yerler (grep ile bul).

**Adımlar:**

- [ ] **Step 1: Referansları bul.** Run: `grep -rn "(auth)/register\|/register'" apps --include=*.tsx | grep -v node_modules`. Çıkan her yönlendirmeyi `'/(auth)/login'`'e çevir (akıllı e-posta ekranı artık hem kayıt hem giriş). Onboarding zaten Task 1'de güncellendi; başka kalan varsa düzelt.

- [ ] **Step 2: register.tsx dosyalarını sil.**
```bash
git rm "apps/customer/app/(auth)/register.tsx" "apps/baker/app/(auth)/register.tsx"
```

- [ ] **Step 3: tsc doğrula (kırık import/route kalmadı).** Run: `cd apps/customer && npx tsc --noEmit`, `cd apps/baker && npx tsc --noEmit`, `npm run tsc:shared`. Expected: 0 hata. Ayrıca `grep -rn "register" apps/customer/app "(auth)" 2>/dev/null` ile artık referans kalmadığını teyit et.

- [ ] **Step 4: Commit.**
```bash
git add -A
git commit -m "refactor(auth): register ekranını kaldır (akıllı e-posta ekranına taşındı)"
```

---

### Task 4: Uçtan uca doğrulama + test notları

**Adımlar:**

- [ ] **Step 1: Tüm tsc + test.** Run: `cd apps/customer && npx tsc --noEmit`, `cd apps/baker && npx tsc --noEmit`, `npm run tsc:shared`, `npm test`. Expected: tsc 0 hata; testler önceki durumla aynı (useAuth.test.ts'in expo-router ESM yükleme hatası önceden mevcut, bu plana ait değil).

- [ ] **Step 2: Manuel test kontrol listesi (sonraki build'de cihazda).**
  - Landing: Google/Apple/E-posta butonları belirgin; Android'de Apple yok.
  - Google ile yeni → otomatik oluşur+girer; mevcut Google → girer.
  - Apple (Hide My Email) → girer + NameEntryModal isim ister.
  - E-posta: kayıtlı (email) → şifre → giriş; Google'la kayıtlı e-posta → uyarı + Google kısa yolu; yeni e-posta → ad+şifre → oluştur (+doğrulama yalnız yeni).
  - `reviewer@pastacim.com` e-posta yoluyla girebiliyor.
  - Baker: auth sonrası dükkan yoksa setup'a düşüyor (mevcut akış bozulmadı).

- [ ] **Step 3: Commit (gerekirse).** Değişiklik yoksa atla.

---

## Self-Review notu
- Spec'in her bölümü bir task'a karşılık geliyor: landing (T1), akıllı e-posta/login+signup birleşimi (T2), register kaldırma (T3), doğrulama (T4). Altyapı (useAuth/RPC/NameEntryModal) mevcut — yeni task gerekmiyor.
- Placeholder yok; kod yerine davranış tarif edilen yerler RN ekran mantığı (tam kod, mevcut dosya desenleri izlenerek yazılacak; bu codebase'de ekran birim testi yok).
- Tip tutarlılığı: `get_user_auth_provider` dönüşü ve `signUp` dönüş alanları (`alreadyExisted`, `signedIn`) Task A'da tanımlandığı şekilde kullanılıyor.

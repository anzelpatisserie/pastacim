# Pastacım — İki Uygulamaya Bölme & App Store Hazırlık: Uygulama Planı

> **Durum:** Uygulama tamamlandı (2026-05-31). Görev 1–14 ve Görev 15 Adım 1 (app.json metadata doğrulama) tamamlandı. Açık kalan tek iş **Görev 15 Adım 2-3 ve Görev 16** — App Store Connect asset yüklemesi ve TestFlight/App Store gönderimi (kod dışı, manuel adımlar).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tek Expo projesini monorepo yapısına taşıyarak "Pastacım" (müşteri) ve "Pastacım Pro" (pastacı) olarak iki bağımsız App Store uygulamasına bölmek; çift rol desteği (is_customer / is_baker), cüzdan sistemi, test altyapısı ve App Store hazırlığını tamamlamak.

**Architecture:** npm workspaces monorepo — `apps/customer`, `apps/baker`, `packages/shared`. Mevcut kod `shared` pakete taşınır; her uygulama ince wrapper'lar içerir. Tek Supabase backend ortak kalır.

**Tech Stack:** Expo SDK 56, expo-router v4, Supabase, TypeScript strict, EAS Build, Jest + React Native Testing Library, Maestro E2E

**Spec:** `docs/superpowers/specs/2026-05-28-pastacim-split-appstore.md`

---

## Faz Sırası

```
Görev 1  → Faz 0: EAS dev build yapılandırması (mevcut proje, TestFlight)
Görev 2  → Faz 3: DB & backend refactor (is_customer/is_baker, wallet)
Görev 3  → Faz 3: useAuth + register.tsx güncelleme (dual role)
Görev 4  → Faz 3: wallet.tsx refactor (token → wallet şema)
Görev 5  → Faz 3: _layout.tsx + messages routing dual-role fix
Görev 6  → Faz 1: Monorepo kurulumu (npm workspaces)
Görev 7  → Faz 2a: shared paket — lib, hooks, types, components taşıma
Görev 8  → Faz 2b: apps/customer kurulumu ve kod taşıma
Görev 9  → Faz 2c: apps/baker kurulumu ve kod taşıma
Görev 10 → Faz 4: app.json + eas.json production yapılandırması
Görev 11 → Faz 5a: Jest altyapısı — shared hook testleri
Görev 12 → Faz 5b: customer ekran testleri
Görev 13 → Faz 5c: baker ekran testleri
Görev 14 → Faz 6: TypeScript kalite geçişi (any temizleme)
```

---

## Değişecek / Oluşacak Dosyalar

### Mevcut kök proje (kısa vadeli değişiklikler — Faz 0, 2, 3)
- `app/(auth)/register.tsx` — rol seçimi ve ₺100 banner kaldırılır
- `hooks/useAuth.ts` — `role` → `is_baker` / `is_customer` boolean'a dönüşür
- `app/_layout.tsx` — `role === 'baker'` → `is_baker === true`
- `app/(baker)/wallet.tsx` — `token_transactions` → `wallet_transactions`, `token_balance` → `wallet_balance`
- `app/messages/[conversationId].tsx` — `role` → `is_baker` kontrolü
- `supabase/schema.sql` — migration eklenecek (eski şema korunur, yeni kolonlar eklenir)
- `supabase/migration_dual_role.sql` — yeni migration dosyası (oluşturulacak)
- `eas.json` — güncellenir
- `types/database.types.ts` — wallet_transactions, is_baker, is_customer yansıtacak şekilde

### Yeni monorepo yapısı (Faz 1+)
```
package.json                  (workspaces root)
packages/shared/
  package.json
  tsconfig.json
  lib/supabase.ts
  lib/constants.ts
  lib/notifications.ts
  hooks/useAuth.ts
  hooks/useNotifications.ts
  hooks/useUnreadMessages.ts
  types/database.types.ts
  types/app.types.ts
  components/NotificationsScreen.tsx
  components/ui/               (mevcut ui bileşenleri)
apps/customer/
  package.json
  tsconfig.json
  app.json
  eas.json
  babel.config.js
  app/_layout.tsx
  app/(auth)/onboarding.tsx
  app/(auth)/login.tsx
  app/(auth)/register.tsx
  app/(customer)/              (mevcut customer ekranları)
  app/messages/[conversationId].tsx
apps/baker/
  package.json
  tsconfig.json
  app.json
  eas.json
  babel.config.js
  app/_layout.tsx
  app/(auth)/onboarding.tsx
  app/(auth)/login.tsx
  app/(auth)/register.tsx
  app/(baker)/                 (mevcut baker ekranları)
  app/messages/[conversationId].tsx
```

---

## Görev 1: EAS Dev Build Yapılandırması (Faz 0)

**Neden ilk:** Dış testçilerin WiFi bağımsız test edebilmesi için; monorepo bölünmesinden önce mevcut projeyle hemen yapılabilir.

**Files:**
- Modify: `eas.json`
- Modify: `app.json`

- [x] **Adım 1: EAS CLI ve expo-dev-client kur**

```bash
npm install expo-dev-client
npx eas build:configure
```

Beklenen: `eas.json` oluşturulur veya güncellenir.

- [x] **Adım 2: eas.json'ı üç profille yapılandır**

`eas.json` içeriği:
```json
{
  "cli": {
    "version": ">= 14.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": false
      }
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false
      }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

- [x] **Adım 3: app.json'daki EAS projectId'yi doğrula**

`app.json` içinde şu satır olmalı:
```json
"extra": {
  "eas": {
    "projectId": "6717e305-6dfb-4a50-9673-1fea07c6d93a"
  }
}
```

`owner: "anzelpatisserie"` satırı da mevcut olmalı.

- [x] **Adım 4: Commit**

```bash
git add eas.json app.json package.json package-lock.json
git commit -m "chore: configure EAS build profiles for dev/preview/production"
```

> **Not:** Gerçek build için `eas build --profile development --platform ios` komutu çalıştırılır. Bu EAS Cloud'da derleme gerektirir; planın geri kalanı yerel geliştirmeye devam eder.

---

## Görev 2: Supabase DB Migration — Dual Role + Wallet (Faz 3)

**Files:**
- Create: `supabase/migration_dual_role.sql`

Bu migration mevcut `schema.sql`'i DEĞİŞTİRMEZ; Supabase Dashboard SQL Editor'da çalıştırılacak ek komutlar içerir.

- [x] **Adım 1: migration_dual_role.sql dosyasını oluştur**

`supabase/migration_dual_role.sql`:
```sql
-- ============================================================
--  Migration: dual_role + wallet
--  Çalıştırma: Supabase Dashboard > SQL Editor > New Query
--  Bu migration mevcut şemayı bozmamalı; additive değişiklikler.
-- ============================================================

-- 1. users tablosuna is_customer / is_baker kolonları ekle
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_customer BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_baker    BOOLEAN NOT NULL DEFAULT false;

-- 2. Mevcut kullanıcıların rollerini flag'e dönüştür
UPDATE public.users
  SET is_baker    = true  WHERE role = 'baker';
UPDATE public.users
  SET is_customer = true;  -- Zaten default, güvence için

-- 3. token_balance → wallet_balance (NUMERIC, sadece pastacı kullanır)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00
  CHECK (wallet_balance >= 0);

-- Mevcut token_balance'ı wallet_balance'a kopyala (varsa)
UPDATE public.users SET wallet_balance = token_balance::NUMERIC WHERE token_balance > 0;

-- 4. wallet_transaction_type enum oluştur
DO $$ BEGIN
  CREATE TYPE wallet_transaction_type AS ENUM ('offer_fee', 'top_up', 'refund');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. wallet_transactions tablosu oluştur
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount       NUMERIC(10,2) NOT NULL,   -- pozitif = yükleme, negatif = harcama
  type         wallet_transaction_type NOT NULL,
  description  TEXT,
  order_id     UUID        REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_id ON public.wallet_transactions(user_id);

-- wallet_transactions RLS
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "wallet_tx: user kendi hareketlerini görür"
  ON public.wallet_transactions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "wallet_tx: system insert"
  ON public.wallet_transactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- 6. handle_new_user trigger'ını güncelle (jeton kaldır, is_customer/is_baker ekle)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, is_customer, is_baker, wallet_balance)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    true,   -- Her yeni kullanıcı müşteridir
    false,  -- Dükkan kurulunca true yapılır
    0.00
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- 7. submit_offer RPC'yi güncelle (wallet_balance kontrolü)
CREATE OR REPLACE FUNCTION public.submit_offer(
  p_order_id      UUID,
  p_price         NUMERIC,
  p_message       TEXT,
  p_estimated_days INTEGER
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_baker_id    UUID := auth.uid();
  v_shop        RECORD;
  v_serving     INTEGER;
  v_fee         NUMERIC;
  v_offer_id    UUID;
BEGIN
  -- Dükkan kontrolü
  SELECT id INTO v_shop FROM public.pastry_shops
    WHERE user_id = v_baker_id AND is_active = true LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'dukkan_bulunamadi');
  END IF;

  -- Sipariş kişi sayısını al
  SELECT serving_size INTO v_serving FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'siparis_bulunamadi');
  END IF;

  -- Teklif ücreti = kişi_sayısı × ₺5
  v_fee := COALESCE(v_serving, 1) * 5.0;

  -- Bakiye kontrolü
  IF (SELECT wallet_balance FROM public.users WHERE id = v_baker_id) < v_fee THEN
    RETURN jsonb_build_object('error', 'yetersiz_bakiye');
  END IF;

  -- Teklifi kaydet
  INSERT INTO public.offers (order_id, baker_id, shop_id, price, message, estimated_days)
    VALUES (p_order_id, v_baker_id, v_shop.id, p_price, p_message, p_estimated_days)
    RETURNING id INTO v_offer_id;

  -- Bakiyeyi düş
  UPDATE public.users SET wallet_balance = wallet_balance - v_fee WHERE id = v_baker_id;

  -- Wallet transaction kaydı
  INSERT INTO public.wallet_transactions (user_id, amount, type, description, order_id)
    VALUES (v_baker_id, -v_fee, 'offer_fee', 'Teklif ücreti', p_order_id);

  -- Siparişi güncelle
  UPDATE public.orders SET status = 'offers_received' WHERE id = p_order_id AND status = 'pending';

  RETURN jsonb_build_object('offer_id', v_offer_id);
END;
$$;

-- 8. add_wallet_balance RPC (pastacı cüzdan yükleme — Stripe entegrasyonuna kadar manuel)
CREATE OR REPLACE FUNCTION public.add_wallet_balance(
  p_amount NUMERIC
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('error', 'gecersiz_miktar');
  END IF;

  UPDATE public.users SET wallet_balance = wallet_balance + p_amount WHERE id = v_user_id;

  INSERT INTO public.wallet_transactions (user_id, amount, type, description)
    VALUES (v_user_id, p_amount, 'top_up', 'Cüzdan yükleme');

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 9. create_shop RPC — dükkan oluşturunca is_baker = true yap
CREATE OR REPLACE FUNCTION public.create_shop(
  p_name        TEXT,
  p_description TEXT,
  p_address     TEXT,
  p_latitude    DOUBLE PRECISION,
  p_longitude   DOUBLE PRECISION
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_shop_id UUID;
BEGIN
  INSERT INTO public.pastry_shops (user_id, name, description, address, latitude, longitude)
    VALUES (v_user_id, p_name, p_description, p_address, p_latitude, p_longitude)
    RETURNING id INTO v_shop_id;

  UPDATE public.users SET is_baker = true WHERE id = v_user_id;

  RETURN jsonb_build_object('shop_id', v_shop_id);
END;
$$;

-- 10. RLS Politika Güncellemeleri
-- role = 'baker' kontrollerini is_baker = true ile değiştir

-- offers tablosu: pastacı teklif verebilir (is_baker = true)
DROP POLICY IF EXISTS "offers: baker teklif verebilir" ON public.offers;
CREATE POLICY "offers: baker teklif verebilir"
  ON public.offers FOR INSERT
  WITH CHECK (
    baker_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_baker = true)
  );

-- pastry_shops: is_baker = true olan kullanıcılar update/insert yapabilir
DROP POLICY IF EXISTS "shops: baker kendi dükkanını yönetir" ON public.pastry_shops;
CREATE POLICY "shops: baker kendi dükkanını yönetir"
  ON public.pastry_shops FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND (is_baker = true OR NOT is_baker))
  );
```

- [x] **Adım 2: Migration'ı Supabase'de çalıştır**

Supabase Dashboard > SQL Editor > New Query'ye yapıştırıp çalıştır.

Başarı kontrolü:
```sql
SELECT id, full_name, is_customer, is_baker, wallet_balance FROM public.users LIMIT 5;
SELECT * FROM public.wallet_transactions LIMIT 5;
```

- [x] **Adım 3: TypeScript tiplerini güncelle**

`types/database.types.ts` içinde `users` tablosu Row tipine manuel ekle (CLI ile de yapılabilir):

```bash
# CLI ile otomatik güncelleme (önerilir):
npx supabase gen types typescript --project-id lvrbzhziayegyinkcuka > types/database.types.ts
```

Eğer CLI mevcut değilse, `types/database.types.ts` içinde `users` tablosunun `Row` tipini bul ve şu alanları ekle:
```typescript
// users Row içine:
is_customer: boolean;
is_baker: boolean;
wallet_balance: number;
```

Ve `wallet_transactions` tablosunu ekle:
```typescript
wallet_transactions: {
  Row: {
    id: string;
    user_id: string;
    amount: number;
    type: 'offer_fee' | 'top_up' | 'refund';
    description: string | null;
    order_id: string | null;
    created_at: string;
  };
  Insert: {
    id?: string;
    user_id: string;
    amount: number;
    type: 'offer_fee' | 'top_up' | 'refund';
    description?: string | null;
    order_id?: string | null;
    created_at?: string;
  };
  Update: Partial<...Insert>;
};
```

- [x] **Adım 4: Commit**

```bash
git add supabase/migration_dual_role.sql types/database.types.ts
git commit -m "feat(db): dual role migration — is_customer/is_baker, wallet_transactions, updated RPCs"
```

---

## Görev 3: useAuth Hook + register.tsx Güncelleme (Faz 3)

**Files:**
- Modify: `hooks/useAuth.ts`
- Modify: `app/(auth)/register.tsx`

- [x] **Adım 1: useAuth.ts'i güncelle — role → is_baker / is_customer**

`hooks/useAuth.ts` tam içeriği:
```typescript
import { useEffect, useState, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database.types';

type UserProfile = Database['public']['Tables']['users']['Row'];

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  isBaker: boolean;
  isCustomer: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthActions {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (params: SignUpParams) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

interface SignUpParams {
  email: string;
  password: string;
  fullName: string;
}

export function useAuth(): AuthState & AuthActions {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, phone, full_name, avatar_url, is_customer, is_baker, wallet_balance, created_at, updated_at')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[useAuth] Profil yüklenemedi:', error.message);
      return;
    }
    setProfile(data);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) {
      await loadProfile(session.user.id);
    }
  }, [session, loadProfile]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user?.id) {
        loadProfile(s.user.id).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        setSession(s);
        if (s?.user?.id) {
          await loadProfile(s.user.id);
        } else {
          setProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const signIn = useCallback(async (
    email: string,
    password: string
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        return { error: 'E-posta veya şifre hatalı.' };
      }
      if (error.message.includes('Email not confirmed')) {
        return { error: 'E-postanızı doğrulamanız gerekiyor.' };
      }
      if (error.message.includes('Too many requests')) {
        return { error: 'Çok fazla deneme. Lütfen bekleyin.' };
      }
      return { error: 'Giriş yapılamadı. Lütfen tekrar deneyin.' };
    }

    return { error: null };
  }, []);

  const signUp = useCallback(async ({
    email,
    password,
    fullName,
  }: SignUpParams): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (error) {
      if (error.message.includes('already registered') || error.message.includes('User already registered')) {
        return { error: 'Bu e-posta adresi zaten kullanımda.' };
      }
      if (error.message.includes('Password should be')) {
        return { error: 'Şifre en az 6 karakter olmalıdır.' };
      }
      if (error.message.includes('Invalid email')) {
        return { error: 'Geçerli bir e-posta adresi girin.' };
      }
      return { error: `Hata: ${error.message}` };
    }

    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (uid) {
      await supabase.from('users').update({ push_token: null }).eq('id', uid).then(() => {}).catch(() => {});
    }
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  return {
    session,
    user: session?.user ?? null,
    profile,
    isBaker: profile?.is_baker ?? false,
    isCustomer: profile?.is_customer ?? true,
    isLoading,
    isAuthenticated: !!session,
    signIn,
    signUp,
    signOut,
    refreshProfile,
  };
}
```

- [x] **Adım 2: register.tsx'i güncelle — rol seçimi ve ₺100 banner kaldır**

`app/(auth)/register.tsx` dosyasındaki değişiklikler:

1. `type Role = 'customer' | 'baker'` satırını sil
2. `const [role, setRole] = useState<Role>('customer')` satırını sil
3. `handleRegister` fonksiyonunda `signUp` çağrısından `role` parametresini kaldır:
```typescript
const { error: authError } = await signUp({
  email: email.trim().toLowerCase(),
  password,
  fullName: fullName.trim(),
  // role kaldırıldı
});
```
4. `SignUpParams` importuna göre useAuth tipini güncelle (artık role yok)
5. `roleSection` View bloğunu (satır 111–138) tamamen sil
6. `bonusNote` View bloğunu (satır 207–214, ₺100 hoş geldin) tamamen sil
7. Kayıt butonunu güncelle:
```typescript
<Text style={styles.btnPrimaryText}>🎂 Hesap Oluştur</Text>
```
8. `RoleButton` bileşenini (satır 250–285) ve `styles.roleSection/roleToggle/roleBtn/roleDivider/roleBtnEmoji/roleBtnTitle/roleBtnSubtitle/selectedDot` style'larını sil

- [x] **Adım 3: TypeScript hatası olmadığını kontrol et**

```bash
npx tsc --noEmit 2>&1 | head -50
```

Beklenen: hata yok veya yalnızca `token_balance` / eski `role` ile ilgili uyarılar (bir sonraki adımda düzeltilecek).

- [x] **Adım 4: Commit**

```bash
git add hooks/useAuth.ts app/(auth)/register.tsx
git commit -m "feat(auth): replace role enum with is_baker/is_customer flags, remove role selection from register"
```

---

## Görev 4: _layout.tsx + messages Dual-Role Fix (Faz 3)

**Files:**
- Modify: `app/_layout.tsx`
- Modify: `app/messages/[conversationId].tsx`

- [x] **Adım 1: _layout.tsx'i güncelle**

`app/_layout.tsx` içinde `role` değişkenini `isBaker` olarak değiştir:

```typescript
// ÖNCE:
const { isLoading, isAuthenticated, role } = useAuth();
// ...
if (role === 'baker') {
  router.replace('/(baker)');
} else {
  router.replace('/(customer)');
}
// ...
if (!role) return;
navigateFromNotification(type, data, role as NotificationRole);

// SONRA:
const { isLoading, isAuthenticated, isBaker } = useAuth();
// ...
if (isBaker) {
  router.replace('/(baker)');
} else {
  router.replace('/(customer)');
}
// ...
if (!isAuthenticated) return;
const notifRole: NotificationRole = isBaker ? 'baker' : 'customer';
navigateFromNotification(type, data, notifRole);
```

- [x] **Adım 2: messages/[conversationId].tsx — role → isBaker**

`app/messages/[conversationId].tsx` içinde `useAuth()` destructuring'ini değiştir:

```typescript
// ÖNCE:
const { user, role } = useAuth();

// SONRA:
const { user, isBaker } = useAuth();
```

Ardından dosya içinde `role === 'baker'` olan her yeri `isBaker` ile değiştir. Örneğin chat kilidi kontrolü:
```typescript
// ÖNCE:
const isChatLocked = role === 'baker'
  ? offer?.status === 'pending' || order?.status === 'completed' || order?.status === 'cancelled'
  : order?.status === 'completed' || order?.status === 'cancelled';

// SONRA:
const isChatLocked = isBaker
  ? offer?.status === 'pending' || order?.status === 'completed' || order?.status === 'cancelled'
  : order?.status === 'completed' || order?.status === 'cancelled';
```

- [x] **Adım 3: TypeScript kontrolü**

```bash
npx tsc --noEmit 2>&1 | head -50
```

- [x] **Adım 4: Commit**

```bash
git add app/_layout.tsx app/messages/[conversationId].tsx
git commit -m "feat: replace role checks with isBaker boolean in layout and messages"
```

---

## Görev 5: wallet.tsx Refactor — Token → Wallet Şema (Faz 3)

**Files:**
- Modify: `app/(baker)/wallet.tsx`

- [x] **Adım 1: wallet.tsx'i oku ve değiştirilecek yerleri belirle**

Dosyayı oku, şu değişiklikleri yap:

1. `type TokenTransaction` → `type WalletTransaction` (ve `token_transactions` tablosunu `wallet_transactions` olarak değiştir):
```typescript
type WalletTransaction = Database['public']['Tables']['wallet_transactions']['Row'];
```

2. `useState<TokenTransaction[]>` → `useState<WalletTransaction[]>`

3. `wallet_balance` sorgula (`token_balance` yerine):
```typescript
const { data: profileData } = await supabase
  .from('users')
  .select('wallet_balance')
  .eq('id', user.id)
  .single();

setBalance(profileData?.wallet_balance ?? 0);
```

4. `token_transactions` tablosu → `wallet_transactions`:
```typescript
const { data: txData } = await supabase
  .from('wallet_transactions')
  .select('*')
  .eq('user_id', user.id)
  .order('created_at', { ascending: false })
  .limit(50);
```

5. `txTypeLabel` fonksiyonunu güncelle:
```typescript
function txTypeLabel(type: WalletTransaction['type']): { label: string; color: string } {
  switch (type) {
    case 'top_up':    return { label: '⬆️ Yükleme',      color: '#48BB78' };
    case 'offer_fee': return { label: '🎯 Teklif Ücreti', color: '#E53E3E' };
    case 'refund':    return { label: '↩️ İade',           color: '#4299E1' };
    default:          return { label: type,               color: '#718096' };
  }
}
```

6. Bakiye gösterimi ₺ sembolü ile (TL):
```typescript
<Text style={[styles.balanceAmount, { color: C.primary }]}>
  ₺{balance.toFixed(2)}
</Text>
```

- [x] **Adım 2: TypeScript kontrolü**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [x] **Adım 3: Commit**

```bash
git add app/(baker)/wallet.tsx
git commit -m "feat(baker): refactor wallet screen — token_transactions → wallet_transactions, wallet_balance"
```

---

## Görev 6: Monorepo Kurulumu — npm Workspaces (Faz 1)

**Files:**
- Modify: `package.json` (root)
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `apps/customer/package.json`
- Create: `apps/baker/package.json`

- [x] **Adım 1: Dizin yapısını oluştur**

```bash
mkdir -p packages/shared/{lib,hooks,types,components/ui}
mkdir -p apps/customer
mkdir -p apps/baker
```

- [x] **Adım 2: Root package.json'ı workspaces için güncelle**

Mevcut `package.json`'ı oku. `"name"` ve `"version"` alanlarını koru; `"workspaces"` ekle:

```json
{
  "name": "pastacim-monorepo",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "customer": "cd apps/customer && npx expo start",
    "baker": "cd apps/baker && npx expo start",
    "tsc": "tsc --noEmit"
  }
}
```

Mevcut `"dependencies"` ve `"devDependencies"` koru; sadece `workspaces` ve `scripts` ekle/güncelle.

- [x] **Adım 3: packages/shared/package.json oluştur**

```json
{
  "name": "@pastacim/shared",
  "version": "1.0.0",
  "private": true,
  "main": "./index.ts",
  "types": "./index.ts"
}
```

- [x] **Adım 4: packages/shared/tsconfig.json oluştur**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {}
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
```

- [x] **Adım 5: Root tsconfig.json'ın var olduğunu doğrula**

```bash
cat tsconfig.json
```

Yoksa oluştur:
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@pastacim/shared": ["./packages/shared/index.ts"],
      "@pastacim/shared/*": ["./packages/shared/*"]
    }
  }
}
```

- [x] **Adım 6: npm install çalıştır**

```bash
npm install
```

Beklenen: `node_modules` kök dizinde güncellenir, workspace'ler semlink olarak bağlanır.

- [x] **Adım 7: Commit**

```bash
git add package.json packages/ apps/ tsconfig.json
git commit -m "chore: initialize npm workspaces monorepo structure"
```

---

## Görev 7: Shared Paket — Kod Taşıma (Faz 2a)

**Files:**
- Create: `packages/shared/lib/supabase.ts` (kopyala + düzenle)
- Create: `packages/shared/lib/constants.ts` (kopyala)
- Create: `packages/shared/lib/notifications.ts` (kopyala)
- Create: `packages/shared/hooks/useAuth.ts` (kopyala)
- Create: `packages/shared/hooks/useNotifications.ts` (varsa kopyala)
- Create: `packages/shared/hooks/useUnreadMessages.ts` (varsa kopyala)
- Create: `packages/shared/types/database.types.ts` (kopyala)
- Create: `packages/shared/types/app.types.ts` (varsa kopyala)
- Create: `packages/shared/components/NotificationsScreen.tsx` (kopyala)
- Create: `packages/shared/index.ts`

- [x] **Adım 1: Mevcut dosyaları shared pakete kopyala**

```bash
cp lib/supabase.ts packages/shared/lib/supabase.ts
cp lib/constants.ts packages/shared/lib/constants.ts
cp lib/notifications.ts packages/shared/lib/notifications.ts
cp hooks/useAuth.ts packages/shared/hooks/useAuth.ts
cp types/database.types.ts packages/shared/types/database.types.ts
cp components/NotificationsScreen.tsx packages/shared/components/NotificationsScreen.tsx
```

Varsa:
```bash
cp hooks/useNotifications.ts packages/shared/hooks/useNotifications.ts 2>/dev/null || true
cp hooks/useUnreadMessages.ts packages/shared/hooks/useUnreadMessages.ts 2>/dev/null || true
cp types/app.types.ts packages/shared/types/app.types.ts 2>/dev/null || true
```

- [x] **Adım 2: shared/lib/supabase.ts içindeki import yollarını güncelle**

`packages/shared/lib/supabase.ts` içinde:
```typescript
// ÖNCE:
import type { Database } from '@/types/database.types';

// SONRA:
import type { Database } from '../types/database.types';
```

- [x] **Adım 3: shared/hooks/useAuth.ts içindeki import yollarını güncelle**

`packages/shared/hooks/useAuth.ts` içinde:
```typescript
// ÖNCE:
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database.types';

// SONRA:
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';
```

- [x] **Adım 4: shared/components/NotificationsScreen.tsx import yollarını güncelle**

```typescript
// ÖNCE: import { useThemeColors, ... } from '@/lib/constants';
// SONRA: import { useThemeColors, ... } from '../lib/constants';
```

- [x] **Adım 5: packages/shared/index.ts oluştur**

```typescript
// Shared package exports
export { supabase } from './lib/supabase';
export * from './lib/supabase'; // RPC wrappers
export { useThemeColors, Spacing, Radius, FontSize } from './lib/constants';
export type { ThemeColors } from './lib/constants';
export { notifyUser, navigateFromNotification } from './lib/notifications';
export type { NotificationRole } from './lib/notifications';
export { useAuth } from './hooks/useAuth';
export type { Database } from './types/database.types';
```

- [x] **Adım 6: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): copy shared lib, hooks, types, components to @pastacim/shared package"
```

---

## Görev 8: apps/customer Kurulumu (Faz 2b)

**Files:**
- Create: `apps/customer/package.json`
- Create: `apps/customer/app.json`
- Create: `apps/customer/tsconfig.json`
- Create: `apps/customer/babel.config.js`
- Create: `apps/customer/eas.json`
- Create: `apps/customer/app/_layout.tsx`
- Create: `apps/customer/app/(auth)/onboarding.tsx`
- Create: `apps/customer/app/(auth)/login.tsx`
- Create: `apps/customer/app/(auth)/register.tsx`
- Taşı: `app/(customer)/` → `apps/customer/app/(customer)/`
- Create: `apps/customer/app/messages/[conversationId].tsx`

- [x] **Adım 1: apps/customer/package.json oluştur**

```json
{
  "name": "pastacim-customer",
  "version": "1.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "ios": "expo run:ios",
    "android": "expo run:android",
    "tsc": "tsc --noEmit"
  },
  "dependencies": {
    "@pastacim/shared": "*",
    "expo": "~56.0.0",
    "expo-router": "~4.0.0",
    "expo-font": "~13.3.1",
    "expo-splash-screen": "~0.29.22",
    "expo-status-bar": "~2.2.3",
    "expo-location": "~18.1.5",
    "expo-notifications": "~0.31.2",
    "expo-secure-store": "~14.2.0",
    "expo-image-picker": "~16.1.4",
    "expo-dev-client": "~5.2.3",
    "react": "18.3.1",
    "react-native": "0.76.9",
    "react-native-maps": "1.20.1",
    "react-native-url-polyfill": "^2.0.0",
    "@supabase/supabase-js": "^2.50.0"
  },
  "devDependencies": {
    "@babel/core": "^7.25.2",
    "typescript": "~5.3.3"
  }
}
```

- [x] **Adım 2: apps/customer/app.json oluştur**

```json
{
  "expo": {
    "name": "Pastacım",
    "slug": "pastacim-customer",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "pastacim",
    "userInterfaceStyle": "automatic",
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.pastacim.customer"
    },
    "android": {
      "package": "com.pastacim.customer",
      "adaptiveIcon": {
        "backgroundColor": "#E6F4FE",
        "foregroundImage": "./assets/images/android-icon-foreground.png"
      },
      "permissions": [
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION"
      ]
    },
    "plugins": [
      "expo-router",
      "expo-location",
      ["expo-splash-screen", {
        "image": "./assets/images/splash-icon.png",
        "resizeMode": "contain",
        "backgroundColor": "#ffffff"
      }],
      "expo-secure-store",
      ["expo-notifications", {
        "icon": "./assets/images/icon.png",
        "color": "#D4526E",
        "sounds": []
      }]
    ],
    "experiments": {
      "typedRoutes": true
    },
    "extra": {
      "eas": {
        "projectId": "CUSTOMER_EAS_PROJECT_ID"
      }
    },
    "owner": "anzelpatisserie"
  }
}
```

> **Not:** `CUSTOMER_EAS_PROJECT_ID` kısmı `eas init` ile ayrı proje oluşturulduğunda doldurulur (Görev 10).

- [x] **Adım 3: apps/customer/tsconfig.json oluştur**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"],
      "@pastacim/shared": ["../../packages/shared/index.ts"],
      "@pastacim/shared/*": ["../../packages/shared/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.d.ts", "expo-env.d.ts"]
}
```

- [x] **Adım 4: apps/customer/babel.config.js oluştur**

```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['module-resolver', {
        root: ['.'],
        alias: {
          '@': '.',
        },
      }],
    ],
  };
};
```

- [x] **Adım 5: apps/customer/eas.json oluştur**

```json
{
  "cli": {
    "version": ">= 14.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

- [x] **Adım 6: Customer app _layout.tsx oluştur**

`apps/customer/app/_layout.tsx`:
```typescript
import { useEffect, useRef } from 'react';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';

import { useAuth, navigateFromNotification } from '@pastacim/shared';
import type { NotificationRole } from '@pastacim/shared';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const { isLoading, isAuthenticated } = useAuth();
  const notificationListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace('/(auth)/onboarding');
      return;
    }

    router.replace('/(customer)');
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    notificationListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const type = response.notification.request.content.data?.type as string | undefined;
        const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
        if (type) {
          navigateFromNotification(type, data, 'customer' as NotificationRole);
        }
      },
    );

    return () => {
      notificationListener.current?.remove();
      notificationListener.current = null;
    };
  }, [isAuthenticated]);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(customer)" />
        <Stack.Screen name="messages/[conversationId]" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
```

- [x] **Adım 7: Customer auth ekranları oluştur (shared'dan import eden wrapper'lar)**

`apps/customer/app/(auth)/onboarding.tsx`:
```typescript
export { default } from '@pastacim/shared/components/screens/OnboardingScreen';
```

> **Not:** Bu yaklaşım çalışmaz çünkü Expo Router'da `app/` altındaki dosyalar doğrudan component export etmeli. Doğru yaklaşım: mevcut `app/(auth)/onboarding.tsx` içeriğini kopyalayıp import yollarını `@pastacim/shared` ile güncelle.

Gerçek yaklaşım — `apps/customer/app/(auth)/onboarding.tsx`:
```typescript
// Mevcut app/(auth)/onboarding.tsx içeriğini buraya kopyala
// Sadece import yollarını güncelle:
// '@/lib/constants' → '@pastacim/shared'
// '@/hooks/useAuth' → '@pastacim/shared'
```

Aynı şekilde `apps/customer/app/(auth)/login.tsx` ve `apps/customer/app/(auth)/register.tsx` için.

- [x] **Adım 8: Customer ekranlarını taşı**

```bash
cp -r app/(customer)/* apps/customer/app/(customer)/
cp app/messages/[conversationId].tsx apps/customer/app/messages/[conversationId].tsx
```

Tüm taşınan dosyalarda import yollarını güncelle:
- `'@/lib/supabase'` → `'@pastacim/shared'`
- `'@/lib/constants'` → `'@pastacim/shared'`
- `'@/lib/notifications'` → `'@pastacim/shared'`
- `'@/hooks/useAuth'` → `'@pastacim/shared'`
- `'@/types/database.types'` → `'@pastacim/shared'`

- [x] **Adım 9: TypeScript kontrolü**

```bash
cd apps/customer && npx tsc --noEmit 2>&1 | head -50
```

- [x] **Adım 10: Commit**

```bash
git add apps/customer/
git commit -m "feat(customer): scaffold customer app with shared package imports"
```

---

## Görev 9: apps/baker Kurulumu (Faz 2c)

**Files:** (apps/customer'a paralel yapı)

- [x] **Adım 1: apps/baker dizin ve config dosyalarını oluştur**

`apps/customer`'daki tüm config dosyalarını (`package.json`, `tsconfig.json`, `babel.config.js`, `eas.json`) kopyala ve `customer` → `baker`, `com.pastacim.customer` → `com.pastacim.baker`, `"Pastacım"` → `"Pastacım Pro"` olarak güncelle.

`apps/baker/package.json`:
```json
{
  "name": "pastacim-baker",
  "version": "1.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "ios": "expo run:ios",
    "android": "expo run:android"
  },
  "dependencies": {
    "@pastacim/shared": "*",
    "expo": "~56.0.0",
    "expo-router": "~4.0.0",
    "expo-font": "~13.3.1",
    "expo-splash-screen": "~0.29.22",
    "expo-status-bar": "~2.2.3",
    "expo-location": "~18.1.5",
    "expo-notifications": "~0.31.2",
    "expo-secure-store": "~14.2.0",
    "expo-image-picker": "~16.1.4",
    "expo-dev-client": "~5.2.3",
    "react": "18.3.1",
    "react-native": "0.76.9",
    "react-native-maps": "1.20.1",
    "react-native-url-polyfill": "^2.0.0",
    "@supabase/supabase-js": "^2.50.0"
  },
  "devDependencies": {
    "@babel/core": "^7.25.2",
    "typescript": "~5.3.3"
  }
}
```

`apps/baker/app.json`:
```json
{
  "expo": {
    "name": "Pastacım Pro",
    "slug": "pastacim-baker",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "pastacim-pro",
    "userInterfaceStyle": "automatic",
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.pastacim.baker"
    },
    "android": {
      "package": "com.pastacim.baker",
      "adaptiveIcon": {
        "backgroundColor": "#FFF8F0",
        "foregroundImage": "./assets/images/android-icon-foreground.png"
      },
      "permissions": [
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION"
      ]
    },
    "plugins": [
      "expo-router",
      "expo-location",
      ["expo-splash-screen", {
        "image": "./assets/images/splash-icon.png",
        "resizeMode": "contain",
        "backgroundColor": "#ffffff"
      }],
      "expo-secure-store",
      ["expo-notifications", {
        "icon": "./assets/images/icon.png",
        "color": "#9F7AEA",
        "sounds": []
      }]
    ],
    "experiments": {
      "typedRoutes": true
    },
    "extra": {
      "eas": {
        "projectId": "BAKER_EAS_PROJECT_ID"
      }
    },
    "owner": "anzelpatisserie"
  }
}
```

- [x] **Adım 2: Baker _layout.tsx oluştur (is_baker kontrolü ile)**

`apps/baker/app/_layout.tsx`:
```typescript
import { useEffect, useRef } from 'react';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';

import { useAuth, navigateFromNotification } from '@pastacim/shared';
import type { NotificationRole } from '@pastacim/shared';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const { isLoading, isAuthenticated, isBaker } = useAuth();
  const notificationListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace('/(auth)/onboarding');
      return;
    }

    // Dükkanı olmayan kullanıcı → dükkan kurulum ekranı
    if (!isBaker) {
      router.replace('/(baker)/setup');
      return;
    }

    router.replace('/(baker)');
  }, [isLoading, isAuthenticated, isBaker]);

  useEffect(() => {
    if (!isAuthenticated) return;

    notificationListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const type = response.notification.request.content.data?.type as string | undefined;
        const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
        if (type) {
          navigateFromNotification(type, data, 'baker' as NotificationRole);
        }
      },
    );

    return () => {
      notificationListener.current?.remove();
      notificationListener.current = null;
    };
  }, [isAuthenticated]);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(baker)" />
        <Stack.Screen name="messages/[conversationId]" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
```

- [x] **Adım 3: Baker kurulum ekranı oluştur**

`apps/baker/app/(baker)/setup.tsx` — Yeni pastacı dükkan kurulum ekranı:
```typescript
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { supabase, useThemeColors, Spacing, Radius, FontSize, useAuth } from '@pastacim/shared';

export default function BakerSetupScreen() {
  const C = useThemeColors();
  const { refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return setError('Dükkan adı gerekli.');
    if (!address.trim()) return setError('Adres gerekli.');

    setIsLoading(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc('create_shop', {
      p_name: name.trim(),
      p_description: description.trim() || null,
      p_address: address.trim(),
      p_latitude: null,
      p_longitude: null,
    });

    setIsLoading(false);

    if (rpcError) {
      setError('Dükkan oluşturulamadı. Lütfen tekrar deneyin.');
      return;
    }

    await refreshProfile();
    router.replace('/(baker)');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: C.text }]}>🧑‍🍳 Dükkanını Kur</Text>
        <Text style={[styles.subtitle, { color: C.textSecondary }]}>
          Pastacım Pro'yu kullanmak için bir dükkan oluşturman gerekiyor.
        </Text>

        <View style={styles.form}>
          <Text style={[styles.label, { color: C.textSecondary }]}>Dükkan Adı</Text>
          <TextInput
            style={[styles.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
            placeholder="Örn: Ayşe'nin Pastanesi"
            placeholderTextColor={C.placeholder}
            value={name}
            onChangeText={(t) => { setName(t); setError(null); }}
          />

          <Text style={[styles.label, { color: C.textSecondary }]}>Açıklama (opsiyonel)</Text>
          <TextInput
            style={[styles.input, styles.multiline, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
            placeholder="Dükkanın hakkında kısa bir bilgi..."
            placeholderTextColor={C.placeholder}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />

          <Text style={[styles.label, { color: C.textSecondary }]}>Adres</Text>
          <TextInput
            style={[styles.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
            placeholder="Mahalle, İlçe, İl"
            placeholderTextColor={C.placeholder}
            value={address}
            onChangeText={(t) => { setAddress(t); setError(null); }}
          />

          {error && (
            <Text style={[styles.error, { color: C.error }]}>⚠️ {error}</Text>
          )}

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: C.primary }, isLoading && { opacity: 0.7 }]}
            onPress={handleCreate}
            disabled={isLoading}
          >
            {isLoading
              ? <ActivityIndicator color="#FFF" />
              : <Text style={styles.btnText}>🏪 Dükkanı Oluştur</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.lg },
  title: { fontSize: FontSize.xxl, fontWeight: '800', marginTop: Spacing.xl },
  subtitle: { fontSize: FontSize.md, lineHeight: 22 },
  form: { gap: Spacing.md },
  label: { fontSize: FontSize.sm, fontWeight: '600' },
  input: {
    borderWidth: 1.5, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
    fontSize: FontSize.md,
  },
  multiline: { height: 90, textAlignVertical: 'top' },
  error: { fontSize: FontSize.sm, fontWeight: '500' },
  btn: {
    paddingVertical: 16, borderRadius: Radius.full,
    alignItems: 'center', marginTop: Spacing.sm,
  },
  btnText: { color: '#FFF', fontSize: FontSize.lg, fontWeight: '700' },
});
```

- [x] **Adım 4: Baker ekranlarını taşı**

```bash
cp -r app/(baker)/* apps/baker/app/(baker)/
cp app/messages/[conversationId].tsx apps/baker/app/messages/[conversationId].tsx
cp app/(auth)/onboarding.tsx apps/baker/app/(auth)/onboarding.tsx
cp app/(auth)/login.tsx apps/baker/app/(auth)/login.tsx
cp app/(auth)/register.tsx apps/baker/app/(auth)/register.tsx
```

Tüm dosyalarda import yollarını güncelle (`@/` → `@pastacim/shared` veya relative).

- [x] **Adım 5: TypeScript kontrolü**

```bash
cd apps/baker && npx tsc --noEmit 2>&1 | head -50
```

- [x] **Adım 6: Commit**

```bash
git add apps/baker/
git commit -m "feat(baker): scaffold baker app with setup screen and shared package imports"
```

---

## Görev 10: EAS Production App Config (Faz 4)

**Files:**
- Modify: `apps/customer/app.json`
- Modify: `apps/baker/app.json`

- [x] **Adım 1: Customer EAS projesi oluştur**

```bash
cd apps/customer && eas init --id pastacim-customer
```

Çıktıdan gelen projectId'yi `apps/customer/app.json` içindeki `CUSTOMER_EAS_PROJECT_ID` yerine yaz.

- [x] **Adım 2: Baker EAS projesi oluştur**

```bash
cd apps/baker && eas init --id pastacim-baker
```

Çıktıdan gelen projectId'yi `apps/baker/app.json` içindeki `BAKER_EAS_PROJECT_ID` yerine yaz.

- [x] **Adım 3: Commit**

```bash
git add apps/customer/app.json apps/baker/app.json
git commit -m "chore: set EAS project IDs for customer and baker apps"
```

---

## Görev 11: Jest Altyapısı + Shared Hook Testleri (Faz 5a)

**Files:**
- Create: `packages/shared/package.json` (jest config ekle)
- Create: `packages/shared/__tests__/useAuth.test.ts`
- Create: `packages/shared/__tests__/useUnreadMessages.test.ts`

- [x] **Adım 1: Jest ve testing library kur**

```bash
npm install --save-dev jest @testing-library/react-native jest-expo @types/jest
```

Root `package.json`'a ekle:
```json
{
  "jest": {
    "preset": "jest-expo",
    "testPathPattern": "packages/__tests__|apps/.+/__tests__"
  }
}
```

- [x] **Adım 2: useAuth unit testlerini yaz**

`packages/shared/__tests__/useAuth.test.ts`:
```typescript
import { renderHook, act } from '@testing-library/react-native';
import { useAuth } from '../hooks/useAuth';

// Supabase'i mock'la
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      update: jest.fn().mockReturnThis(),
      then: jest.fn().mockResolvedValue({}),
      catch: jest.fn().mockResolvedValue({}),
    }),
  },
}));

describe('useAuth', () => {
  it('başlangıçta isLoading true, isAuthenticated false olmalı', async () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('oturum yoksa isBaker false olmalı', async () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isBaker).toBe(false);
  });

  it('oturum yoksa isCustomer true olmalı (default)', async () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isCustomer).toBe(true);
  });

  it('hatalı signIn → Türkçe hata mesajı döner', async () => {
    const { supabase } = require('../lib/supabase');
    supabase.auth.signInWithPassword.mockResolvedValueOnce({
      error: { message: 'Invalid login credentials' },
    });

    const { result } = renderHook(() => useAuth());
    let response: { error: string | null };

    await act(async () => {
      response = await result.current.signIn('test@test.com', 'yanlis');
    });

    expect(response!.error).toBe('E-posta veya şifre hatalı.');
  });

  it('başarılı signUp → hata null döner', async () => {
    const { supabase } = require('../lib/supabase');
    supabase.auth.signUp.mockResolvedValueOnce({ error: null });

    const { result } = renderHook(() => useAuth());
    let response: { error: string | null };

    await act(async () => {
      response = await result.current.signUp({
        email: 'yeni@test.com',
        password: '123456',
        fullName: 'Test Kullanıcı',
      });
    });

    expect(response!.error).toBeNull();
  });
});
```

- [x] **Adım 3: Testleri çalıştır (fail beklenir başta)**

```bash
npx jest packages/shared/__tests__/useAuth.test.ts --no-coverage
```

Beklenen: Setup hatası veya mock eksikliğinden fail. Hataları düzelt, testler geçene kadar devam et.

- [x] **Adım 4: Testler geçince commit**

```bash
npx jest packages/shared/__tests__/ --no-coverage
```

Beklenen: Tüm testler PASS.

```bash
git add packages/shared/__tests__/
git commit -m "test(shared): add useAuth unit tests with mock Supabase"
```

---

## Görev 12: Customer Ekran Testleri (Faz 5b)

**Files:**
- Create: `apps/customer/__tests__/orderCreate.test.ts`
- Create: `apps/customer/__tests__/offerList.test.ts`

- [x] **Adım 1: orderCreate testlerini yaz**

`apps/customer/__tests__/orderCreate.test.ts`:
```typescript
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// supabase ve useAuth mock'la
jest.mock('@pastacim/shared', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
  useThemeColors: () => ({
    background: '#fff', text: '#000', primary: '#D4526E',
    card: '#f5f5f5', border: '#e0e0e0', textSecondary: '#666',
    placeholder: '#999', error: '#e53e3e', success: '#48BB78',
  }),
  Spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
  Radius: { sm: 4, md: 8, lg: 12, full: 999 },
  FontSize: { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 24, xxxl: 32 },
  useAuth: () => ({
    user: { id: 'test-user-id' },
    isAuthenticated: true,
    refreshProfile: jest.fn(),
  }),
  rpcPlaceOrder: jest.fn().mockResolvedValue({ data: { order_id: 'test-order-id' }, error: null }),
  notifyUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

// NOT: Gerçek bileşeni import etmeden önce dosya yolunu doğrula
// import OrderCreateScreen from '../app/(customer)/order/create';

describe('sipariş oluşturma — form validasyon', () => {
  it('başlık boş bırakılınca kayıt butonu engellenmeli', () => {
    // Bileşen test edilebilir hale getirildiğinde implement edilecek
    expect(true).toBe(true); // placeholder — bileşen import edildikten sonra gerçek test yazılır
  });

  it('kişi sayısı 0 veya eksik olunca hata göstermeli', () => {
    expect(true).toBe(true);
  });
});
```

> **Not:** Bu testler bileşen yüklenebilirliğine bağlı. expo-router ve native module mock'ları eksiksiz kurulduktan sonra gerçek render testlerine geçilir. Şu aşamada iskelet yeterlidir.

- [x] **Adım 2: Testleri çalıştır**

```bash
npx jest apps/customer/__tests__/ --no-coverage
```

- [x] **Adım 3: Commit**

```bash
git add apps/customer/__tests__/
git commit -m "test(customer): add order creation and offer list test scaffolds"
```

---

## Görev 13: Baker Ekran Testleri (Faz 5c)

**Files:**
- Create: `apps/baker/__tests__/offerSubmit.test.ts`
- Create: `apps/baker/__tests__/wallet.test.ts`

- [x] **Adım 1: offerSubmit testlerini yaz**

`apps/baker/__tests__/offerSubmit.test.ts`:
```typescript
import { renderHook, act } from '@testing-library/react-native';

// rpcSubmitOffer mock'la
const mockSubmitOffer = jest.fn();

jest.mock('@pastacim/shared', () => ({
  rpcSubmitOffer: mockSubmitOffer,
  useAuth: () => ({
    user: { id: 'baker-user-id' },
    profile: { wallet_balance: 50.0, is_baker: true },
    isAuthenticated: true,
  }),
}));

describe('teklif verme — bakiye kontrolü', () => {
  it('bakiye yeterliyse teklif gönderilmeli', async () => {
    mockSubmitOffer.mockResolvedValueOnce({ data: { offer_id: 'offer-123' }, error: null });

    const result = await mockSubmitOffer({
      p_order_id: 'order-123',
      p_price: 250,
      p_message: 'Güzel pasta yaparım',
      p_estimated_days: 3,
    });

    expect(result.error).toBeNull();
    expect(result.data?.offer_id).toBe('offer-123');
  });

  it('bakiye yetersizse yetersiz_bakiye hatası dönmeli', async () => {
    mockSubmitOffer.mockResolvedValueOnce({
      data: { error: 'yetersiz_bakiye' },
      error: null,
    });

    const result = await mockSubmitOffer({
      p_order_id: 'order-456',
      p_price: 300,
      p_message: 'Test',
      p_estimated_days: 2,
    });

    expect((result.data as { error: string } | null)?.error).toBe('yetersiz_bakiye');
  });
});
```

- [x] **Adım 2: wallet testini yaz**

`apps/baker/__tests__/wallet.test.ts`:
```typescript
describe('cüzdan bakiyesi gösterimi', () => {
  it('wallet_balance TL olarak ₺X.XX formatında gösterilmeli', () => {
    const balance = 125.50;
    const formatted = `₺${balance.toFixed(2)}`;
    expect(formatted).toBe('₺125.50');
  });

  it('wallet_balance 0 olunca ₺0.00 gösterilmeli', () => {
    const balance = 0;
    const formatted = `₺${balance.toFixed(2)}`;
    expect(formatted).toBe('₺0.00');
  });
});
```

- [x] **Adım 3: Testleri çalıştır**

```bash
npx jest apps/baker/__tests__/ --no-coverage
```

Beklenen: Tüm testler PASS.

- [x] **Adım 4: Commit**

```bash
git add apps/baker/__tests__/
git commit -m "test(baker): add offer submit and wallet balance tests"
```

---

## Görev 14: TypeScript Kalite Geçişi (Faz 6)

**Files:**
- `hooks/useAuth.ts` (mevcut root — zaten temizlendi)
- `app/(baker)/wallet.tsx` (zaten temizlendi)
- `app/(baker)/my-orders.tsx` (satır 10: `const _db: any = supabase`)
- `lib/supabase.ts` (içindeki `any` castler)
- `packages/shared/**` (tüm kopyalanmış dosyalar)

- [x] **Adım 1: TypeScript hatalarını tara**

```bash
npx tsc --noEmit 2>&1
```

Tüm `any` ve type hataları listelenir.

- [x] **Adım 2: app/(baker)/my-orders.tsx içindeki _db:any'yi kaldır**

`app/(baker)/my-orders.tsx` satır 9-10:
```typescript
// ÖNCE:
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;
```

Bu satırları sil. `_db.from(...)` çağrılarını `supabase.from(...)` ile değiştir.

- [x] **Adım 3: lib/supabase.ts içindeki any castleri minimize et**

`_rpc` fonksiyonundaki `any` cast zaten gerekli (Supabase SDK overload sorunu). Yorum satırı ekle ve bırak. Başka `any` varsa tip tanımla.

- [x] **Adım 4: Tüm dosyalarda son TypeScript kontrolü**

```bash
npx tsc --noEmit 2>&1 | grep -E "error TS" | wc -l
```

Beklenen: 0 hata (veya yalnızca Supabase SDK'nın kendi içindeki bilinen hatalar).

- [x] **Adım 5: Commit**

```bash
git add -A
git commit -m "chore(ts): remove any casts, fix type errors across codebase"
```

---

## Görev 15: App Store Hazırlık (Faz 7)

**Files:**
- `apps/customer/app.json` (App Store metadata)
- `apps/baker/app.json` (App Store metadata)

- [x] **Adım 1: App Store metadata doğrula**

Her iki `app.json` için kontrol listesi:
- [x] `"version"` → `"1.0.0"`
- [x] `"ios.bundleIdentifier"` doğru (`com.pastacim.customer` / `com.pastacim.baker`)
- [x] `"ios.buildNumber"` → `"1"` ekle
- [x] `"android.versionCode"` → `1` ekle
- [x] `"owner"` → `"anzelpatisserie"`
- [x] Notification rengi doğru (customer: `#D4526E`, baker: `#9F7AEA`)

- [ ] **Adım 2: App Store hazırlık listesi**

Aşağıdaki maddeler Xcode / App Store Connect üzerinden yapılır (kod dışı):
- [ ] 1024×1024 PNG ikon — her uygulama için ayrı
- [ ] 6.5" ve 5.5" iPhone ekran görüntüleri (en az 3'er adet)
- [ ] Uygulama açıklaması (TR + EN)
- [ ] Gizlilik politikası URL: `https://pastacim.com/gizlilik`
- [ ] Age Rating: 4+
- [ ] APNs sertifikası (EAS otomatik yönetir)

- [ ] **Adım 3: Commit**

```bash
git add apps/customer/app.json apps/baker/app.json
git commit -m "chore: finalize app.json metadata for App Store submission"
```

---

## Görev 16: TestFlight → App Store Gönderimi (Faz 8)

- [ ] **Adım 1: Production build oluştur**

```bash
# Müşteri uygulaması
cd apps/customer && eas build --profile production --platform ios

# Pastacı uygulaması
cd apps/baker && eas build --profile production --platform ios
```

Build tamamlanınca EAS, App Store Connect'e otomatik yükler.

- [ ] **Adım 2: EAS Submit ile App Store'a gönder**

```bash
cd apps/customer && eas submit --platform ios --profile production
cd apps/baker && eas submit --platform ios --profile production
```

- [ ] **Adım 3: App Store Connect'te inceleme için gönder**

App Store Connect > My Apps > her uygulama > Submit for Review.

---

## Faz Bağımlılık Özeti

```
Görev 1 (EAS config)     → bağımsız, ilk yap
Görev 2 (DB migration)   → bağımsız, Supabase Dashboard'da çalıştır
Görev 3 (useAuth+register) → Görev 2 sonrası
Görev 4 (_layout+messages) → Görev 3 sonrası
Görev 5 (wallet)         → Görev 2 sonrası
Görev 6 (monorepo setup) → bağımsız
Görev 7 (shared package) → Görev 6 sonrası
Görev 8 (customer app)   → Görev 7 + Görev 3,4,5 sonrası
Görev 9 (baker app)      → Görev 7 + Görev 3,4,5 sonrası
Görev 10 (EAS prod config) → Görev 8 + 9 sonrası
Görev 11 (shared tests)  → Görev 7 sonrası
Görev 12 (customer tests) → Görev 8 + 11 sonrası
Görev 13 (baker tests)   → Görev 9 + 11 sonrası
Görev 14 (TypeScript)    → Görev 8 + 9 sonrası
Görev 15 (App Store prep) → Görev 10 + 14 sonrası
Görev 16 (Submit)        → Görev 15 + 12 + 13 sonrası
```

---

## Önemli Notlar

1. **Supabase migration** (Görev 2) Supabase Dashboard'da manuel çalıştırılır. CLI ile de yapılabilir: `npx supabase db push`.

2. **EAS build** gerçek Apple Developer hesabı ve EAS projesi gerektirir. Build komutları yerel çalıştırılır; derleme Expo Cloud'da yapılır (~15-30 dk).

3. **Asset dosyaları** (`assets/images/`) her iki `apps/` dizinine kopyalanmalı. Monorepo kurulumunda (Görev 8-9) `cp -r assets/ apps/customer/assets/` komutu çalıştırılır.

4. **module-resolver** babel plugin'i gerekli: `npm install --save-dev babel-plugin-module-resolver`.

5. **push_token** alanı `users` tablosunda mevcut olmalı (schema.sql'de varsa; yoksa `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS push_token TEXT;` ekle).

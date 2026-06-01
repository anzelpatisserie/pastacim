# Pastacım — Agent Rehberi

Bu repo bir **npm workspaces monorepo**'dur. Detaylı proje rehberi için `CLAUDE.md`'ye bakın.

---

## Hızlı Yapı

```
apps/customer/      # Pastacım (com.pastacim.customer)
apps/baker/         # Pastacım Pro (com.pastacim.baker)
packages/shared/    # @pastacim/shared — supabase, hooks, types, components
supabase/
  schema.sql        # Baseline şema
  migrations/       # Tarih sıralı migration'lar
```

Tek Supabase backend, iki ayrı App Store / Play Store uygulaması.

---

## Expo SDK 56

Bu proje **Expo SDK 56** üzerinde çalışır. Kod yazmadan önce versiyona özel dokümana bakın:
<https://docs.expo.dev/versions/v56.0.0/>

`react-native 0.85`, `expo-router ~56.2`, `react 19.2`. Eski SDK örneklerini körlemesine uygulamayın.

---

## Çalışma Kuralları

1. **UI ve hata mesajları Türkçe.**
2. **TypeScript strict.** `any` yok; tipler `@pastacim/shared`'tan import edilir.
3. **Paylaşılan kod `packages/shared`'a yazılır.** Tek uygulamaya özel kod `apps/<app>/` altında kalır.
4. **Supabase istemcisi tek noktada** (`packages/shared/lib/supabase.ts`). RPC çağrıları için oradaki `rpc*` wrapper'larını kullanın, doğrudan `supabase.rpc('...')` yazmayın.
5. **RLS aktif.** Client tarafında filtreleme yapmayın, DB politikalarına güvenin.
6. **Schema değişikliği** → `supabase/migrations/<sıra>_<isim>.sql` olarak yeni dosya ekleyin; `schema.sql`'i de güncel baseline olarak tutun.
7. **Dark mode** zorunlu — `useThemeColors()` hook'unu kullanın, sabit renk hex'leri yazmayın.

---

## Komutlar

```bash
npm run customer        # Pastacım dev server
npm run baker           # Pastacım Pro dev server
npm test                # Jest (shared + her iki app)
npm run tsc:shared      # Shared paket type check
```

App içinde:
```bash
cd apps/customer && npx tsc --noEmit
cd apps/baker    && npx tsc --noEmit
```

# Pastacım Cleanup Sprint — 2026-06-02

Çok adımlı temizlik + iyileştirme planı. ADIM 0 tamamlandı, kalanlar Supabase MCP yüklenmesi için Claude Code yeniden başlatıldıktan sonra devam edecek.

## Devam etmek için
Yeniden başlattıktan sonra şunu yaz:
> "Pastacım cleanup sprint'ine devam et. Plan: docs/superpowers/plans/2026-06-02-cleanup-sprint.md. ADIM 1'den başla."

## ✅ ADIM 0 — Supabase MCP kurulumu (TAMAMLANDI)
- `claude mcp add supabase --scope user` ile `~/.claude.json`'a eklendi
- Token: `sbp_fffe8b094b8f0dee3a33946f07fce7c720036270`
- Restart sonrası `mcp__supabase__*` araçları yüklenecek

## ⏳ ADIM 1 — Wallet özelliğini tamamen kaldır (UI katmanı)

1a. `apps/baker/app/(baker)/wallet.tsx` dosyasını sil.

1b. `apps/baker/app/(baker)/_layout.tsx` içinden wallet sekmesini kaldır.

1c. `apps/baker/app/(baker)/offer/[orderId].tsx` içinden:
- `walletBalance` state ve sorgu
- Bakiye göstergesi UI
- "Yetersiz bakiye" uyarısı
- `p_estimated_days` parametresi (estimatedDays state ile birlikte)
- submit_offer RPC çağrısı kalsın, fee/wallet parametreleri çıksın

1d. Supabase MCP ile `submit_offer` RPC'sini güncelle — cüzdandan ücret düşen kısmı kaldır, sadece offer kaydı oluştursun. SQL'i `supabase/migrations/0002_remove_wallet_fee.sql` olarak kaydet.

1e. `apps/baker/app/(baker)/index.tsx` içindeki `wallet_balance` referanslarını kaldır.

1f. `apps/baker/app/(baker)/profile.tsx` içindeki `wallet_balance` referanslarını kaldır.

1g. `packages/shared/lib/supabase.ts` içinden `rpcRequestWalletTopUp` ve `rpcAddWalletBalance` wrapper'larını kaldır.

> DB tabloları (`wallet_transactions`, `wallet_top_up_requests`, `users.wallet_balance` kolonu) dokunulmaz — ileride tekrar kullanılabilir.

## ⏳ ADIM 2 — iOS push entitlement + TR izin metinleri

Her iki `app.json`'a ekle:
```json
"ios": {
  "entitlements": { "aps-environment": "production" },
  "infoPlist": {
    "UIBackgroundModes": ["remote-notification"],
    "NSLocationWhenInUseUsageDescription": "Pastacım yakındaki pastacıları gösterebilmek için konumunuza erişir.",
    "NSCameraUsageDescription": "Geri bildirim ekran görüntüsü veya fotoğraf için kamera erişimi gerekir.",
    "NSPhotoLibraryUsageDescription": "Sipariş veya dükkan görseli seçmek için fotoğraflarınıza erişim gerekir."
  }
}
```

Native `apps/customer/ios/.../Info.plist` ve `apps/baker/ios/.../Info.plist` içindeki İngilizce NS* metinlerini de Türkçeleştir. Kullanılmayan `NSMicrophoneUsageDescription` / `NSFaceIDUsageDescription` varsa kaldır.

## ⏳ ADIM 3 — Hesap silme akışı

3a. Supabase MCP ile `delete_account` RPC var mı kontrol et. Yoksa oluştur:
- Auth kullanıcısını sil (cascade ile users kaydı silinmeli)
- RLS: sadece kendi hesabını silebilir
- Migration: `supabase/migrations/0003_delete_account_rpc.sql`

3b. Customer profil ekranına "Hesabımı Sil" butonu (onay Alert + Türkçe mesaj, kırmızı, loading state).

3c. Baker profil ekranına aynısını ekle.

## ⏳ ADIM 4 — dist/ gitignore

`apps/customer/.gitignore` ve `apps/baker/.gitignore` dosyalarına `dist/` satırı ekle.

## ⏳ ADIM 5 — Baker onboarding metni

`apps/baker/app/(auth)/onboarding.tsx`:
- App adı: "Pastacım Pro"
- Slogan: "Yakınındaki siparişleri al, işini büyüt"
- Feature card'lar: 📍 "Yakın Siparişler" / 💰 "Teklif Ver" / 📈 "Kazanç Sağla"

## ⏳ ADIM 6 — Dead code temizliği

6a. Her iki app `messages/[conversationId].tsx`: `chatBlockReason`, `isBeforeOffer`, `deliveryDate`/`setDeliveryDate`, `orderStatus`/`setOrderStatus`, kullanılmayan `isBaker`/`isCustomer` importları kaldır.

6b. `apps/customer/app/(customer)/order/create.tsx`: `FlatList` import kaldır, `searchRadius` → `const SEARCH_RADIUS = 20`, `radiusRow/radiusBtn/radiusBtnText` stillerini kaldır.

6c. `packages/shared/lib/constants.ts` satır 81-82: `TOKEN_WELCOME_BONUS` ve `TOKEN_ORDER_COST` kaldır; `packages/shared/index.ts` export'larını da temizle.

6d. `FeedbackModal.tsx:39` ve `apps/baker/app/messages/[conversationId].tsx:258`: `MediaTypeOptions.Images` → `MediaType.Images`.

6e. `packages/shared/components/NotificationsScreen.tsx`: `onDelete` prop'u ya swipe/delete button ekleyerek UI'a bağla ya da prop ve ilgili kodu tamamen kaldır.

6f. `packages/shared/lib/notifications.ts` `navigateFromNotification`: `campaign` case'ini handle et (örn. `router.push('/')`) veya TYPE_META'dan campaign tipini çıkar.

6g. Her iki app `(auth)/login.tsx`: "Şifremi unuttum" butonuna `onPress` ekle — şimdilik `Alert.alert('Yakında', 'Bu özellik yakında aktif olacak.')`.

6h. Kullanılmayan stiller: `baker/profile.tsx` `fetchBtn`, `baker/offer/[orderId].tsx` `inputSmall`, `customer/messages.tsx` `orderTitle`.

6i. `baker/profile.tsx:738` cancel handler: `setInstagramUrl(extractHandle(shop.instagram_url ?? ''))` şeklinde düzelt.

## ⏳ ADIM 7 — Supabase schema senkronizasyonu

7a. Supabase MCP ile production schema'sını çek ve `supabase/schema.sql`'i güncelle.

7b. `npx supabase gen types typescript --project-id lvrbzhziayegyinkcuka > packages/shared/types/database.types.ts` çalıştır.

7c. Type güncellendikten sonra `packages/shared/lib/supabase.ts` içindeki `_rpc` wrapper'ların `as unknown` cast'lerini temizle.

## ⏳ ADIM 8 — Supabase anon key .env'e taşı

8a. `apps/customer/.env` ve `apps/baker/.env`:
```
EXPO_PUBLIC_SUPABASE_URL=https://lvrbzhziayegyinkcuka.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<mevcut_anon_key>
```

8b. Her iki app `app.json`'a `extra`:
```json
"extra": {
  "supabaseUrl": "$(EXPO_PUBLIC_SUPABASE_URL)",
  "supabaseAnonKey": "$(EXPO_PUBLIC_SUPABASE_ANON_KEY)"
}
```

8c. `packages/shared/lib/supabase.ts` içinde `Constants.expoConfig?.extra` üzerinden oku.

8d. `.gitignore`'lara `.env` ekle.

## Kurallar
- Her adımda TypeScript hatası çıkarsa düzelt, geçme
- Her adım bittikten sonra "✅ Adım X tamamlandı" de
- Wallet DB tablolarına dokunma

# Pastacım Web Sürümleri Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mevcut `apps/customer` ve `apps/baker` Expo uygulamalarını react-native-web ile web + mobil-web'e derleyip Cloudflare Pages üzerinden `pastacim.ipekciapp.com` ve `pastacimpro.ipekciapp.com` adreslerinde yayınlamak.

**Architecture:** Tek kod tabanı. Native-only modüller (`expo-secure-store`, `react-native-maps`, `expo-notifications`) için `Platform.OS === 'web'` koşulu veya `*.web.tsx` platform-dosya çözümlemesiyle web fallback'leri eklenir. Çıktı statik SPA (`expo export -p web`). Mevcut yasal Cloudflare Worker (`web/legal`) path-route'lara çevrilerek `/terms`, `/privacy`, `/unsubscribe` URL'leri korunur.

**Tech Stack:** Expo SDK 56, React Native 0.85, expo-router v4, react-native-web, react-dom, @expo/metro-runtime, @react-google-maps/api (web map), Supabase JS, Cloudflare Pages + Workers.

## Global Constraints

- **Tüm UI Türkçe** — label, hata, placeholder dahil.
- **TypeScript strict** — `any` yasak; tipler `@pastacim/shared`'dan.
- **Paylaşılan kod `packages/shared`'a**; tek-app'e özel kod `apps/<app>/` altına.
- **react-native-maps web'de import EDİLMEMELİ** — sadece `*.web.tsx` dışı dosyalarda. Web bundle'a sızarsa export kırılır.
- **Korunacak URL'ler (DEĞİŞTİRİLEMEZ):** `https://pastacim.ipekciapp.com/terms`, `/privacy`, `/unsubscribe`.
- **Expo paket sürümleri** her zaman `npx expo install <pkg>` ile (SDK 56 uyumlu sürüm seçer); elle `npm install <pkg>@latest` YASAK.
- **Push web'de kapsam dışı** — no-op shim, hata fırlatmaz.
- Doğrulama komutları: `npx tsc --noEmit` (her app), `npm run tsc:shared`, `npx expo export -p web`.

---

### Task 1: Supabase oturum depolama — web fallback

**Files:**
- Modify: `packages/shared/lib/supabase.ts:19-39`

**Interfaces:**
- Produces: `supabase` client — web'de `localStorage` storage + `detectSessionInUrl: true`; native'de mevcut SecureStore + `false`.

**Neden:** Mevcut adapter doğrudan `expo-secure-store` çağırıyor (web'de throw). OAuth redirect dönüşü için web'de `detectSessionInUrl: true` şart.

- [ ] **Step 1: Adapter ve client'ı platform-koşullu yap**

`packages/shared/lib/supabase.ts` içindeki `ExpoSecureStoreAdapter` tanımının hemen üstüne `import { Platform } from 'react-native';` ekle (zaten varsa atla). Sonra adapter+client bloğunu şu şekilde değiştir:

```ts
// ─── Oturum Depolama — Platform bazlı ───────────────────────────────
// Native: iOS Keychain / Android Keystore (expo-secure-store)
// Web: localStorage (expo-secure-store web'de desteklenmez)
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const WebStorageAdapter = {
  getItem: (key: string) => Promise.resolve(globalThis.localStorage?.getItem(key) ?? null),
  setItem: (key: string, value: string) => {
    globalThis.localStorage?.setItem(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    globalThis.localStorage?.removeItem(key);
    return Promise.resolve();
  },
};

const isWeb = Platform.OS === 'web';

export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: isWeb ? WebStorageAdapter : ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: isWeb,
    },
  }
);
```

- [ ] **Step 2: Tip kontrolü**

Run: `npm run tsc:shared`
Expected: PASS (0 hata)

- [ ] **Step 3: Commit**

```bash
git add packages/shared/lib/supabase.ts
git commit -m "feat(web): supabase oturum depolama web fallback (localStorage + detectSessionInUrl)"
```

---

### Task 2: Google OAuth — web redirect dalı

**Files:**
- Modify: `packages/shared/hooks/useAuth.ts:232-250` (signInWithGoogle gövdesi)

**Interfaces:**
- Consumes: `supabase.auth.signInWithOAuth` (Task 1 client).
- Produces: `signInWithGoogle(redirectUrl)` — web'de tam-sayfa redirect, native'de mevcut WebBrowser akışı.

**Neden:** Web'de `WebBrowser.openAuthSessionAsync` yok; Supabase'in döndürdüğü `data.url`'e tam-sayfa yönlendirip dönüşte `detectSessionInUrl` ile session yakalanır.

- [ ] **Step 1: signInWithGoogle başına web dalı ekle**

`signInWithGoogle` içinde, `supabase.auth.signInWithOAuth({...})` çağrısından **sonra**, `if (error || !data.url)` kontrolünden hemen sonra şu web dalını ekle (native akış olduğu gibi kalır):

```ts
      // Web: tam-sayfa redirect; dönüşte detectSessionInUrl session'ı yakalar
      if (Platform.OS === 'web') {
        globalThis.location.assign(data.url);
        return { error: null };
      }
```

(`Platform` zaten `useAuth.ts:2`'de import edili.)

- [ ] **Step 2: Tip kontrolü**

Run: `npm run tsc:shared`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/shared/hooks/useAuth.ts
git commit -m "feat(web): google oauth web redirect dalı"
```

---

### Task 3: Push bildirimleri — web no-op shim (iki app)

**Files:**
- Create: `apps/customer/hooks/useNotifications.web.ts`
- Create: `apps/baker/hooks/useNotifications.web.ts`

**Interfaces:**
- Produces: `useNotifications()` — web'de hiçbir şey yapmaz (push kapsam dışı), aynı imza.

**Neden:** `expo-notifications` web'de token alamaz; çağrı zincirini kırmadan no-op döner. Metro web'de `.web.ts`'i seçer.

- [ ] **Step 1: Native useNotifications imzasını oku**

Run: `head -30 apps/customer/hooks/useNotifications.ts`
Amaç: export edilen hook adını/dönüş tipini öğren (genelde `export function useNotifications(): void` veya token döner). Web shim aynı imzayı boş gövdeyle taklit etmeli.

- [ ] **Step 2: Customer web shim'i yaz**

`apps/customer/hooks/useNotifications.web.ts` — native dosyanın export ettiği isimle birebir aynı imza, boş gövde. Örn (native `void` döndürüyorsa):

```ts
// Web'de push kapsam dışı — no-op. Native imzayla aynı.
export function useNotifications(): void {
  // intentionally empty: web push sonraki faz
}
```

> Native dosya farklı bir değer döndürüyorsa (ör. token string), aynı tip imzasıyla `undefined`/boş döndür ve tüketicide null-güvenli olduğunu doğrula.

- [ ] **Step 3: Baker web shim'i yaz**

`apps/baker/hooks/useNotifications.web.ts` — Step 2 ile aynı (baker native imzasına göre uyarlanmış).

- [ ] **Step 4: Commit**

```bash
git add apps/customer/hooks/useNotifications.web.ts apps/baker/hooks/useNotifications.web.ts
git commit -m "feat(web): push useNotifications no-op web shim (her iki app)"
```

---

### Task 4: Harita — platform-bölünmüş AppMap bileşeni

**Files:**
- Create: `packages/shared/components/AppMap.tsx` (native re-export)
- Create: `packages/shared/components/AppMap.web.tsx` (Google Maps JS)
- Modify: `packages/shared/index.ts` (export)
- Modify: `apps/customer/app/(customer)/order/create.tsx` (import kaynağı)
- Modify: `apps/baker/app/(baker)/setup.tsx` (import kaynağı)

**Interfaces:**
- Produces: `AppMapView` ve `AppMarker` — react-native-maps `MapView`/`Marker`'ın kullanılan prop alt kümesiyle uyumlu. Native'de doğrudan react-native-maps; web'de Google Maps JS.
- Prop sözleşmesi (her iki platform): `AppMapView` → `style`, `region: { latitude, longitude, latitudeDelta, longitudeDelta }`, `onPress?: (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => void`, `onRegionChangeComplete?: (r: Region) => void`, `children`. `AppMarker` → `coordinate: { latitude: number; longitude: number }`, `draggable?`, `onDragEnd?`.

**Neden:** react-native-maps web'de derlenmez. `.web.tsx` sayesinde web bundle'a hiç girmez; ekranlar tek import satırı değiştirir.

- [ ] **Step 1: Native re-export'u yaz**

`packages/shared/components/AppMap.tsx`:

```tsx
import MapView, { Marker } from 'react-native-maps';
export const AppMapView = MapView;
export const AppMarker = Marker;
export type { Region } from 'react-native-maps';
```

- [ ] **Step 2: Web map dependency'sini ekle (sadece web; native bundle'a girmez)**

Run: `cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım && npm install @react-google-maps/api --workspace @pastacim/shared`
Expected: paket eklenir. (Bu paket yalnız `AppMap.web.tsx`'te import edilir → native'de tree-shake/dosya-çözümleme ile dışlanır.)

- [ ] **Step 3: Web map implementasyonunu yaz**

`packages/shared/components/AppMap.web.tsx` — Google Maps JS ile aynı prop sözleşmesi:

```tsx
import React from 'react';
import { GoogleMap, Marker as GMarker, useJsApiLoader } from '@react-google-maps/api';
import Constants from 'expo-constants';

export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
type Coordinate = { latitude: number; longitude: number };

type MapProps = {
  style?: unknown;
  region?: Region;
  onPress?: (e: { nativeEvent: { coordinate: Coordinate } }) => void;
  onRegionChangeComplete?: (r: Region) => void;
  children?: React.ReactNode;
};

const apiKey = (Constants.expoConfig?.extra?.googleMapsApiKey as string) ?? '';

export function AppMapView({ style, region, onPress, children }: MapProps) {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: apiKey });
  if (!isLoaded) return null;
  const center = region ? { lat: region.latitude, lng: region.longitude } : { lat: 41.0, lng: 29.0 };
  return (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height: '100%', ...(style as object) }}
      center={center}
      zoom={13}
      onClick={(e) => {
        if (e.latLng && onPress) {
          onPress({ nativeEvent: { coordinate: { latitude: e.latLng.lat(), longitude: e.latLng.lng() } } });
        }
      }}
    >
      {children}
    </GoogleMap>
  );
}

export function AppMarker({ coordinate }: { coordinate: Coordinate; draggable?: boolean; onDragEnd?: unknown }) {
  return <GMarker position={{ lat: coordinate.latitude, lng: coordinate.longitude }} />;
}
```

> `googleMapsApiKey` her app'in `app.config.js` extra'sından okunur (Task 6/7'de eklenir). Boşsa harita render olmaz (graceful).

- [ ] **Step 4: Shared'dan export et**

`packages/shared/index.ts`'e ekle:

```ts
export { AppMapView, AppMarker } from './components/AppMap';
export type { Region } from './components/AppMap';
```

- [ ] **Step 5: İki ekranı yeni import'a geçir**

`apps/customer/app/(customer)/order/create.tsx` ve `apps/baker/app/(baker)/setup.tsx` dosyalarında:
- `import MapView, { Marker } from 'react-native-maps';` satırını **kaldır**.
- Yerine: `import { AppMapView as MapView, AppMarker as Marker } from '@pastacim/shared';`
- Kullanılan diğer react-native-maps tipleri (`Region` vb.) varsa onları da `@pastacim/shared`'dan al.
- JSX'te `<MapView>`/`<Marker>` kullanımları aynı kalır (prop sözleşmesi uyumlu). react-native-maps'e özel ekstra prop kullanılıyorsa (provider, customMapStyle), web sözleşmesinde olmayanları kaldır veya web'de yok say.

- [ ] **Step 6: Tip kontrolü (her iki app + shared)**

Run: `npm run tsc:shared && cd apps/customer && npx tsc --noEmit && cd ../baker && npx tsc --noEmit`
Expected: PASS. Hata varsa kullanılan prop'ları AppMap sözleşmesine ekle.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/components/AppMap.tsx packages/shared/components/AppMap.web.tsx packages/shared/index.ts packages/shared/package.json "apps/customer/app/(customer)/order/create.tsx" "apps/baker/app/(baker)/setup.tsx"
git commit -m "feat(web): platform-bölünmüş AppMap (native maps / web google maps js)"
```

---

### Task 5: Üst store-link banner (web-only)

**Files:**
- Create: `packages/shared/components/WebStoreBanner.tsx`
- Modify: `packages/shared/index.ts` (export)
- Modify: `apps/customer/app/_layout.tsx` (mount)
- Modify: `apps/baker/app/_layout.tsx` (mount)

**Interfaces:**
- Produces: `WebStoreBanner({ appName, iosUrl, androidUrl })` — yalnız `Platform.OS === 'web'` iken görünür sticky üst bar; native'de `null` döner.

- [ ] **Step 1: Banner bileşenini yaz**

`packages/shared/components/WebStoreBanner.tsx`:

```tsx
import React from 'react';
import { Platform, View, Text, Pressable, Linking, StyleSheet } from 'react-native';

type Props = { appName: string; iosUrl?: string; androidUrl?: string };

export function WebStoreBanner({ appName, iosUrl, androidUrl }: Props) {
  if (Platform.OS !== 'web') return null;
  return (
    <View style={styles.bar}>
      <Text style={styles.brand}>{appName}</Text>
      <View style={styles.links}>
        {iosUrl ? (
          <Pressable onPress={() => Linking.openURL(iosUrl)} style={styles.btn}>
            <Text style={styles.btnText}>App Store</Text>
          </Pressable>
        ) : null}
        {androidUrl ? (
          <Pressable onPress={() => Linking.openURL(androidUrl)} style={styles.btn}>
            <Text style={styles.btnText}>Google Play</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#8B1A3D',
  },
  brand: { color: '#fff', fontWeight: '700', fontSize: 16 },
  links: { flexDirection: 'row', gap: 8 },
  btn: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
```

- [ ] **Step 2: Shared'dan export et**

`packages/shared/index.ts`'e: `export { WebStoreBanner } from './components/WebStoreBanner';`

- [ ] **Step 3: Customer root layout'a mount et**

`apps/customer/app/_layout.tsx` — döndürülen ağacın en dışına, mevcut içerikten **önce** banner'ı ekle. Örn root return'de en üst View/Fragment içinde ilk child:

```tsx
import { WebStoreBanner } from '@pastacim/shared';
// ... render içinde, ana navigator'dan hemen önce:
<WebStoreBanner
  appName="Pastacım"
  iosUrl="https://apps.apple.com/app/idPLACEHOLDER"
  androidUrl="https://play.google.com/store/apps/details?id=com.pastacim.customer"
/>
```

> iOS App ID henüz canlı değil → `idPLACEHOLDER` bırak; onay sonrası güncellenecek. Banner sadece web'de görünür, native'i etkilemez.

- [ ] **Step 4: Baker root layout'a mount et**

`apps/baker/app/_layout.tsx` — aynısı, `appName="Pastacım Pro"`, `androidUrl="https://play.google.com/store/apps/details?id=com.pastacim.baker"`.

- [ ] **Step 5: Tip kontrolü**

Run: `npm run tsc:shared && cd apps/customer && npx tsc --noEmit && cd ../baker && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/components/WebStoreBanner.tsx packages/shared/index.ts apps/customer/app/_layout.tsx apps/baker/app/_layout.tsx
git commit -m "feat(web): üst store-link banner (web-only, her iki app)"
```

---

### Task 6: Customer — web deps, config ve export

**Files:**
- Modify: `apps/customer/package.json` (deps + scripts)
- Modify: `apps/customer/app.config.js` (web bloğu + extra.googleMapsApiKey)
- Create: `apps/customer/public/_redirects`

**Interfaces:**
- Produces: `apps/customer/dist/` — deploy edilebilir statik web SPA.

- [ ] **Step 1: Web runtime paketlerini ekle**

Run: `cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım/apps/customer && npx expo install react-dom react-native-web @expo/metro-runtime`
Expected: 3 paket SDK 56 uyumlu sürümlerle eklenir.

- [ ] **Step 2: package.json script'leri ekle**

`apps/customer/package.json` `scripts` içine:

```json
"web": "expo start --web",
"export:web": "expo export -p web"
```

- [ ] **Step 3: app.config.js web bloğu + maps key**

`apps/customer/app.config.js` döndürülen config nesnesine `web` bloğu ekle ve `extra`'ya `googleMapsApiKey` ekle (mevcut Places key'i ile aynı GCP projesinden Maps JS API; değeri zaten extra'da Places key olarak varsa onu yeniden kullan):

```js
web: {
  bundler: 'metro',
  output: 'single',
  favicon: './assets/images/favicon.png',
},
// extra: { ...mevcut, googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? '<mevcut-places-key>' }
```

> `favicon` yolu yoksa mevcut bir ikon yolunu kullan (`ls apps/customer/assets/images` ile doğrula).

- [ ] **Step 4: SPA fallback redirects**

`apps/customer/public/_redirects` oluştur (Expo `public/` içeriğini `dist/` köküne kopyalar):

```
/*    /index.html   200
```

- [ ] **Step 5: Web export'u çalıştır**

Run: `cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım/apps/customer && npx expo export -p web`
Expected: `dist/` üretilir, hata yok. Hata `react-native-maps` veya başka native modülden geliyorsa: o modülü kullanan ekranı bul, `.web.tsx` shim veya `Platform.OS` guard ekle, tekrar dene. `dist/_redirects` ve `dist/index.html` mevcut olmalı.

- [ ] **Step 6: Commit**

```bash
git add apps/customer/package.json apps/customer/app.config.js apps/customer/public/_redirects package-lock.json
git commit -m "feat(web): customer expo-web deps + config + spa redirects"
```

---

### Task 7: Baker — web deps, config ve export

**Files:**
- Modify: `apps/baker/package.json` (deps + scripts)
- Modify: `apps/baker/app.config.js` (web bloğu + extra.googleMapsApiKey)
- Create: `apps/baker/public/_redirects`

**Interfaces:**
- Produces: `apps/baker/dist/` — deploy edilebilir statik web SPA.

- [ ] **Step 1: Web runtime paketlerini ekle**

Run: `cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım/apps/baker && npx expo install react-dom react-native-web @expo/metro-runtime`
Expected: 3 paket eklenir.

- [ ] **Step 2: package.json script'leri ekle**

`apps/baker/package.json` `scripts` içine `"web": "expo start --web"` ve `"export:web": "expo export -p web"`.

- [ ] **Step 3: app.config.js web bloğu + maps key**

Task 6 Step 3 ile aynı; favicon yolunu `apps/baker/assets/...` altından doğrula. `extra.googleMapsApiKey`'i baker'ın mevcut Places key'i ile doldur.

- [ ] **Step 4: SPA fallback redirects**

`apps/baker/public/_redirects`:

```
/*    /index.html   200
```

- [ ] **Step 5: Web export'u çalıştır**

Run: `cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım/apps/baker && npx expo export -p web`
Expected: `dist/` üretilir, hata yok. Native modül hatasında Task 6 Step 5'teki gibi shim/guard ekle.

- [ ] **Step 6: Commit**

```bash
git add apps/baker/package.json apps/baker/app.config.js apps/baker/public/_redirects package-lock.json
git commit -m "feat(web): baker expo-web deps + config + spa redirects"
```

---

### Task 8: Lokal duman testi (her iki app)

**Files:** (yok — manuel doğrulama)

- [ ] **Step 1: Customer web dev sunucu**

Run: `cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım/apps/customer && npx expo start --web`
Doğrula (tarayıcı): üst banner görünür (App Store + Google Play); email ile giriş çalışır; sipariş oluştur ekranında harita render olur ve konum seçilebilir; mesajlaşma listesi yüklenir. Konsолда kırmızı native-modül hatası olmamalı.

- [ ] **Step 2: Baker web dev sunucu**

Run: `cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım/apps/baker && npx expo start --web`
Doğrula: banner ("Pastacım Pro"); giriş; setup ekranı haritası; yakındaki talepler listesi.

- [ ] **Step 3: Google girişi (en az bir app)**

Web'de Google ile giriş → tam-sayfa redirect → dönüşte oturum açılmış olmalı. (Supabase/Google redirect URL config'i Task 10'da; lokalde `http://localhost:8081` redirect'i Supabase'e ekli değilse bu adım staging/prod'da doğrulanır.)

> Bu task kod commit'i üretmez; bulunan buglar ilgili task'a geri döner.

---

### Task 9: Cloudflare deploy + yasal worker birlikte yaşama

**Files:**
- Modify: `web/legal/wrangler.toml` (custom_domain → path routes)
- Create: `docs/web-deploy.md` (deploy adımları, kalıcı referans)

**Interfaces:**
- Produces: `pastacim.ipekciapp.com` → Pages (app) + Worker (`/terms`, `/privacy`, `/unsubscribe`); `pastacimpro.ipekciapp.com` → Pages.

**Neden:** Worker şu an tüm subdomain'i custom_domain ile tutuyor; Pages ile çakışmaması için 3 path-route'a indirilir (route'lar Pages'ten önceliklidir).

- [ ] **Step 1: Mevcut wrangler.toml route yapısını oku**

Run: `cat web/legal/wrangler.toml`
Amaç: mevcut `routes`/`custom_domain` satırlarını gör.

- [ ] **Step 2: Worker'ı path-route'lara çevir**

`web/legal/wrangler.toml` içindeki `routes` bloğunu, custom_domain yerine 3 path-route olacak şekilde değiştir:

```toml
routes = [
  { pattern = "pastacim.ipekciapp.com/terms*", zone_name = "ipekciapp.com" },
  { pattern = "pastacim.ipekciapp.com/privacy*", zone_name = "ipekciapp.com" },
  { pattern = "pastacim.ipekciapp.com/unsubscribe*", zone_name = "ipekciapp.com" },
]
```

> `custom_domain = true` satırını kaldır. Bu sayede subdomain DNS'i Pages'e bağlanabilir, bu 3 path Worker'da kalır.

- [ ] **Step 3: Worker'ı yeniden deploy et**

Run: `cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım/web/legal && npx wrangler deploy`
Expected: deploy başarılı, 3 route bağlandı.
Doğrula: `curl -sI https://pastacim.ipekciapp.com/terms | head -1` → `200`; sayfa hâlâ HTML.

- [ ] **Step 4: Cloudflare Pages projelerini oluştur ve deploy et**

İki proje (Wrangler Pages ile):

```bash
cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım/apps/customer
npx wrangler pages deploy dist --project-name pastacim-web
cd ../baker
npx wrangler pages deploy dist --project-name pastacimpro-web
```

Expected: her biri `*.pages.dev` preview URL'i döner.

- [ ] **Step 5: Custom domain'leri bağla**

Cloudflare Dashboard → Pages → `pastacim-web` → Custom domains → `pastacim.ipekciapp.com` ekle. `pastacimpro-web` → `pastacimpro.ipekciapp.com` ekle. (DNS zaten Cloudflare'de.)
Doğrula: `curl -sI https://pastacim.ipekciapp.com/ | head -1` → 200 (app); `/terms` → hâlâ Worker (HTML yasal sayfa).

- [ ] **Step 6: Deploy adımlarını dokümana yaz + commit**

`docs/web-deploy.md` oluştur: export komutları, `wrangler pages deploy` komutları, worker route yapısı, korunan URL'ler ve doğrulama curl'leri. Sonra:

```bash
git add web/legal/wrangler.toml docs/web-deploy.md
git commit -m "feat(web): cloudflare pages deploy + yasal worker path-route'lar"
```

---

### Task 10: Auth redirect URL config'i (kod dışı — dokümante)

**Files:**
- Modify: `docs/web-deploy.md` (config notları)

**Neden:** Web Google OAuth ve email redirect'lerin çalışması için Supabase + Google Console allowlist'i güncellenmeli. MCP/CLI ile yapılamayanlar kullanıcı aksiyonu olarak yazılır.

- [ ] **Step 1: Supabase Auth redirect URL'leri ekle**

Supabase Management API (PAT ile) veya Dashboard → Authentication → URL Configuration → Redirect URLs'e ekle:
`https://pastacim.ipekciapp.com/*`, `https://pastacimpro.ipekciapp.com/*` (ve lokal test için `http://localhost:8081/*`).

- [ ] **Step 2: Google Cloud Console OAuth client**

Authorized JavaScript origins: `https://pastacim.ipekciapp.com`, `https://pastacimpro.ipekciapp.com`.
Authorized redirect URIs: Supabase callback (`https://lvrbzhziayegyinkcuka.supabase.co/auth/v1/callback`) zaten ekli olmalı; web origin'ler eklenir.

- [ ] **Step 3: Maps JS API origin kısıtı**

GCP → Credentials → kullanılan Maps/Places API key → Application restrictions → HTTP referrers: iki domain eklenir. Maps JavaScript API etkin olmalı.

- [ ] **Step 4: Doğrulama + dokümana işle**

Prod domainde Google ile giriş → başarılı redirect → oturum. Harita prod'da render. Adımları `docs/web-deploy.md`'ye yaz, commit:

```bash
git add docs/web-deploy.md
git commit -m "docs(web): auth redirect + maps api config adımları"
```

---

## Self-Review

**Spec coverage:**
- A. Mimari/deps → Task 6,7 ✓
- B1. Supabase web storage → Task 1 ✓
- B2. Harita web → Task 4 ✓
- B3. Push web no-op → Task 3 ✓
- C. Store banner → Task 5 ✓
- D. Google OAuth web → Task 2 + Task 10 ✓
- E. Cloudflare Pages deploy → Task 9 ✓
- E1. Yasal worker birlikte yaşama → Task 9 ✓
- Test/doğrulama → Task 8 + her task tsc/export adımı ✓

**Placeholder taraması:** iOS App Store ID (`idPLACEHOLDER`) bilinçli — App henüz review'de, onay sonrası güncellenecek (spec'te de açık). Diğer placeholder yok.

**Tip tutarlılığı:** `AppMapView`/`AppMarker`/`Region` isimleri Task 4 boyunca tutarlı; `WebStoreBanner` props Task 5'te tutarlı; `signInWithGoogle(redirectUrl)` imzası değişmedi.

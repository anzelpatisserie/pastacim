# Bildirimler İyileştirmeleri — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Baker uygulamasında bildirimler sekmesini göster, her iki uygulamada başlık çubuğuna bildirim zili butonu ekle.

**Architecture:** Baker `_layout.tsx` içindeki `href: null` kaldırılarak bildirim sekmesi aktif edilir. Her iki uygulamanın ana ekran başlığına (index.tsx) bildirim zili ikonu eklenir; bu ikon bildirimler ekranına yönlendirir ve okunmamış bildirim sayısını badge olarak gösterir.

**Tech Stack:** React Native, expo-router, `useNotifications` hook (zaten mevcut), `@pastacim/shared`

---

### Task 1: Baker uygulamasında bildirimler sekmesini etkinleştir

**Files:**
- Modify: `apps/baker/app/(baker)/_layout.tsx`

- [ ] **Adım 1: notifications sekmesinden `href: null` kaldır ve ikon ekle**

`apps/baker/app/(baker)/_layout.tsx` dosyasında şu satırı bul:
```tsx
<Tabs.Screen name="notifications" options={{ href: null }} />
```

Şu şekilde değiştir (wallet sekmesinin `href: null`'ı korunacak, sadece notifications değişecek):
```tsx
<Tabs.Screen name="notifications" options={{
  tabBarIcon: ({ focused }) => (
    <TabIcon emoji="🔔" label="Bildirim" focused={focused} activeColor={C.primary} inactiveColor={C.icon} badge={unreadCount} />
  ),
}} />
```

- [ ] **Adım 2: TypeScript kontrolü yap**

```bash
cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Adım 3: Commit**

```bash
git add apps/baker/app/\(baker\)/_layout.tsx
git commit -m "feat(baker): show notifications tab in bottom nav"
```

---

### Task 2: Baker ana ekranına bildirim zili butonu ekle

**Files:**
- Modify: `apps/baker/app/(baker)/index.tsx`

- [ ] **Adım 1: Mevcut header'ı bul**

`apps/baker/app/(baker)/index.tsx` dosyasını oku. Header bölümünde bir View + Text + TouchableOpacity yapısı var. Sağ tarafa zil butonu eklenecek.

- [ ] **Adım 2: Import'ları güncelle**

Dosyanın import bölümüne `router` (zaten varsa kontrol et) ve `useNotifications` ekle. `useNotifications` hook'u şu yerden import edilir:
```tsx
import { useNotifications } from '../../hooks/useNotifications';
```
Not: Bu hook zaten `_layout.tsx` içinde kullanılıyor. `index.tsx`'de de kullanılabilir.

- [ ] **Adım 3: unreadCount state'i ekle**

`BakerHomeScreen` component'ının içinde, mevcut hook'ların yanına ekle:
```tsx
const { unreadCount } = useNotifications(user?.id);
```

- [ ] **Adım 4: Header'a zil butonu ekle**

Mevcut header stilini koru. Başlık `"Talepler"` veya profil bilgisini içeren View. Genellikle şu yapıya sahip:
```tsx
<View style={styles.header}>
  <Text style={...}>...</Text>
  <TouchableOpacity onPress={signOut}>...profil...</TouchableOpacity>
</View>
```

Sağ tarafa (signOut butonunun yanına veya yerine) zil butonu ekle:
```tsx
<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
  {/* Bildirim zili */}
  <TouchableOpacity
    onPress={() => router.push('/(baker)/notifications' as never)}
    style={{ position: 'relative', padding: 4 }}
  >
    <Text style={{ fontSize: 22 }}>🔔</Text>
    {unreadCount > 0 && (
      <View style={{
        position: 'absolute', top: 0, right: 0,
        backgroundColor: C.primary, borderRadius: 8,
        minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 3,
      }}>
        <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '800' }}>
          {unreadCount > 99 ? '99+' : unreadCount}
        </Text>
      </View>
    )}
  </TouchableOpacity>
  {/* Mevcut çıkış/profil butonu */}
  ...
</View>
```

- [ ] **Adım 5: TypeScript kontrolü**

```bash
cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Adım 6: Commit**

```bash
git add apps/baker/app/\(baker\)/index.tsx
git commit -m "feat(baker): add notification bell button to home screen header"
```

---

### Task 3: Customer ana ekranına bildirim zili butonu ekle

**Files:**
- Modify: `apps/customer/app/(customer)/index.tsx`

- [ ] **Adım 1: Mevcut header'ı incele**

`apps/customer/app/(customer)/index.tsx` dosyasını oku. Header stilini anla.

- [ ] **Adım 2: Import'ları güncelle**

```tsx
import { useNotifications } from '@/hooks/useNotifications';
```
(Müşteri uygulamasında path alias `@/` kullanılıyor)

- [ ] **Adım 3: unreadCount ekle**

```tsx
const { unreadCount } = useNotifications(user?.id ?? profile?.id);
```

- [ ] **Adım 4: Header'a zil butonu ekle**

Baker'dakiyle aynı pattern — sağ tarafa yönlendirme:
```tsx
<TouchableOpacity
  onPress={() => router.push('/(customer)/notifications' as never)}
  style={{ position: 'relative', padding: 4 }}
>
  <Text style={{ fontSize: 22 }}>🔔</Text>
  {unreadCount > 0 && (
    <View style={{
      position: 'absolute', top: 0, right: 0,
      backgroundColor: C.primary, borderRadius: 8,
      minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 3,
    }}>
      <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '800' }}>
        {unreadCount > 99 ? '99+' : unreadCount}
      </Text>
    </View>
  )}
</TouchableOpacity>
```

- [ ] **Adım 5: TypeScript kontrolü**

```bash
cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Adım 6: Commit**

```bash
git add apps/customer/app/\(customer\)/index.tsx
git commit -m "feat(customer): add notification bell button to home screen header"
```

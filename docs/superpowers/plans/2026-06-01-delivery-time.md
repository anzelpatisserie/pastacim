# Teslimat Saati — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sipariş oluşturma formuna teslimat saati seçici ve acil sipariş toggle'ı ekle; acil siparişlerde saat zorunlu olsun; pastacı ve müşteri kartlarında saat göster.

**Architecture:**
- DB: `orders` tablosuna `is_urgent BOOLEAN DEFAULT false` kolonu eklenir. `delivery_time` kolonu zaten mevcut (`time` tipi, schema.sql satır 135).
- `place_order` PostgreSQL fonksiyonu `p_delivery_time` ve `p_is_urgent` parametrelerini alacak şekilde güncellenir (Supabase SQL Editor'da çalıştırılır).
- TypeScript tipleri güncellenir (`database.types.ts`).
- `rpcPlaceOrder` wrapper'ı zaten `Functions['place_order']['Args']` tipini kullandığı için tip güncellemesi yeterli.
- Order creation form: `DateTimePicker` mode=`time` ile saat seçici + acil toggle.
- Baker index: mevcut sipariş kartlarına saat ve acil badge ekle.
- Customer my-orders: sipariş detayında saat göster.

**Tech Stack:** React Native `@react-native-community/datetimepicker` (zaten kurulu), Supabase SQL, TypeScript

---

### Task 1: Veritabanı migrasyonu — is_urgent kolonu + place_order fonksiyon güncellemesi

**Files:**
- Modify: `supabase/schema.sql` (sadece referans için yoruma ekle)
- Modify: `packages/shared/types/database.types.ts`

- [ ] **Adım 1: Supabase SQL Editor'da is_urgent kolonu ekle**

Supabase Dashboard → SQL Editor'da şu sorguyu çalıştır (management API ile yapılacak):

```bash
SUPABASE_ACCESS_TOKEN=$(cat /Users/soneripekci/.claude/projects/-Users-soneripekci-Documents-Dev-VsCode-Pastac-m/memory/supabase-pat.md | grep -oP '(?<=Token: ).*' | head -1 | tr -d '[:space:]')
curl -s -X POST "https://api.supabase.com/v1/projects/lvrbzhziayegyinkcuka/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT false;"}'
```

- [ ] **Adım 2: place_order fonksiyonunu güncelle**

```bash
SUPABASE_ACCESS_TOKEN=$(cat /Users/soneripekci/.claude/projects/-Users-soneripekci-Documents-Dev-VsCode-Pastac-m/memory/supabase-pat.md | grep -oP '(?<=Token: ).*' | head -1 | tr -d '[:space:]')
curl -s -X POST "https://api.supabase.com/v1/projects/lvrbzhziayegyinkcuka/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "CREATE OR REPLACE FUNCTION public.place_order(p_title text, p_description text DEFAULT NULL, p_serving_size integer DEFAULT NULL, p_delivery_type text DEFAULT '\''delivery'\'', p_delivery_address text DEFAULT NULL, p_delivery_latitude double precision DEFAULT NULL, p_delivery_longitude double precision DEFAULT NULL, p_delivery_date date DEFAULT NULL, p_latitude double precision DEFAULT NULL, p_longitude double precision DEFAULT NULL, p_search_radius_km integer DEFAULT 20, p_delivery_time time DEFAULT NULL, p_is_urgent boolean DEFAULT false) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$ DECLARE v_order_id uuid; v_customer_id uuid; BEGIN v_customer_id := auth.uid(); IF v_customer_id IS NULL THEN RETURN json_build_object(''error'', ''Oturum açmanız gerekiyor.''); END IF; INSERT INTO public.orders (customer_id, title, description, serving_size, delivery_type, delivery_address, delivery_latitude, delivery_longitude, delivery_date, delivery_time, is_urgent, latitude, longitude, search_radius_km, status) VALUES (v_customer_id, p_title, p_description, p_serving_size, p_delivery_type, p_delivery_address, p_delivery_latitude, p_delivery_longitude, p_delivery_date, p_delivery_time, p_is_urgent, p_latitude, p_longitude, p_search_radius_km, ''pending'') RETURNING id INTO v_order_id; RETURN json_build_object(''order_id'', v_order_id, ''error'', NULL); EXCEPTION WHEN OTHERS THEN RETURN json_build_object(''order_id'', NULL, ''error'', SQLERRM); END; $$;"
  }'
```

- [ ] **Adım 3: database.types.ts içinde place_order Args tipini güncelle**

`packages/shared/types/database.types.ts` içinde `place_order` tipini bul ve `Args`'a ekle:

Mevcut `Args`:
```ts
Args: {
  p_title: string;
  p_description?: string | null;
  p_serving_size?: number | null;
  p_delivery_type?: string;
  p_delivery_address?: string | null;
  p_delivery_latitude?: number | null;
  p_delivery_longitude?: number | null;
  p_delivery_date?: string | null;
  p_latitude?: number | null;
  p_longitude?: number | null;
  p_search_radius_km?: number;
};
```

Şu şekilde güncelle:
```ts
Args: {
  p_title: string;
  p_description?: string | null;
  p_serving_size?: number | null;
  p_delivery_type?: string;
  p_delivery_address?: string | null;
  p_delivery_latitude?: number | null;
  p_delivery_longitude?: number | null;
  p_delivery_date?: string | null;
  p_latitude?: number | null;
  p_longitude?: number | null;
  p_search_radius_km?: number;
  p_delivery_time?: string | null;
  p_is_urgent?: boolean;
};
```

Ayrıca `orders` tablosunun `Row` ve `Insert` tiplerine `is_urgent` ekle:
- `Row` içine: `is_urgent: boolean;`
- `Insert` içine: `is_urgent?: boolean;`
- `Update` içine: `is_urgent?: boolean;`

- [ ] **Adım 4: TypeScript kontrolü**

```bash
cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Adım 5: Commit**

```bash
git add packages/shared/types/database.types.ts
git commit -m "feat(db): add is_urgent column and p_delivery_time/p_is_urgent to place_order function"
```

---

### Task 2: Sipariş oluşturma formuna saat seçici ve acil toggle ekle

**Files:**
- Modify: `apps/customer/app/(customer)/order/create.tsx`

- [ ] **Adım 1: Yeni state'leri ekle**

`CreateOrderScreen` component'ında mevcut `deliveryDate` state'inden sonra ekle:
```tsx
const [deliveryTime, setDeliveryTime] = useState<Date | null>(null);
const [showTimePicker, setShowTimePicker] = useState(false);
const [isUrgent, setIsUrgent] = useState(false);
```

- [ ] **Adım 2: Form reset'e saat ve acil ekle**

`handleSubmit` içindeki form sıfırlama bloğuna ekle:
```tsx
setDeliveryTime(null);
setIsUrgent(false);
```

- [ ] **Adım 3: Saat formatlama fonksiyonu ekle**

```tsx
const formatDisplayTime = (d: Date): string =>
  d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

const toTimeString = (d: Date): string => {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}:00`;
};
```

- [ ] **Adım 4: handleSubmit'te validasyon ekle**

Acil sipariş ise saat zorunlu:
```tsx
if (isUrgent && !deliveryTime) {
  Alert.alert('Eksik bilgi', 'Acil siparişlerde teslimat saati seçilmelidir.');
  return;
}
```

- [ ] **Adım 5: rpcPlaceOrder çağrısına yeni parametreler ekle**

Mevcut çağrıda (`handleSubmit` içinde) şu iki parametreyi ekle:
```tsx
p_delivery_time: deliveryTime ? toTimeString(deliveryTime) : null,
p_is_urgent: isUrgent,
```

- [ ] **Adım 6: Acil sipariş toggle'ı ekle**

`"Teslim Tarihi"` bölümünden ÖNCE, `"Teslim Şekli"` bölümünden SONRA ekle:
```tsx
{/* ─── Acil Sipariş ─────────────────────────────── */}
<View style={styles.field}>
  <TouchableOpacity
    style={[styles.toggleRow, {
      backgroundColor: isUrgent ? C.primary + '15' : C.card,
      borderColor: isUrgent ? C.primary : C.border,
    }]}
    onPress={() => setIsUrgent((v) => !v)}
    activeOpacity={0.75}
  >
    <Text style={[styles.toggleBtnText, { color: isUrgent ? C.primary : C.textSecondary, flex: 1, textAlign: 'center' }]}>
      {isUrgent ? '⚡ Acil Sipariş' : '⚡ Acil Sipariş Değil'}
    </Text>
  </TouchableOpacity>
  {isUrgent && (
    <Text style={{ fontSize: FontSize.xs, color: C.textSecondary }}>
      Acil siparişlerde teslimat saati zorunludur.
    </Text>
  )}
</View>
```

- [ ] **Adım 7: Teslimat saati seçici ekle**

`"Teslim Tarihi"` bölümünden hemen SONRA ekle:
```tsx
{/* ─── Teslim Saati ─────────────────────────────── */}
<View style={styles.field}>
  <Text style={[styles.label, { color: C.text }]}>
    Teslim Saati{isUrgent && <Text style={{ color: C.error }}> *</Text>}
  </Text>
  <TouchableOpacity
    style={[styles.datePicker, {
      backgroundColor: C.card,
      borderColor: deliveryTime ? C.primary : (isUrgent ? C.error + '80' : C.border),
    }]}
    onPress={() => setShowTimePicker(true)}
    activeOpacity={0.75}
  >
    <Text style={[styles.datePickerText, { color: deliveryTime ? C.text : C.placeholder }]}>
      🕐 {deliveryTime ? formatDisplayTime(deliveryTime) : 'Saat seçin'}
    </Text>
    {deliveryTime && (
      <TouchableOpacity
        onPress={(e) => { e.stopPropagation(); setDeliveryTime(null); }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={[styles.dateClearBtn, { color: C.placeholder }]}>✕</Text>
      </TouchableOpacity>
    )}
  </TouchableOpacity>

  {showTimePicker && (
    <DateTimePicker
      value={deliveryTime ?? new Date()}
      mode="time"
      is24Hour
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      locale="tr-TR"
      onChange={(_: DateTimePickerEvent, selected?: Date) => {
        setShowTimePicker(Platform.OS === 'ios');
        if (selected) setDeliveryTime(selected);
      }}
    />
  )}

  {showTimePicker && Platform.OS === 'ios' && (
    <TouchableOpacity
      style={[styles.dateConfirmBtn, { backgroundColor: C.primary }]}
      onPress={() => setShowTimePicker(false)}
    >
      <Text style={styles.dateConfirmBtnText}>Tamam</Text>
    </TouchableOpacity>
  )}
</View>
```

- [ ] **Adım 8: TypeScript kontrolü**

```bash
cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım && npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Adım 9: Commit**

```bash
git add apps/customer/app/\(customer\)/order/create.tsx
git commit -m "feat(customer): add delivery time picker and urgent order toggle to order form"
```

---

### Task 3: Baker sipariş kartlarında teslimat saati ve acil badge göster

**Files:**
- Modify: `apps/baker/app/(baker)/index.tsx`

- [ ] **Adım 1: NearbyOrder tipini kontrol et**

`apps/baker/app/(baker)/index.tsx` içinde `NearbyOrder` tipi `Database['public']['Functions']['nearby_orders']['Returns'][number]` olarak tanımlı. `nearby_orders` fonksiyonu `delivery_time` ve `is_urgent` döndürüyor mu? Bak:

```bash
grep -n "nearby_orders\|delivery_time\|is_urgent" /Users/soneripekci/Documents/Dev_VsCode/Pastacım/packages/shared/types/database.types.ts | head -20
```

Eğer `delivery_time` ve `is_urgent` `nearby_orders` Returns tipinde yoksa, `rpcNearbyOrders`'ı bypass ederek `_db.from('orders')` ile sorgularsın veya tipini `any` ile genişletirsin. Daha kolay yaklaşım: kart içinde bu alanları `(item as any).delivery_time` olarak kullan ve sonra tipi güncelle.

- [ ] **Adım 2: Sipariş kartında saat ve acil badge ekle**

Baker index'te sipariş kartı render eden bileşeni bul (genellikle `RequestCard` veya inline render). Kart içinde teslimat tarihi gösteriliyorsa yanına saati de ekle:

```tsx
{/* Teslimat tarihi + saat */}
{(item.delivery_date || (item as any).delivery_time) && (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
    {item.delivery_date && (
      <Text style={{ fontSize: FontSize.xs, color: C.textSecondary }}>
        📅 {new Date(item.delivery_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
      </Text>
    )}
    {(item as any).delivery_time && (
      <Text style={{ fontSize: FontSize.xs, color: C.textSecondary }}>
        🕐 {((item as any).delivery_time as string).substring(0, 5)}
      </Text>
    )}
    {(item as any).is_urgent && (
      <View style={{ backgroundColor: '#FED7D7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
        <Text style={{ fontSize: FontSize.xs, color: '#C53030', fontWeight: '700' }}>⚡ Acil</Text>
      </View>
    )}
  </View>
)}
```

- [ ] **Adım 3: TypeScript kontrolü**

```bash
cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Adım 4: Commit**

```bash
git add apps/baker/app/\(baker\)/index.tsx
git commit -m "feat(baker): show delivery time and urgent badge on order cards"
```

---

### Task 4: Customer sipariş kartlarında teslimat saati göster

**Files:**
- Modify: `apps/customer/app/(customer)/my-orders.tsx`

- [ ] **Adım 1: my-orders.tsx içindeki sipariş kart yapısını incele**

`apps/customer/app/(customer)/my-orders.tsx` dosyasını oku. Kart içinde `delivery_date` gösteriliyorsa yanına `delivery_time` ve `is_urgent` ekle.

- [ ] **Adım 2: Saat ve acil badge ekle**

Mevcut teslimat tarihi satırına bitişik ekle:
```tsx
{item.delivery_time && (
  <Text style={{ fontSize: FontSize.xs, color: C.textSecondary }}>
    🕐 {(item.delivery_time as string).substring(0, 5)}
  </Text>
)}
{item.is_urgent && (
  <View style={{ backgroundColor: '#FED7D7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
    <Text style={{ fontSize: FontSize.xs, color: '#C53030', fontWeight: '700' }}>⚡ Acil</Text>
  </View>
)}
```

- [ ] **Adım 3: TypeScript kontrolü**

```bash
cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Adım 4: Commit**

```bash
git add apps/customer/app/\(customer\)/my-orders.tsx
git commit -m "feat(customer): show delivery time and urgent badge on order cards"
```

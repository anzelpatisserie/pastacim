# Geri Bildirim Butonu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Her iki uygulamaya sağ üst köşeye geri bildirim butonu ekle; kullanıcılar metin + isteğe bağlı ekran görüntüsü ile geri bildirim gönderebilsin.

**Architecture:**
- DB: `feedbacks` tablosu Supabase'de oluşturulur (Management API ile).
- Shared: `FeedbackModal` komponenti `packages/shared/components/` altında oluşturulur; `@pastacim/shared`'dan export edilir.
- Apps: Baker ve Customer ana ekranlarına (index.tsx) sağ üst köşeye 💬 butonu eklenir; butona basınca modal açılır.
- Screenshot: `expo-image-picker` ile galeride seçilir veya kamerada çekilir; Supabase Storage `feedbacks` bucket'ına yüklenir.

**Tech Stack:** React Native Modal, expo-image-picker (zaten kurulu), Supabase Storage, TypeScript

---

### Task 1: Veritabanında feedbacks tablosu ve storage bucket oluştur

**Files:**
- Modify: `supabase/schema.sql` (referans yorumu ekle)

- [ ] **Adım 1: feedbacks tablosunu oluştur**

```bash
SUPABASE_ACCESS_TOKEN=$(cat /Users/soneripekci/.claude/projects/-Users-soneripekci-Documents-Dev-VsCode-Pastac-m/memory/supabase-pat.md | grep -oP '(?<=Token: ).*' | head -1 | tr -d '[:space:]')
curl -s -X POST "https://api.supabase.com/v1/projects/lvrbzhziayegyinkcuka/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "CREATE TABLE IF NOT EXISTS public.feedbacks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, message text NOT NULL, screenshot_url text, app_name text NOT NULL DEFAULT '\''unknown'\'', created_at timestamptz NOT NULL DEFAULT now());"
  }'
```

- [ ] **Adım 2: RLS politikalarını ekle**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/lvrbzhziayegyinkcuka/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY; CREATE POLICY \"feedbacks: authenticated insert\" ON public.feedbacks FOR INSERT TO authenticated WITH CHECK (true); CREATE POLICY \"feedbacks: admin select\" ON public.feedbacks FOR SELECT TO authenticated USING (user_id = auth.uid());"
  }'
```

- [ ] **Adım 3: Feedbacks storage bucket oluştur**

Supabase Dashboard → Storage → New bucket → `feedbacks` (private). Eğer API ile yapmak istersen:
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/lvrbzhziayegyinkcuka/storage/buckets" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id": "feedbacks", "name": "feedbacks", "public": false}'
```

- [ ] **Adım 4: Commit**

```bash
git commit --allow-empty -m "feat(db): add feedbacks table and storage bucket"
```

---

### Task 2: FeedbackModal komponenti oluştur (shared)

**Files:**
- Create: `packages/shared/components/FeedbackModal.tsx`
- Modify: `packages/shared/index.ts`

- [ ] **Adım 1: FeedbackModal.tsx oluştur**

`packages/shared/components/FeedbackModal.tsx`:
```tsx
import { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Image, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useThemeColors, Spacing, Radius, FontSize } from '../lib/constants';

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
  appName: 'customer' | 'baker';
}

export default function FeedbackModal({ visible, onClose, appName }: FeedbackModalProps) {
  const C = useThemeColors();
  const { user } = useAuth();

  const [message, setMessage] = useState('');
  const [screenshotUri, setScreenshotUri] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _db: any = supabase;

  const handlePickScreenshot = () => {
    Alert.alert('Ekran Görüntüsü', 'Nereden eklemek istersiniz?', [
      {
        text: '📷 Kamera',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('İzin Gerekli', 'Kamera izni gerekiyor.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.6,
            allowsEditing: false,
          });
          if (!result.canceled && result.assets[0]) {
            setScreenshotUri(result.assets[0].uri);
          }
        },
      },
      {
        text: '🖼️ Galeri',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('İzin Gerekli', 'Galeri izni gerekiyor.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.6,
          });
          if (!result.canceled && result.assets[0]) {
            setScreenshotUri(result.assets[0].uri);
          }
        },
      },
      { text: 'İptal', style: 'cancel' },
    ]);
  };

  const handleSubmit = async () => {
    if (!message.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen geri bildiriminizi yazın.');
      return;
    }

    setIsSubmitting(true);
    let screenshotUrl: string | null = null;

    try {
      // Screenshot yükle
      if (screenshotUri && user?.id) {
        const response = await fetch(screenshotUri);
        const arrayBuffer = await response.arrayBuffer();
        const path = `${user.id}/${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('feedbacks')
          .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('feedbacks').getPublicUrl(path);
          screenshotUrl = urlData.publicUrl;
        }
      }

      // Feedback kaydet
      const { error } = await _db.from('feedbacks').insert({
        user_id: user?.id ?? null,
        message: message.trim(),
        screenshot_url: screenshotUrl,
        app_name: appName,
      });

      if (error) throw new Error(error.message);

      Alert.alert('Teşekkürler!', 'Geri bildiriminiz alındı. Uygulamayı geliştirmemize yardımcı olduğunuz için teşekkür ederiz.');
      setMessage('');
      setScreenshotUri(null);
      onClose();
    } catch (e) {
      Alert.alert('Hata', 'Geri bildirim gönderilemedi. Lütfen tekrar deneyin.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setMessage('');
    setScreenshotUri(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: C.background }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: C.border }]}>
            <Text style={[styles.title, { color: C.text }]}>💬 Geri Bildirim</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.closeBtn, { color: C.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Mesaj */}
          <Text style={[styles.label, { color: C.textSecondary }]}>Mesajınız</Text>
          <TextInput
            style={[styles.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
            placeholder="Uygulama hakkında düşüncelerinizi paylaşın..."
            placeholderTextColor={C.placeholder}
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            maxLength={1000}
          />
          <Text style={[styles.charCount, { color: C.placeholder }]}>{message.length}/1000</Text>

          {/* Screenshot */}
          <Text style={[styles.label, { color: C.textSecondary, marginTop: Spacing.sm }]}>
            Ekran Görüntüsü (isteğe bağlı)
          </Text>

          {screenshotUri ? (
            <View style={styles.screenshotWrapper}>
              <Image source={{ uri: screenshotUri }} style={styles.screenshot} resizeMode="cover" />
              <TouchableOpacity
                style={[styles.removeScreenshotBtn, { backgroundColor: C.error }]}
                onPress={() => setScreenshotUri(null)}
              >
                <Text style={styles.removeScreenshotText}>✕ Kaldır</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.screenshotPickBtn, { backgroundColor: C.card, borderColor: C.border }]}
              onPress={handlePickScreenshot}
            >
              <Text style={[styles.screenshotPickText, { color: C.textSecondary }]}>📷 Ekran görüntüsü ekle</Text>
            </TouchableOpacity>
          )}

          {/* Gönder */}
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: C.primary }, isSubmitting && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            activeOpacity={0.85}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitBtnText}>Gönder</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: Spacing.lg, paddingBottom: Spacing.xl,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: Spacing.md, marginBottom: Spacing.md, borderBottomWidth: 1,
  },
  title: { fontSize: FontSize.lg, fontWeight: '800' },
  closeBtn: { fontSize: 20, fontWeight: '700' },
  label: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: Spacing.xs },
  input: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: FontSize.md, minHeight: 120,
  },
  charCount: { fontSize: FontSize.xs, textAlign: 'right', marginTop: 2 },
  screenshotWrapper: { marginTop: 4, marginBottom: Spacing.md },
  screenshot: { width: '100%', height: 160, borderRadius: Radius.md },
  removeScreenshotBtn: {
    marginTop: Spacing.xs, paddingVertical: 8,
    borderRadius: Radius.md, alignItems: 'center',
  },
  removeScreenshotText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.sm },
  screenshotPickBtn: {
    borderWidth: 1.5, borderStyle: 'dashed', borderRadius: Radius.md,
    paddingVertical: 16, alignItems: 'center', marginTop: 4, marginBottom: Spacing.md,
  },
  screenshotPickText: { fontSize: FontSize.sm, fontWeight: '600' },
  submitBtn: {
    paddingVertical: 16, borderRadius: Radius.full, alignItems: 'center', marginTop: Spacing.md,
  },
  submitBtnText: { color: '#FFF', fontSize: FontSize.md, fontWeight: '700' },
});
```

- [ ] **Adım 2: shared index.ts'e FeedbackModal'ı export et**

`packages/shared/index.ts` dosyasında `// Components` bölümüne ekle:
```ts
export { default as FeedbackModal } from './components/FeedbackModal';
```

- [ ] **Adım 3: TypeScript kontrolü**

```bash
cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım && npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Adım 4: Commit**

```bash
git add packages/shared/components/FeedbackModal.tsx packages/shared/index.ts
git commit -m "feat(shared): add FeedbackModal component with screenshot support"
```

---

### Task 3: Baker ana ekranına geri bildirim butonu ekle

**Files:**
- Modify: `apps/baker/app/(baker)/index.tsx`

- [ ] **Adım 1: FeedbackModal import et**

Dosyanın import bölümüne ekle:
```tsx
import { FeedbackModal } from '@pastacim/shared';
```

- [ ] **Adım 2: State ekle**

```tsx
const [showFeedback, setShowFeedback] = useState(false);
```

- [ ] **Adım 3: Header'a feedback butonu ekle**

Mevcut header'ın sağ tarafına (bildirim zili butonu eklendikten sonra, onun yanına):
```tsx
<TouchableOpacity
  onPress={() => setShowFeedback(true)}
  style={{ padding: 4 }}
  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
>
  <Text style={{ fontSize: 20 }}>💬</Text>
</TouchableOpacity>
```

- [ ] **Adım 4: Modal'ı JSX'e ekle**

Return'ün en altına, `</SafeAreaView>` öncesine:
```tsx
<FeedbackModal
  visible={showFeedback}
  onClose={() => setShowFeedback(false)}
  appName="baker"
/>
```

- [ ] **Adım 5: TypeScript kontrolü**

```bash
cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Adım 6: Commit**

```bash
git add apps/baker/app/\(baker\)/index.tsx
git commit -m "feat(baker): add feedback button to home screen header"
```

---

### Task 4: Customer ana ekranına geri bildirim butonu ekle

**Files:**
- Modify: `apps/customer/app/(customer)/index.tsx`

- [ ] **Adım 1: FeedbackModal import et**

```tsx
import { FeedbackModal } from '@pastacim/shared';
```

- [ ] **Adım 2: State ekle**

```tsx
const [showFeedback, setShowFeedback] = useState(false);
```

- [ ] **Adım 3: Header'a feedback butonu ekle**

Aynı pattern — bildirim zili butonunun yanına:
```tsx
<TouchableOpacity
  onPress={() => setShowFeedback(true)}
  style={{ padding: 4 }}
  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
>
  <Text style={{ fontSize: 20 }}>💬</Text>
</TouchableOpacity>
```

- [ ] **Adım 4: Modal'ı JSX'e ekle**

```tsx
<FeedbackModal
  visible={showFeedback}
  onClose={() => setShowFeedback(false)}
  appName="customer"
/>
```

- [ ] **Adım 5: TypeScript kontrolü**

```bash
cd /Users/soneripekci/Documents/Dev_VsCode/Pastacım && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Adım 6: Commit**

```bash
git add apps/customer/app/\(customer\)/index.tsx
git commit -m "feat(customer): add feedback button to home screen header"
```

// Admin bildirim paneli — sadece anzelpatisserie@gmail.com.
// App seçimi + toplu bildirim gönderme + tarihçe + düzenlenebilir şablonlar.
import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, RefreshControl, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { sendPushNotification } from '../lib/notifications';
import { useThemeColors, Spacing, Radius, FontSize } from '../lib/constants';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

const ADMIN_EMAIL = 'anzelpatisserie@gmail.com';

type AppTarget = 'customer' | 'baker';
type ClickTarget = 'campaign' | 'app_update' | 'feedback_request';

type CampaignRow = {
  id: string;
  app_target: string;
  title: string;
  body: string;
  notif_type: string;
  data: Record<string, unknown> | null;
  sent_count: number;
  created_at: string;
};

type TemplateRow = {
  key: string;
  title: string;
  body: string;
  target_role: string | null;
  description: string | null;
  updated_at: string | null;
};

const APP_OPTIONS: { key: AppTarget; label: string }[] = [
  { key: 'customer', label: 'Pastacım (Müşteri)' },
  { key: 'baker', label: 'Pastacım Pro (Pastacı)' },
];

const CLICK_OPTIONS: { key: ClickTarget; label: string }[] = [
  { key: 'campaign', label: 'Yönlendirme yok' },
  { key: 'app_update', label: 'Uygulama güncelleme' },
  { key: 'feedback_request', label: 'Geri bildirim iste' },
];

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function AdminNotificationsScreen() {
  const C = useThemeColors();
  const { profile } = useAuth();
  const isAdmin = profile?.email === ADMIN_EMAIL;

  const [appTarget, setAppTarget] = useState<AppTarget>('customer');

  // Compose
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [clickTarget, setClickTarget] = useState<ClickTarget>('campaign');
  const [updateUrl, setUpdateUrl] = useState('');
  const [isSending, setIsSending] = useState(false);

  // History
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [isLoadingTpl, setIsLoadingTpl] = useState(true);

  const fetchCampaigns = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    const { data, error } = await _db.rpc('get_notification_campaigns');
    if (error) console.error('[AdminNotif] campaigns error:', error.message);
    setCampaigns((data ?? []) as CampaignRow[]);
    setIsRefreshing(false);
  }, []);

  const fetchTemplates = useCallback(async () => {
    setIsLoadingTpl(true);
    const { data, error } = await _db.rpc('get_notification_templates');
    if (error) console.error('[AdminNotif] templates error:', error.message);
    setTemplates((data ?? []) as TemplateRow[]);
    setIsLoadingTpl(false);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetchCampaigns();
    fetchTemplates();
  }, [isAdmin, fetchCampaigns, fetchTemplates]);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Eksik Bilgi', 'Başlık ve içerik boş olamaz.');
      return;
    }
    const data: Record<string, unknown> = {};
    if (clickTarget === 'app_update') {
      if (updateUrl.trim()) data.url = updateUrl.trim();
    }

    setIsSending(true);
    try {
      const { data: res, error } = await _db.rpc('admin_broadcast', {
        p_app: appTarget,
        p_title: title.trim(),
        p_body: body.trim(),
        p_type: clickTarget,
        p_data: data,
      });
      if (error) throw new Error(error.message);
      const result = (res ?? {}) as { sent_count?: number; tokens?: string[]; error?: string };
      if (result.error) throw new Error(result.error);

      // Push gönder (her başarısızlığı yut)
      const tokens = result.tokens ?? [];
      const pushData = { type: clickTarget, ...data };
      for (const group of chunk(tokens, 50)) {
        await Promise.all(
          group.map((token) =>
            sendPushNotification({ token, title: title.trim(), body: body.trim(), data: pushData })
              .catch(() => {}),
          ),
        );
      }

      Alert.alert('✅ Gönderildi', `Bildirim ${result.sent_count ?? tokens.length} kullanıcıya gönderildi.`);
      setTitle('');
      setBody('');
      setUpdateUrl('');
      setClickTarget('campaign');
      fetchCampaigns(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
      Alert.alert('Hata', `Bildirim gönderilemedi: ${msg}`);
    } finally {
      setIsSending(false);
    }
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: C.textSecondary }]}>Yetkisiz erişim</Text>
        </View>
      </SafeAreaView>
    );
  }

  const visibleCampaigns = campaigns.filter((c) => c.app_target === appTarget);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          activeOpacity={0.6}
        >
          <Text style={[styles.back, { color: C.primary }]}>← Geri</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: C.text }]}>Bildirim Gönder</Text>
        <View style={{ width: 60 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchCampaigns(true)}
              tintColor={C.primary}
            />
          }
        >
          {/* App seçimi */}
          <Text style={[styles.sectionTitle, { color: C.text }]}>Hedef Uygulama</Text>
          <View style={styles.optionRow}>
            {APP_OPTIONS.map((a) => {
              const sel = appTarget === a.key;
              return (
                <TouchableOpacity
                  key={a.key}
                  style={[styles.optionChip, {
                    backgroundColor: sel ? C.primary : C.card,
                    borderColor: sel ? C.primary : C.border,
                  }]}
                  onPress={() => setAppTarget(a.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.optionText, { color: sel ? '#FFF' : C.text }]}>{a.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Compose */}
          <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[styles.sectionTitle, { color: C.text }]}>Yeni Bildirim</Text>

            <Text style={[styles.label, { color: C.textSecondary }]}>Başlık</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
              placeholder="Örn: 🎉 Yeni Özellik!"
              placeholderTextColor={C.placeholder}
              value={title}
              onChangeText={setTitle}
              maxLength={100}
            />

            <Text style={[styles.label, { color: C.textSecondary, marginTop: Spacing.sm }]}>İçerik</Text>
            <TextInput
              style={[styles.inputMulti, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
              placeholder="Bildirim metni..."
              placeholderTextColor={C.placeholder}
              value={body}
              onChangeText={setBody}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              maxLength={300}
            />

            <Text style={[styles.label, { color: C.textSecondary, marginTop: Spacing.sm }]}>Tıklayınca</Text>
            <View style={styles.optionRow}>
              {CLICK_OPTIONS.map((o) => {
                const sel = clickTarget === o.key;
                return (
                  <TouchableOpacity
                    key={o.key}
                    style={[styles.optionChipSm, {
                      backgroundColor: sel ? C.primary : C.background,
                      borderColor: sel ? C.primary : C.border,
                    }]}
                    onPress={() => setClickTarget(o.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.optionTextSm, { color: sel ? '#FFF' : C.text }]}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {clickTarget === 'app_update' && (
              <>
                <Text style={[styles.label, { color: C.textSecondary, marginTop: Spacing.sm }]}>
                  Mağaza Linki (App Store / Play Store)
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
                  placeholder="https://apps.apple.com/..."
                  placeholderTextColor={C.placeholder}
                  value={updateUrl}
                  onChangeText={setUpdateUrl}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </>
            )}

            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: C.primary }, isSending && { opacity: 0.7 }]}
              onPress={handleSend}
              disabled={isSending}
              activeOpacity={0.85}
            >
              {isSending ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.sendBtnText}>📢 Gönder</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Tarihçe */}
          <Text style={[styles.sectionTitle, { color: C.text, marginTop: Spacing.lg }]}>
            Gönderim Geçmişi
          </Text>
          {visibleCampaigns.length === 0 ? (
            <Text style={[styles.emptyText, { color: C.textSecondary, marginTop: Spacing.sm }]}>
              Bu uygulama için henüz bildirim gönderilmedi.
            </Text>
          ) : (
            visibleCampaigns.map((c) => (
              <View key={c.id} style={[styles.histCard, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={styles.histTop}>
                  <Text style={[styles.histType, { color: C.primary }]}>{c.notif_type}</Text>
                  <Text style={[styles.histDate, { color: C.placeholder }]}>
                    {new Date(c.created_at).toLocaleString('tr-TR')}
                  </Text>
                </View>
                <Text style={[styles.histTitle, { color: C.text }]}>{c.title}</Text>
                <Text style={[styles.histBody, { color: C.textSecondary }]}>{c.body}</Text>
                <Text style={[styles.histCount, { color: C.textSecondary }]}>
                  👤 {c.sent_count} kullanıcıya gönderildi
                </Text>
              </View>
            ))
          )}

          {/* Şablonlar */}
          <Text style={[styles.sectionTitle, { color: C.text, marginTop: Spacing.lg }]}>
            Otomatik Bildirim Şablonları
          </Text>
          <Text style={[styles.emptyText, { color: C.textSecondary, marginBottom: Spacing.sm }]}>
            Uygulamanın otomatik gönderdiği bildirim metinleri.
          </Text>
          {isLoadingTpl ? (
            <ActivityIndicator color={C.primary} style={{ marginVertical: Spacing.md }} />
          ) : (
            templates.map((t) => (
              <TemplateCard key={t.key} tpl={t} C={C} onSaved={fetchTemplates} />
            ))
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TemplateCard({
  tpl, C, onSaved,
}: {
  tpl: TemplateRow;
  C: ReturnType<typeof useThemeColors>;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(tpl.title);
  const [body, setBody] = useState(tpl.body);
  const [isSaving, setIsSaving] = useState(false);

  const dirty = title !== tpl.title || body !== tpl.body;

  const save = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Eksik Bilgi', 'Başlık ve içerik boş olamaz.');
      return;
    }
    setIsSaving(true);
    try {
      const { data, error } = await _db.rpc('admin_update_notification_template', {
        p_key: tpl.key,
        p_title: title.trim(),
        p_body: body.trim(),
      });
      if (error) throw new Error(error.message);
      const errMsg = (data as { error?: string } | null)?.error;
      if (errMsg) throw new Error(errMsg);
      Alert.alert('✅ Kaydedildi', 'Şablon güncellendi.');
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
      Alert.alert('Hata', `Şablon kaydedilemedi: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={[styles.tplCard, { backgroundColor: C.card, borderColor: C.border }]}>
      <Text style={[styles.tplKey, { color: C.text }]}>{tpl.key}</Text>
      {!!tpl.description && (
        <Text style={[styles.tplDesc, { color: C.textSecondary }]}>{tpl.description}</Text>
      )}
      <Text style={[styles.label, { color: C.textSecondary, marginTop: Spacing.xs }]}>Başlık</Text>
      <TextInput
        style={[styles.input, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
        value={title}
        onChangeText={setTitle}
        maxLength={100}
      />
      <Text style={[styles.label, { color: C.textSecondary, marginTop: Spacing.xs }]}>İçerik</Text>
      <TextInput
        style={[styles.inputMulti, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
        value={body}
        onChangeText={setBody}
        multiline
        numberOfLines={2}
        textAlignVertical="top"
        maxLength={300}
      />
      <TouchableOpacity
        style={[
          styles.tplSaveBtn,
          { backgroundColor: dirty ? C.primary : C.border },
          (isSaving || !dirty) && { opacity: 0.7 },
        ]}
        onPress={save}
        disabled={isSaving || !dirty}
        activeOpacity={0.85}
      >
        {isSaving ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <Text style={styles.tplSaveText}>💾 Kaydet</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1,
  },
  back: { fontSize: FontSize.md, fontWeight: '700' },
  title: { fontSize: FontSize.lg, fontWeight: '800' },
  scroll: { padding: Spacing.lg, gap: Spacing.sm },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', marginBottom: Spacing.xs },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  optionChip: {
    flex: 1, paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderRadius: Radius.md, borderWidth: 1, alignItems: 'center',
  },
  optionText: { fontSize: FontSize.sm, fontWeight: '700', textAlign: 'center' },
  optionChipSm: {
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderRadius: Radius.full, borderWidth: 1,
  },
  optionTextSm: { fontSize: FontSize.xs, fontWeight: '700' },
  card: {
    borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md,
    marginTop: Spacing.md, gap: 4,
  },
  label: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: Spacing.xs },
  input: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: FontSize.md,
  },
  inputMulti: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: FontSize.md, minHeight: 70,
  },
  sendBtn: {
    paddingVertical: 16, borderRadius: Radius.full, alignItems: 'center', marginTop: Spacing.md,
  },
  sendBtnText: { color: '#FFF', fontSize: FontSize.md, fontWeight: '700' },
  histCard: {
    borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 4, marginBottom: Spacing.sm,
  },
  histTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  histType: { fontSize: FontSize.xs, fontWeight: '700' },
  histDate: { fontSize: 11 },
  histTitle: { fontSize: FontSize.sm, fontWeight: '700' },
  histBody: { fontSize: FontSize.sm, lineHeight: 18 },
  histCount: { fontSize: FontSize.xs, marginTop: 2 },
  emptyText: { fontSize: FontSize.sm },
  tplCard: {
    borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 4, marginBottom: Spacing.sm,
  },
  tplKey: { fontSize: FontSize.sm, fontWeight: '800' },
  tplDesc: { fontSize: FontSize.xs, lineHeight: 16 },
  tplSaveBtn: {
    paddingVertical: 12, borderRadius: Radius.full, alignItems: 'center', marginTop: Spacing.sm,
  },
  tplSaveText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '700' },
});

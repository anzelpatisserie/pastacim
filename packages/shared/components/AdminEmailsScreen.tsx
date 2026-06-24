// Admin e-posta yönetim paneli — sadece anzelpatisserie@gmail.com.
// Hedef seçimi + toplu e-posta gönderme + tarihçe + abonelik yönetimi + düzenlenebilir şablonlar.
import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, RefreshControl, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useThemeColors, Spacing, Radius, FontSize } from '../lib/constants';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

const ADMIN_EMAIL = 'anzelpatisserie@gmail.com';

type AppTarget = 'customer' | 'baker';

type CampaignRow = {
  id: string;
  app_target: string;
  subject: string;
  body: string;
  sent_count: number;
  created_at: string;
  created_by: string | null;
};

type TemplateRow = {
  key: string;
  subject: string;
  body: string;
  description: string | null;
  updated_at: string | null;
};

type SubscriberRow = {
  id: string;
  full_name: string | null;
  email: string;
  email_opt_out: boolean;
  is_customer: boolean;
  is_baker: boolean;
};

const APP_OPTIONS: { key: AppTarget; label: string }[] = [
  { key: 'customer', label: 'Pastacım (Müşteri)' },
  { key: 'baker', label: 'Pastacım Pro (Pastacı)' },
];

export default function AdminEmailsScreen() {
  const C = useThemeColors();
  const { profile } = useAuth();
  const isAdmin = profile?.email === ADMIN_EMAIL;

  const [appTarget, setAppTarget] = useState<AppTarget>('customer');

  // Compose
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);

  // History
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Subscribers
  const [subscribers, setSubscribers] = useState<SubscriberRow[]>([]);
  const [isLoadingSubs, setIsLoadingSubs] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Templates
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [isLoadingTpl, setIsLoadingTpl] = useState(true);

  const fetchCampaigns = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    const { data, error } = await _db.rpc('get_email_campaigns');
    if (error) console.error('[AdminEmails] campaigns error:', error.message);
    setCampaigns((data ?? []) as CampaignRow[]);
    setIsRefreshing(false);
  }, []);

  const fetchSubscribers = useCallback(async (app: AppTarget) => {
    setIsLoadingSubs(true);
    const { data, error } = await _db.rpc('get_email_subscribers', { p_app: app });
    if (error) console.error('[AdminEmails] subscribers error:', error.message);
    setSubscribers((data ?? []) as SubscriberRow[]);
    setIsLoadingSubs(false);
  }, []);

  const fetchTemplates = useCallback(async () => {
    setIsLoadingTpl(true);
    const { data, error } = await _db.rpc('get_email_templates');
    if (error) console.error('[AdminEmails] templates error:', error.message);
    setTemplates((data ?? []) as TemplateRow[]);
    setIsLoadingTpl(false);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetchCampaigns();
    fetchTemplates();
  }, [isAdmin, fetchCampaigns, fetchTemplates]);

  // Uygulama hedefi değişince aboneleri yenile
  useEffect(() => {
    if (!isAdmin) return;
    fetchSubscribers(appTarget);
  }, [isAdmin, appTarget, fetchSubscribers]);

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      Alert.alert('Eksik Bilgi', 'Konu ve içerik boş olamaz.');
      return;
    }

    const optedInCount = subscribers.filter((s) => !s.email_opt_out).length;
    Alert.alert(
      'E-posta Gönder',
      `${optedInCount} kullanıcıya e-posta gönderilecek, emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Gönder',
          onPress: async () => {
            setIsSending(true);
            try {
              const { data: res, error } = await supabase.functions.invoke('admin-broadcast-email', {
                body: {
                  app: appTarget,
                  subject: subject.trim(),
                  body: body.trim(),
                },
              });
              if (error) throw new Error(error.message);
              const result = (res ?? {}) as { sent_count?: number; total?: number; error?: string };
              if (result.error) throw new Error(result.error);

              Alert.alert(
                '✅ Gönderildi',
                `${result.sent_count ?? 0} / ${result.total ?? subscribers.length} kullanıcıya e-posta gönderildi.`,
              );
              setSubject('');
              setBody('');
              fetchCampaigns(true);
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
              Alert.alert('Hata', `E-posta gönderilemedi: ${msg}`);
            } finally {
              setIsSending(false);
            }
          },
        },
      ],
    );
  };

  const handleToggleOptOut = async (userId: string, currentOptOut: boolean) => {
    setTogglingId(userId);
    try {
      const { data, error } = await _db.rpc('admin_set_email_opt_out', {
        p_user_id: userId,
        p_opt_out: !currentOptOut,
      });
      if (error) throw new Error(error.message);
      const errMsg = (data as { error?: string } | null)?.error;
      if (errMsg) throw new Error(errMsg);
      // Yerel state'i güncelle
      setSubscribers((prev) =>
        prev.map((s) => (s.id === userId ? { ...s, email_opt_out: !currentOptOut } : s)),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
      Alert.alert('Hata', `Güncelleme yapılamadı: ${msg}`);
    } finally {
      setTogglingId(null);
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
  const optedOutCount = subscribers.filter((s) => s.email_opt_out).length;
  const totalCount = subscribers.length;

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
        <Text style={[styles.title, { color: C.text }]}>Toplu E-posta</Text>
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
          {/* Hedef Uygulama */}
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

          {/* Toplu E-posta Gönder */}
          <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[styles.sectionTitle, { color: C.text }]}>Toplu E-posta Gönder</Text>

            <Text style={[styles.label, { color: C.textSecondary }]}>Konu</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
              placeholder="E-posta konusu"
              placeholderTextColor={C.placeholder}
              value={subject}
              onChangeText={setSubject}
              maxLength={200}
            />

            <Text style={[styles.label, { color: C.textSecondary, marginTop: Spacing.sm }]}>İçerik (HTML)</Text>
            <TextInput
              style={[styles.inputMulti, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
              placeholder="<p>Merhaba,</p><p>Haberlerimiz...</p>"
              placeholderTextColor={C.placeholder}
              value={body}
              onChangeText={setBody}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />

            <Text style={[styles.noteText, { color: C.textSecondary }]}>
              Toplu e-postalar yalnız aboneliği açık (opt-in) kullanıcılara gider; her maile otomatik "abonelikten çık" linki eklenir.
            </Text>

            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: C.primary }, isSending && { opacity: 0.7 }]}
              onPress={handleSend}
              disabled={isSending}
              activeOpacity={0.85}
            >
              {isSending ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.sendBtnText}>📧 Gönder</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Tarihçe */}
          <Text style={[styles.sectionTitle, { color: C.text, marginTop: Spacing.lg }]}>
            Gönderim Geçmişi
          </Text>
          {visibleCampaigns.length === 0 ? (
            <Text style={[styles.emptyText, { color: C.textSecondary, marginTop: Spacing.sm }]}>
              Bu uygulama için henüz toplu e-posta gönderilmedi.
            </Text>
          ) : (
            visibleCampaigns.map((c) => (
              <View key={c.id} style={[styles.histCard, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={styles.histTop}>
                  <Text style={[styles.histSubject, { color: C.text }]}>{c.subject}</Text>
                  <Text style={[styles.histDate, { color: C.placeholder }]}>
                    {new Date(c.created_at).toLocaleString('tr-TR')}
                  </Text>
                </View>
                <Text style={[styles.histBody, { color: C.textSecondary }]} numberOfLines={2}>
                  {c.body.replace(/<[^>]*>/g, ' ').trim()}
                </Text>
                <Text style={[styles.histCount, { color: C.textSecondary }]}>
                  📨 {c.sent_count} kullanıcıya gönderildi
                </Text>
              </View>
            ))
          )}

          {/* Abonelik (Opt-out) Yönetimi */}
          <Text style={[styles.sectionTitle, { color: C.text, marginTop: Spacing.lg }]}>
            Abonelik (Opt-out) Yönetimi
          </Text>
          {isLoadingSubs ? (
            <ActivityIndicator color={C.primary} style={{ marginVertical: Spacing.md }} />
          ) : (
            <>
              <View style={[styles.subsCountCard, { backgroundColor: C.card, borderColor: C.border }]}>
                <Text style={[styles.subsCountText, { color: C.text }]}>
                  Abonelikten çıkanlar: {optedOutCount} / Toplam: {totalCount}
                </Text>
              </View>
              {subscribers.length === 0 ? (
                <Text style={[styles.emptyText, { color: C.textSecondary, marginTop: Spacing.sm }]}>
                  Bu uygulama için kayıtlı kullanıcı bulunamadı.
                </Text>
              ) : (
                subscribers.map((s) => (
                  <View
                    key={s.id}
                    style={[styles.subRow, { backgroundColor: C.card, borderColor: C.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.subName, { color: C.text }]}>{s.full_name ?? '—'}</Text>
                      <Text style={[styles.subEmail, { color: C.textSecondary }]}>{s.email}</Text>
                    </View>
                    {togglingId === s.id ? (
                      <ActivityIndicator size="small" color={C.primary} />
                    ) : (
                      <Switch
                        value={s.email_opt_out}
                        onValueChange={() => handleToggleOptOut(s.id, s.email_opt_out)}
                        trackColor={{ false: C.border, true: C.primary }}
                        thumbColor="#FFF"
                      />
                    )}
                    <Text style={[styles.subOptLabel, { color: s.email_opt_out ? C.primary : C.textSecondary }]}>
                      {s.email_opt_out ? 'Çıktı' : 'Abone'}
                    </Text>
                  </View>
                ))
              )}
            </>
          )}

          {/* Şablonlar */}
          <Text style={[styles.sectionTitle, { color: C.text, marginTop: Spacing.lg }]}>
            E-posta Şablonları
          </Text>
          <Text style={[styles.emptyText, { color: C.textSecondary, marginBottom: Spacing.sm }]}>
            Uygulamanın otomatik gönderdiği e-posta şablonları. {'{{title}}'} ve {'{{name}}'} yer tutucuları kullanılabilir.
          </Text>
          {isLoadingTpl ? (
            <ActivityIndicator color={C.primary} style={{ marginVertical: Spacing.md }} />
          ) : (
            templates.map((t) => (
              <EmailTemplateCard key={t.key} tpl={t} C={C} onSaved={fetchTemplates} />
            ))
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function EmailTemplateCard({
  tpl, C, onSaved,
}: {
  tpl: TemplateRow;
  C: ReturnType<typeof useThemeColors>;
  onSaved: () => void;
}) {
  const [subject, setSubject] = useState(tpl.subject);
  const [body, setBody] = useState(tpl.body);
  const [isSaving, setIsSaving] = useState(false);

  const dirty = subject !== tpl.subject || body !== tpl.body;

  const save = async () => {
    if (!subject.trim() || !body.trim()) {
      Alert.alert('Eksik Bilgi', 'Konu ve içerik boş olamaz.');
      return;
    }
    setIsSaving(true);
    try {
      const { data, error } = await _db.rpc('admin_update_email_template', {
        p_key: tpl.key,
        p_subject: subject.trim(),
        p_body: body.trim(),
      });
      if (error) throw new Error(error.message);
      const errMsg = (data as { error?: string } | null)?.error;
      if (errMsg) throw new Error(errMsg);
      Alert.alert('✅ Kaydedildi', 'E-posta şablonu güncellendi.');
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
      <Text style={[styles.label, { color: C.textSecondary, marginTop: Spacing.xs }]}>Konu</Text>
      <TextInput
        style={[styles.input, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
        value={subject}
        onChangeText={setSubject}
        maxLength={200}
      />
      <Text style={[styles.label, { color: C.textSecondary, marginTop: Spacing.xs }]}>İçerik (HTML)</Text>
      <TextInput
        style={[styles.inputMulti, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
        value={body}
        onChangeText={setBody}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
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
    fontSize: FontSize.md, minHeight: 100,
  },
  noteText: { fontSize: FontSize.xs, lineHeight: 16, marginTop: Spacing.xs },
  sendBtn: {
    paddingVertical: 16, borderRadius: Radius.full, alignItems: 'center', marginTop: Spacing.md,
  },
  sendBtnText: { color: '#FFF', fontSize: FontSize.md, fontWeight: '700' },
  histCard: {
    borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 4, marginBottom: Spacing.sm,
  },
  histTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.sm },
  histSubject: { fontSize: FontSize.sm, fontWeight: '700', flex: 1 },
  histDate: { fontSize: 11, flexShrink: 0 },
  histBody: { fontSize: FontSize.sm, lineHeight: 18 },
  histCount: { fontSize: FontSize.xs, marginTop: 2 },
  subsCountCard: {
    borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm,
  },
  subsCountText: { fontSize: FontSize.sm, fontWeight: '700' },
  subRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.xs,
  },
  subName: { fontSize: FontSize.sm, fontWeight: '600' },
  subEmail: { fontSize: FontSize.xs, marginTop: 2 },
  subOptLabel: { fontSize: FontSize.xs, fontWeight: '700', minWidth: 36, textAlign: 'center' },
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

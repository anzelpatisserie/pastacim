// Admin şikayet paneli — sadece anzelpatisserie@gmail.com.
// Şikayetleri listeler, mesaj/sipariş kanıtını gösterir, şikayet edilen
// kullanıcıyı engelle/engeli kaldır + şikayeti çözüldü işaretle.
import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, Modal, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useThemeColors, Spacing, Radius, FontSize } from '../lib/constants';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;
const ADMIN_EMAIL = 'anzelpatisserie@gmail.com';

type ReportRow = {
  id: string;
  created_at: string;
  reason: string;
  details: string | null;
  image_url: string | null;
  target_type: string;
  target_id: string | null;
  app_name: string;
  status: string;
  reporter_id: string;
  reporter_name: string | null;
  reporter_email: string | null;
  reported_user_id: string | null;
  reported_user_name: string | null;
  reported_user_email: string | null;
  reported_banned: boolean;
};

type EvidenceMsg = { id: string; sender_id: string; content: string | null; created_at: string };

const TARGET_LABELS: Record<string, string> = {
  order: '📦 Sipariş', user: '👤 Kullanıcı', shop: '🏪 Dükkan', message: '💬 Mesaj',
};

const fmt = (d: string) => new Date(d).toLocaleString('tr-TR');

export default function AdminReportsScreen() {
  const C = useThemeColors();
  const { profile } = useAuth();
  const isAdmin = profile?.email === ADMIN_EMAIL;

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Resim tam ekran modalı
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);

  // Kanıt (mesaj) modalı
  const [evidenceFor, setEvidenceFor] = useState<ReportRow | null>(null);
  const [evidence, setEvidence] = useState<EvidenceMsg[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);

  const fetchReports = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    const { data, error } = await _db.rpc('get_reports');
    if (error) console.error('[AdminReports]', error.message);
    setReports((data ?? []) as ReportRow[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { if (isAdmin) fetchReports(); }, [isAdmin, fetchReports]);

  const openEvidence = async (r: ReportRow) => {
    if (!r.reported_user_id) return;
    setEvidenceFor(r);
    setEvidence([]);
    setEvidenceLoading(true);
    const { data } = await _db.rpc('admin_get_report_messages', {
      p_user_a: r.reporter_id, p_user_b: r.reported_user_id,
    });
    setEvidence((data ?? []) as EvidenceMsg[]);
    setEvidenceLoading(false);
  };

  const toggleBan = (r: ReportRow) => {
    if (!r.reported_user_id) return;
    const ban = !r.reported_banned;
    Alert.alert(
      ban ? 'Kullanıcıyı Engelle' : 'Engeli Kaldır',
      ban
        ? `${r.reported_user_name ?? r.reported_user_email ?? 'Kullanıcı'} engellensin mi? Giriş yapamaz.`
        : `${r.reported_user_name ?? r.reported_user_email ?? 'Kullanıcı'} engeli kalksın mı?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: ban ? 'Engelle' : 'Engeli Kaldır',
          style: ban ? 'destructive' : 'default',
          onPress: async () => {
            setBusyId(r.id);
            const { data, error } = await _db.rpc('admin_ban_user', { p_user_id: r.reported_user_id, p_ban: ban });
            setBusyId(null);
            const err = error?.message ?? (data as { error?: string } | null)?.error;
            if (err) { Alert.alert('Hata', err); return; }
            fetchReports();
          },
        },
      ],
    );
  };

  const setStatus = async (r: ReportRow, status: string) => {
    setBusyId(r.id);
    await _db.rpc('admin_set_report_status', { p_id: r.id, p_status: status });
    setBusyId(null);
    fetchReports();
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
        <View style={styles.centered}>
          <Text style={{ color: C.textSecondary }}>Yetkisiz erişim</Text>
        </View>
      </SafeAreaView>
    );
  }

  const visible = reports.filter((r) =>
    filter === 'all' ? true : filter === 'open' ? r.status !== 'resolved' : r.status === 'resolved');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.back, { color: C.primary }]}>← Geri</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: C.text }]}>🚩 Şikayetler</Text>
        <View style={{ width: 56 }} />
      </View>

      <View style={styles.filterRow}>
        {(['open', 'resolved', 'all'] as const).map((f) => {
          const sel = filter === f;
          const label = f === 'open' ? 'Açık' : f === 'resolved' ? 'Çözüldü' : 'Tümü';
          return (
            <TouchableOpacity key={f}
              style={[styles.filterChip, { backgroundColor: sel ? C.primary : C.card, borderColor: sel ? C.primary : C.border }]}
              onPress={() => setFilter(f)} activeOpacity={0.7}>
              <Text style={[styles.filterText, { color: sel ? '#FFF' : C.text }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={C.primary} /></View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchReports(true)} tintColor={C.primary} />}
          ListEmptyComponent={<Text style={[styles.empty, { color: C.textSecondary }]}>Şikayet yok.</Text>}
          renderItem={({ item: r }) => (
            <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={styles.cardTop}>
                <Text style={[styles.targetLabel, { color: C.text }]}>{TARGET_LABELS[r.target_type] ?? r.target_type}</Text>
                <Text style={[styles.date, { color: C.placeholder }]}>{fmt(r.created_at)}</Text>
              </View>
              <Text style={[styles.reason, { color: C.primary }]}>{r.reason}</Text>
              {r.details ? <Text style={[styles.details, { color: C.textSecondary }]}>{r.details}</Text> : null}
              {r.image_url ? (
                <TouchableOpacity onPress={() => setImageModalUrl(r.image_url)} activeOpacity={0.8} style={styles.imgThumbWrap}>
                  <Image source={{ uri: r.image_url }} style={styles.imgThumb} resizeMode="cover" />
                  <Text style={[styles.imgLabel, { color: C.textSecondary }]}>📎 Kanıt resmi · büyütmek için dokun</Text>
                </TouchableOpacity>
              ) : null}

              <Text style={[styles.meta, { color: C.textSecondary }]}>
                Şikayet eden: {r.reporter_name ?? '—'} ({r.reporter_email ?? '—'})
              </Text>
              {r.reported_user_id ? (
                <Text style={[styles.meta, { color: C.textSecondary }]}>
                  Şikayet edilen: {r.reported_user_name ?? '—'} ({r.reported_user_email ?? '—'})
                  {r.reported_banned ? '  ⛔ Engelli' : ''}
                </Text>
              ) : (
                <Text style={[styles.meta, { color: C.textSecondary }]}>Hedef: {r.target_type} · {r.target_id ?? '—'}</Text>
              )}

              <View style={styles.actions}>
                {r.target_type === 'message' && r.reported_user_id ? (
                  <TouchableOpacity style={[styles.btn, { borderColor: C.border }]} onPress={() => openEvidence(r)}>
                    <Text style={[styles.btnText, { color: C.text }]}>💬 Mesajları Gör</Text>
                  </TouchableOpacity>
                ) : null}

                {r.reported_user_id ? (
                  <TouchableOpacity
                    style={[styles.btn, { borderColor: r.reported_banned ? C.success : C.error }]}
                    disabled={busyId === r.id}
                    onPress={() => toggleBan(r)}>
                    <Text style={[styles.btnText, { color: r.reported_banned ? C.success : C.error }]}>
                      {r.reported_banned ? '↺ Engeli Kaldır' : '⛔ Engelle'}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  style={[styles.btn, { borderColor: C.border }]}
                  disabled={busyId === r.id}
                  onPress={() => setStatus(r, r.status === 'resolved' ? 'open' : 'resolved')}>
                  <Text style={[styles.btnText, { color: C.textSecondary }]}>
                    {r.status === 'resolved' ? '↺ Aç' : '✓ Çözüldü'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Tam ekran resim modalı */}
      <Modal visible={!!imageModalUrl} transparent animationType="fade" onRequestClose={() => setImageModalUrl(null)}>
        <TouchableOpacity
          style={styles.imgFullOverlay}
          activeOpacity={1}
          onPress={() => setImageModalUrl(null)}>
          {imageModalUrl ? (
            <Image source={{ uri: imageModalUrl }} style={styles.imgFull} resizeMode="contain" />
          ) : null}
          <Text style={styles.imgFullClose}>✕ Kapat</Text>
        </TouchableOpacity>
      </Modal>

      {/* Kanıt (mesaj) modalı */}
      <Modal visible={!!evidenceFor} transparent animationType="slide" onRequestClose={() => setEvidenceFor(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: C.background }]}>
            <View style={[styles.header, { borderBottomColor: C.border }]}>
              <Text style={[styles.title, { color: C.text }]}>Mesaj Kanıtı</Text>
              <TouchableOpacity onPress={() => setEvidenceFor(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={[styles.back, { color: C.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            {evidenceLoading ? (
              <View style={styles.centered}><ActivityIndicator color={C.primary} /></View>
            ) : (
              <ScrollView contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}>
                {evidence.length === 0 ? (
                  <Text style={[styles.empty, { color: C.textSecondary }]}>Mesaj bulunamadı.</Text>
                ) : evidence.map((m) => {
                  const fromReported = m.sender_id === evidenceFor?.reported_user_id;
                  return (
                    <View key={m.id} style={[styles.msgBubble, {
                      backgroundColor: fromReported ? C.error + '14' : C.card,
                      borderColor: fromReported ? C.error + '44' : C.border,
                    }]}>
                      <Text style={[styles.msgWho, { color: fromReported ? C.error : C.textSecondary }]}>
                        {fromReported ? 'Şikayet edilen' : 'Şikayet eden'} · {fmt(m.created_at)}
                      </Text>
                      <Text style={{ color: C.text }}>{m.content ?? '—'}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1,
  },
  back: { fontSize: FontSize.md, fontWeight: '600' },
  title: { fontSize: FontSize.lg, fontWeight: '800' },
  filterRow: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md },
  filterChip: { borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  filterText: { fontSize: FontSize.sm, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, gap: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  targetLabel: { fontSize: FontSize.sm, fontWeight: '700' },
  date: { fontSize: FontSize.xs },
  reason: { fontSize: FontSize.md, fontWeight: '700', marginTop: 2 },
  details: { fontSize: FontSize.sm, marginTop: 2 },
  meta: { fontSize: FontSize.sm, marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  btn: { borderWidth: 1.5, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  btnText: { fontSize: FontSize.sm, fontWeight: '700' },
  empty: { textAlign: 'center', padding: Spacing.xl },
  modalOverlay: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  msgBubble: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.sm },
  msgWho: { fontSize: FontSize.xs, fontWeight: '600', marginBottom: 2 },
  imgThumbWrap: { marginTop: Spacing.sm, gap: 4 },
  imgThumb: { width: '100%', height: 160, borderRadius: Radius.sm },
  imgLabel: { fontSize: FontSize.xs },
  imgFullOverlay: { flex: 1, backgroundColor: '#000D', justifyContent: 'center', alignItems: 'center' },
  imgFull: { width: '100%', height: '80%' },
  imgFullClose: { color: '#FFF', marginTop: 16, fontSize: FontSize.md, fontWeight: '700' },
});

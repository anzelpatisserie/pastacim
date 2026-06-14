import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator,
  Image, Modal, Pressable, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useThemeColors, Spacing, Radius, FontSize } from '../lib/constants';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

type FeedbackRow = {
  id: string;
  app_name: string;
  message: string;
  screenshot_url: string | null;
  screenshot_signed_url?: string | null;
  created_at: string;
  user_id: string | null;
  user: { full_name: string | null; email: string | null } | null;
};

type AppFilter = 'all' | 'customer' | 'baker';

export default function FeedbacksAdminScreen() {
  const C = useThemeColors();
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [filter, setFilter] = useState<AppFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);

  const fetchData = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);

    let query = _db
      .from('feedbacks')
      .select('id, app_name, message, screenshot_url, created_at, user_id')
      .order('created_at', { ascending: false })
      .limit(100);

    if (filter !== 'all') query = query.eq('app_name', filter);

    const { data: fbs, error } = await query;
    if (error) {
      console.error('[FeedbacksAdmin] fetch error:', error.message, error);
      setItems([]);
    } else {
      const rows = (fbs ?? []) as Omit<FeedbackRow, 'user'>[];
      const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean) as string[]));
      let usersMap = new Map<string, { full_name: string | null; email: string | null }>();
      if (userIds.length > 0) {
        const { data: users, error: uErr } = await _db
          .from('users')
          .select('id, full_name, email')
          .in('id', userIds);
        if (uErr) console.error('[FeedbacksAdmin] users fetch error:', uErr.message);
        usersMap = new Map(
          (users ?? []).map((u: { id: string; full_name: string | null; email: string | null }) => [
            u.id,
            { full_name: u.full_name, email: u.email },
          ]),
        );
      }
      const merged: FeedbackRow[] = rows.map((r) => ({
        ...r,
        user: r.user_id ? usersMap.get(r.user_id) ?? null : null,
      }));

      // Private bucket için signed URL oluştur
      const withSignedUrls = await Promise.all(
        merged.map(async (r) => {
          if (!r.screenshot_url) return r;
          // URL'den storage path'i çıkar: .../feedbacks/{path}
          const match = r.screenshot_url.match(/\/feedbacks\/(.+)$/);
          if (!match) return r;
          const { data } = await supabase.storage
            .from('feedbacks')
            .createSignedUrl(match[1], 3600);
          return { ...r, screenshot_signed_url: data?.signedUrl ?? null };
        }),
      );
      setItems(withSignedUrls);
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, [filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
        <Text style={[styles.title, { color: C.text }]}>Geri Bildirimler</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Filtre chip'leri */}
      <View style={styles.filterRow}>
        {([
          { key: 'all', label: 'Tümü' },
          { key: 'customer', label: '🎂 Müşteri' },
          { key: 'baker', label: '👨‍🍳 Pastacı' },
        ] as { key: AppFilter; label: string }[]).map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[
              styles.filterChip,
              {
                backgroundColor: filter === f.key ? C.primary : C.card,
                borderColor: filter === f.key ? C.primary : C.border,
              },
            ]}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: filter === f.key ? '#FFF' : C.text },
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <FeedbackCard
              item={item}
              C={C}
              onPhotoTap={(uri) => setFullscreenPhoto(uri)}
              onDelete={() => {
                Alert.alert('Geri Bildirimi Sil', 'Bu geri bildirim silinsin mi?', [
                  { text: 'Vazgeç', style: 'cancel' },
                  { text: 'Sil', style: 'destructive', onPress: async () => {
                    const { error } = await _db.rpc('admin_delete_feedback', { p_feedback_id: item.id });
                    if (error) { Alert.alert('Hata', error.message); return; }
                    setItems((prev) => prev.filter((x) => x.id !== item.id));
                  } },
                ]);
              }}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchData(true)}
              tintColor={C.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📭</Text>
              <Text style={[styles.emptyText, { color: C.textSecondary }]}>
                Henüz geri bildirim yok
              </Text>
            </View>
          }
        />
      )}

      <Modal
        visible={!!fullscreenPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenPhoto(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setFullscreenPhoto(null)}>
          {fullscreenPhoto && (
            <Image source={{ uri: fullscreenPhoto }} style={styles.modalImage} resizeMode="contain" />
          )}
          <TouchableOpacity style={styles.modalClose} onPress={() => setFullscreenPhoto(null)}>
            <Text style={styles.modalCloseText}>✕</Text>
          </TouchableOpacity>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function FeedbackCard({
  item, C, onPhotoTap, onDelete,
}: {
  item: FeedbackRow;
  C: ReturnType<typeof useThemeColors>;
  onPhotoTap: (uri: string) => void;
  onDelete: () => void;
}) {
  const date = new Date(item.created_at);
  const dateStr = date.toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  const appBadge = item.app_name === 'customer' ? '🎂 Müşteri' : '👨‍🍳 Pastacı';
  const userName = item.user?.full_name ?? item.user?.email ?? 'Anonim';

  return (
    <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
      <View style={styles.cardTop}>
        <View style={[styles.appBadge, { backgroundColor: C.primary + '15' }]}>
          <Text style={[styles.appBadgeText, { color: C.primary }]}>{appBadge}</Text>
        </View>
        <Text style={[styles.cardDate, { color: C.placeholder }]}>{dateStr}</Text>
      </View>
      <Text style={[styles.userName, { color: C.text }]}>{userName}</Text>
      {item.user?.email && item.user?.email !== item.user?.full_name && (
        <Text style={[styles.userEmail, { color: C.textSecondary }]}>{item.user.email}</Text>
      )}
      <Text style={[styles.message, { color: C.text }]}>{item.message}</Text>
      {item.screenshot_signed_url && (
        <TouchableOpacity
          onPress={() => onPhotoTap(item.screenshot_signed_url!)}
          activeOpacity={0.85}
          style={styles.screenshotBtn}
        >
          <Image
            source={{ uri: item.screenshot_signed_url }}
            style={styles.screenshot}
            resizeMode="cover"
          />
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onDelete} style={[styles.deleteFb, { borderColor: '#EF444466' }]} activeOpacity={0.8}>
        <Text style={styles.deleteFbText}>🗑 Geri Bildirimi Sil</Text>
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
  filterRow: {
    flexDirection: 'row', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderRadius: Radius.full, borderWidth: 1,
  },
  filterChipText: { fontSize: FontSize.sm, fontWeight: '700' },
  list: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 60 },
  card: {
    borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md,
    gap: 6,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  appBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full,
  },
  appBadgeText: { fontSize: FontSize.xs, fontWeight: '700' },
  cardDate: { fontSize: 11 },
  userName: { fontSize: FontSize.sm, fontWeight: '700' },
  userEmail: { fontSize: 11 },
  message: { fontSize: FontSize.sm, lineHeight: 19, marginTop: 4 },
  screenshotBtn: { marginTop: Spacing.sm },
  screenshot: { width: '100%', height: 160, borderRadius: Radius.md },
  empty: { padding: Spacing.xxl, alignItems: 'center', gap: Spacing.md },
  emptyEmoji: { fontSize: 56 },
  emptyText: { fontSize: FontSize.md },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalImage: { width: '100%', height: '100%' },
  modalClose: {
    position: 'absolute', top: 60, right: 24,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalCloseText: { color: '#FFF', fontSize: 22, fontWeight: '700' },
  deleteFb: { marginTop: Spacing.sm, paddingVertical: 8, borderRadius: Radius.sm, borderWidth: 1, alignItems: 'center' },
  deleteFbText: { fontSize: FontSize.xs, fontWeight: '700', color: '#EF4444' },
});

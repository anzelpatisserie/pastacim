import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { navigateFromNotification, type NotificationRole } from '../lib/notifications';
import { useThemeColors, Spacing, Radius, FontSize } from '../lib/constants';
import type { Database } from '../types/database.types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

type NotificationRow = Database['public']['Tables']['notifications']['Row'];

const TYPE_META: Record<string, { emoji: string; color: string }> = {
  new_order:        { emoji: '📋', color: '#F5A623' },
  new_offer:        { emoji: '🎉', color: '#48BB78' },
  offer_accepted:   { emoji: '✅', color: '#4299E1' },
  offer_rejected:   { emoji: '❌', color: '#FC8181' },
  offer_withdrawn:  { emoji: '↩️', color: '#F5A623' },
  new_message:      { emoji: '💬', color: '#9F7AEA' },
  order_cancelled:  { emoji: '🗑️', color: '#FC8181' },
  order_in_progress: { emoji: '👨‍🍳', color: '#9F7AEA' },
  order_ready:       { emoji: '📦', color: '#4299E1' },
  order_completed:   { emoji: '🎂', color: '#68D391' },
  campaign:          { emoji: '📣', color: '#D4526E' },
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Az önce';
  if (mins < 60) return `${mins} dk önce`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} sa önce`;
  return `${Math.floor(hrs / 24)} gün önce`;
}

function NotifCard({
  item, C, role, onRead,
}: {
  item: NotificationRow;
  C: ReturnType<typeof useThemeColors>;
  role: NotificationRole;
  onRead: (id: string) => void;
}) {
  const meta = TYPE_META[item.type] ?? { emoji: '🔔', color: '#A0AEC0' };

  const handlePress = () => {
    // Önce okundu işaretle (okunmamışsa)
    if (!item.is_read) onRead(item.id);
    // Sonra navigate et
    const data = (item.data ?? {}) as Record<string, unknown>;
    navigateFromNotification(item.type, data, role);
  };

  return (
    <View style={[
      styles.cardWrapper,
      {
        backgroundColor: item.is_read ? C.card : C.primary + '0D',
        borderColor:     item.is_read ? C.border : C.primary + '33',
      },
    ]}>
      <TouchableOpacity
        style={styles.cardContent}
        onPress={handlePress}
        activeOpacity={0.75}
      >
        <View style={[styles.iconCircle, { backgroundColor: meta.color + '22' }]}>
          <Text style={styles.iconEmoji}>{meta.emoji}</Text>
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.title, { color: C.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          {!!item.body && (
            <Text style={[styles.body, { color: C.textSecondary }]} numberOfLines={2}>
              {item.body}
            </Text>
          )}
          <Text style={[styles.time, { color: C.placeholder }]}>{formatTimeAgo(item.created_at ?? '')}</Text>
        </View>

        {!item.is_read && (
          <View style={[styles.unreadDot, { backgroundColor: C.primary }]} />
        )}
      </TouchableOpacity>

    </View>
  );
}

export default function NotificationsScreen({ appRole }: { appRole?: NotificationRole } = {}) {
  const C = useThemeColors();
  const { user, isBaker } = useAuth();
  // Rol, içinde bulunduğumuz APP'ten gelmeli (appRole). Dual-rol hesapta
  // isBaker her iki app'te de true olabildiği için bu fallback yanlış route'a
  // (çapraz-app) yol açıp hata veriyordu.
  const notifRole: NotificationRole = appRole ?? (isBaker ? 'baker' : 'customer');

  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetch = useCallback(async (refresh = false) => {
    if (!user?.id) { setIsLoading(false); return; }
    if (refresh) setIsRefreshing(true);
    else if (!refresh) setIsLoading(true);

    const { data } = await _db
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    setNotifications((data ?? []) as NotificationRow[]);
    setIsLoading(false);
    setIsRefreshing(false);
  }, [user?.id]);

  // Her tab odaklanışında yenile
  useFocusEffect(useCallback(() => { fetch(); }, [fetch]));

  const markRead = useCallback(async (id: string) => {
    await _db.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  }, []);

  const markAllRead = useCallback(async () => {
    if (!user?.id) return;
    await _db.from('notifications').update({ is_read: true })
      .eq('user_id', user.id).eq('is_read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, [user?.id]);

  const deleteAll = useCallback(async () => {
    if (!user?.id) return;
    await _db.from('notifications').delete().eq('user_id', user.id);
    setNotifications([]);
  }, [user?.id]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <Text style={[styles.headerTitle, { color: C.text }]}>Bildirimler</Text>
        <View style={styles.headerActions}>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={[styles.markAllBtn, { backgroundColor: C.primary + '18', borderColor: C.primary + '44' }]}
              onPress={markAllRead}
            >
              <Text style={[styles.markAllText, { color: C.primary }]}>Tümünü Oku</Text>
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity
              style={[styles.markAllBtn, { backgroundColor: C.error + '18', borderColor: C.error + '44' }]}
              onPress={deleteAll}
            >
              <Text style={[styles.markAllText, { color: C.error }]}>Tümünü Sil</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <NotifCard item={item} C={C} role={notifRole} onRead={markRead} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetch(true)}
              tintColor={C.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🔔</Text>
              <Text style={[styles.emptyTitle, { color: C.text }]}>Bildirim yok</Text>
              <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>
                Yeni teklif, mesaj veya sipariş güncellemeleri burada görünür
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  centered:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1,
  },
  headerTitle:  { fontSize: FontSize.xl, fontWeight: '800' },
  headerActions: { flexDirection: 'row', gap: Spacing.xs },
  markAllBtn:   { paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1 },
  markAllText:  { fontSize: FontSize.xs, fontWeight: '700' },
  list:         { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 80 },
  cardWrapper: {
    borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden',
  },
  cardContent: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    padding: Spacing.md,
  },
  iconCircle:   { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iconEmoji:    { fontSize: 22 },
  title:        { fontSize: FontSize.sm, fontWeight: '700' },
  body:         { fontSize: FontSize.xs, lineHeight: 16 },
  time:         { fontSize: 11 },
  unreadDot:    { width: 8, height: 8, borderRadius: 4, marginTop: 4, flexShrink: 0 },
  empty:        { alignItems: 'center', justifyContent: 'center', paddingTop: 100, gap: Spacing.md },
  emptyEmoji:   { fontSize: 56 },
  emptyTitle:   { fontSize: FontSize.lg, fontWeight: '700' },
  emptySubtitle:{ fontSize: FontSize.md, textAlign: 'center', paddingHorizontal: Spacing.xl },
});

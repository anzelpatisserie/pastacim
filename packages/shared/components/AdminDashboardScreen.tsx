import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useThemeColors, Spacing, Radius, FontSize } from '../lib/constants';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_customer: boolean;
  is_baker: boolean;
  wallet_balance: number | null;
  created_at: string;
  order_count: number;
  completed_order_count: number;
  offer_count: number;
  accepted_offer_count: number;
  shop_name: string | null;
  shop_address: string | null;
  shop_lat: number | null;
  shop_lng: number | null;
  shop_rating: number | null;
  shop_review_count: number | null;
  shop_is_active: boolean | null;
};

type Stats = {
  total_users: number;
  total_bakers: number;
  total_customers: number;
  total_orders: number;
  completed_orders: number;
  pending_orders: number;
  total_offers: number;
  accepted_offers: number;
  total_revenue: number;
};

type UserFilter = 'all' | 'customer' | 'baker';

export default function AdminDashboardScreen() {
  const C = useThemeColors();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<UserFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);

    const [usersRes, statsRes] = await Promise.all([
      _db.rpc('admin_get_users_summary'),
      _db.rpc('admin_get_stats'),
    ]);

    if (!usersRes.error) setUsers(usersRes.data ?? []);
    if (!statsRes.error && statsRes.data?.[0]) setStats(statsRes.data[0]);

    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = users.filter((u) => {
    if (filter === 'customer') return u.is_customer && !u.is_baker;
    if (filter === 'baker') return u.is_baker;
    return true;
  });

  const openMaps = (lat: number, lng: number, name: string) => {
    Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(name)}&ll=${lat},${lng}`);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        >
          <Text style={[styles.back, { color: C.primary }]}>← Geri</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: C.text }]}>Admin Paneli</Text>
        <View style={{ width: 60 }} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={() => fetchData(true)} tintColor={C.primary} />
          }
          ListHeaderComponent={
            <>
              {/* Stats */}
              {stats && (
                <View style={styles.statsGrid}>
                  <StatCard label="Toplam Kullanıcı" value={stats.total_users} color={C.primary} C={C} />
                  <StatCard label="Pastacı" value={stats.total_bakers} color="#F59E0B" C={C} />
                  <StatCard label="Toplam Sipariş" value={stats.total_orders} color="#10B981" C={C} />
                  <StatCard label="Tamamlanan" value={stats.completed_orders} color="#6366F1" C={C} />
                  <StatCard label="Bekleyen" value={stats.pending_orders} color="#EF4444" C={C} />
                  <StatCard label="Toplam Teklif" value={stats.total_offers} color="#8B5CF6" C={C} />
                  <StatCard label="Kabul Edilen" value={stats.accepted_offers} color="#059669" C={C} />
                  <StatCard label="Ciro (₺)" value={Math.round(stats.total_revenue)} color="#D4526E" C={C} />
                </View>
              )}

              {/* Filtreler */}
              <View style={styles.filterRow}>
                {([
                  { key: 'all', label: `Tümü (${users.length})` },
                  { key: 'customer', label: '🎂 Müşteri' },
                  { key: 'baker', label: '👨‍🍳 Pastacı' },
                ] as { key: UserFilter; label: string }[]).map((f) => (
                  <TouchableOpacity
                    key={f.key}
                    style={[
                      styles.filterChip,
                      { backgroundColor: filter === f.key ? C.primary : C.card, borderColor: filter === f.key ? C.primary : C.border },
                    ]}
                    onPress={() => setFilter(f.key)}
                  >
                    <Text style={[styles.filterChipText, { color: filter === f.key ? '#FFF' : C.text }]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          }
          renderItem={({ item }) => (
            <UserCard item={item} C={C} onMapPress={openMaps} />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 40 }}>👥</Text>
              <Text style={[{ color: C.textSecondary, fontSize: FontSize.md, marginTop: Spacing.sm }]}>Kullanıcı bulunamadı</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function StatCard({ label, value, color, C }: { label: string; value: number; color: string; C: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={[styles.statCard, { backgroundColor: C.card, borderColor: C.border }]}>
      <Text style={[styles.statValue, { color }]}>{value.toLocaleString('tr-TR')}</Text>
      <Text style={[styles.statLabel, { color: C.textSecondary }]}>{label}</Text>
    </View>
  );
}

function UserCard({
  item, C, onMapPress,
}: {
  item: UserRow;
  C: ReturnType<typeof useThemeColors>;
  onMapPress: (lat: number, lng: number, name: string) => void;
}) {
  const joinDate = new Date(item.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
      {/* Üst satır */}
      <View style={styles.cardTop}>
        <Text style={[styles.userName, { color: C.text }]} numberOfLines={1}>
          {item.full_name ?? 'İsimsiz'}
        </Text>
        <View style={styles.badges}>
          {item.is_baker && (
            <View style={[styles.badge, { backgroundColor: '#F59E0B20' }]}>
              <Text style={[styles.badgeText, { color: '#F59E0B' }]}>Pastacı</Text>
            </View>
          )}
          {item.is_customer && (
            <View style={[styles.badge, { backgroundColor: C.primary + '20' }]}>
              <Text style={[styles.badgeText, { color: C.primary }]}>Müşteri</Text>
            </View>
          )}
        </View>
      </View>

      <Text style={[styles.userEmail, { color: C.textSecondary }]}>{item.email}</Text>
      <Text style={[styles.joinDate, { color: C.placeholder }]}>Katıldı: {joinDate}</Text>

      {/* İstatistikler */}
      <View style={styles.statsRow}>
        <MiniStat label="Sipariş" value={item.order_count} C={C} />
        <MiniStat label="Tamamlanan" value={item.completed_order_count} C={C} />
        {item.is_baker && <MiniStat label="Teklif" value={item.offer_count} C={C} />}
        {item.is_baker && <MiniStat label="Kabul" value={item.accepted_offer_count} C={C} />}
        {item.is_baker && item.wallet_balance != null && (
          <MiniStat label="Cüzdan" value={`₺${item.wallet_balance}`} C={C} />
        )}
      </View>

      {/* Pastacı dükkan bilgileri */}
      {item.is_baker && item.shop_name && (
        <View style={[styles.shopSection, { borderTopColor: C.border }]}>
          <View style={styles.shopHeader}>
            <Text style={[styles.shopName, { color: C.text }]}>🏪 {item.shop_name}</Text>
            {item.shop_is_active != null && (
              <View style={[styles.badge, { backgroundColor: item.shop_is_active ? '#10B98120' : '#EF444420' }]}>
                <Text style={[styles.badgeText, { color: item.shop_is_active ? '#10B981' : '#EF4444' }]}>
                  {item.shop_is_active ? 'Aktif' : 'Pasif'}
                </Text>
              </View>
            )}
          </View>
          {item.shop_address && (
            <Text style={[styles.shopAddress, { color: C.textSecondary }]} numberOfLines={2}>
              📍 {item.shop_address}
            </Text>
          )}
          {item.shop_rating != null && (
            <Text style={[styles.shopRating, { color: C.textSecondary }]}>
              ⭐ {Number(item.shop_rating).toFixed(1)} ({item.shop_review_count ?? 0} yorum)
            </Text>
          )}
          {item.shop_lat != null && item.shop_lng != null && (
            <TouchableOpacity
              style={[styles.mapBtn, { backgroundColor: C.primary + '15', borderColor: C.primary + '40' }]}
              onPress={() => onMapPress(item.shop_lat!, item.shop_lng!, item.shop_name!)}
            >
              <Text style={[styles.mapBtnText, { color: C.primary }]}>
                🗺️ Haritada Gör ({item.shop_lat!.toFixed(4)}, {item.shop_lng!.toFixed(4)})
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

function MiniStat({ label, value, C }: { label: string; value: number | string; C: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={[styles.miniStat, { backgroundColor: C.background }]}>
      <Text style={[styles.miniStatValue, { color: C.text }]}>{value}</Text>
      <Text style={[styles.miniStatLabel, { color: C.placeholder }]}>{label}</Text>
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
  list: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 60 },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md,
  },
  statCard: {
    width: '47%', borderWidth: 1, borderRadius: Radius.md,
    padding: Spacing.sm, alignItems: 'center',
  },
  statValue: { fontSize: FontSize.xl, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '600', marginTop: 2, textAlign: 'center' },
  filterRow: {
    flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md,
  },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderRadius: Radius.full, borderWidth: 1,
  },
  filterChipText: { fontSize: FontSize.sm, fontWeight: '700' },
  card: {
    borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 4,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  badges: { flexDirection: 'row', gap: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  badgeText: { fontSize: 10, fontWeight: '700' },
  userName: { fontSize: FontSize.md, fontWeight: '700', flex: 1 },
  userEmail: { fontSize: FontSize.sm },
  joinDate: { fontSize: 11, marginBottom: 6 },
  statsRow: { flexDirection: 'row', gap: Spacing.xs, marginTop: 4, flexWrap: 'wrap' },
  miniStat: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.sm, alignItems: 'center', minWidth: 56,
  },
  miniStatValue: { fontSize: FontSize.sm, fontWeight: '800' },
  miniStatLabel: { fontSize: 10 },
  shopSection: { borderTopWidth: 1, marginTop: Spacing.sm, paddingTop: Spacing.sm, gap: 4 },
  shopHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shopName: { fontSize: FontSize.sm, fontWeight: '700', flex: 1 },
  shopAddress: { fontSize: FontSize.xs, lineHeight: 16 },
  shopRating: { fontSize: FontSize.xs },
  mapBtn: {
    marginTop: 6, paddingVertical: 8, paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm, borderWidth: 1, alignItems: 'center',
  },
  mapBtnText: { fontSize: FontSize.xs, fontWeight: '600' },
  empty: { padding: Spacing.xxl, alignItems: 'center' },
});

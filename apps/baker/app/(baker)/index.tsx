import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { Alert } from 'react-native';
import { supabase, rpcNearbyOrders, rpcWithdrawOffer, useAuth, useThemeColors, Spacing, Radius, FontSize, DEFAULT_LOCATION, DEFAULT_RADIUS_KM, TabHeader } from '@pastacim/shared';
import type { Database, ThemeColors } from '@pastacim/shared';
import { useNotifications } from '../../hooks/useNotifications';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

type NearbyOrder = Database['public']['Functions']['nearby_orders']['Returns'][number];

type MyOffer = {
  id: string;
  order_id: string;
  price: number;
  status: string;
};

// Bekleyen / reddedilen / geri çekilen teklifler için sipariş özetiyle birlikte tip
type MyOfferWithOrder = MyOffer & {
  created_at: string;
  order: {
    id: string;
    title: string;
    serving_size: number | null;
    delivery_date: string | null;
    status: string;
    customer: { full_name: string | null; created_at: string } | null;
  } | null;
};

type OfferStats = { count: number; avgRating: number | null };

const DELIVERY_TYPE_LABELS: Record<string, string> = {
  delivery: '🚚 Adrese Teslim',
  pickup: '🏪 Gel-Al',
};

const OFFER_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pending:  { label: '⏳ Teklifim bekleniyor', bg: '#ECC94B22', text: '#B7791F' },
  accepted: { label: '✅ Teklifim kabul edildi', bg: '#48BB7822', text: '#276749' },
  rejected: { label: '❌ Teklifim reddedildi', bg: '#FC818122', text: '#C53030' },
};

export default function BakerHomeScreen() {
  const C = useThemeColors();
  const { profile, user } = useAuth();
  const { unreadCount } = useNotifications(user?.id);

  const [orders, setOrders] = useState<NearbyOrder[]>([]);
  const [myOfferMap, setMyOfferMap] = useState<Map<string, MyOffer>>(new Map());
  const [offerStatsMap, setOfferStatsMap] = useState<Map<string, OfferStats>>(new Map());
  const [pendingOffers, setPendingOffers] = useState<MyOfferWithOrder[]>([]);
  const [inactiveOffers, setInactiveOffers] = useState<MyOfferWithOrder[]>([]);
  const [inactiveExpanded, setInactiveExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [shopLocation, setShopLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  const handleWithdraw = (offerId: string, title: string) => {
    Alert.alert(
      '↩️ Teklifi Geri Çek',
      `"${title}" siparişindeki teklifinizi geri çekmek istediğinizden emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Geri Çek', style: 'destructive',
          onPress: async () => {
            setWithdrawingId(offerId);
            const { data, error } = await rpcWithdrawOffer({ p_offer_id: offerId });
            setWithdrawingId(null);
            if (error || (data as { error?: string } | null)?.error) {
              Alert.alert('Hata', 'Teklif geri çekilemedi.');
              return;
            }
            // Listeden çıkar
            setPendingOffers((prev) => prev.filter((p) => p.id !== offerId));
          },
        },
      ]
    );
  };

  // ─── Konum: önce dükkan koordinatı, yoksa cihaz GPS ───────────────────────
  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      // Dükkan koordinatı — en güvenilir kaynak
      const { data: shop } = await _db
        .from('pastry_shops')
        .select('latitude, longitude')
        .eq('user_id', profile.id)
        .single();

      if (shop?.latitude && shop?.longitude) {
        setShopLocation({ lat: shop.latitude, lng: shop.longitude });
        return;
      }

      // Dükkan koordinatı yoksa cihaz GPS
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setShopLocation({ lat: DEFAULT_LOCATION.latitude, lng: DEFAULT_LOCATION.longitude });
        return;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setShopLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch {
        setShopLocation({ lat: DEFAULT_LOCATION.latitude, lng: DEFAULT_LOCATION.longitude });
      }
    })();
  }, [profile?.id]);

  // ─── Yakındaki Talepleri + Kendi Tekliflerimi Getir ───────────────────────
  const fetchOrders = useCallback(async (refresh = false) => {
    if (!shopLocation) return;
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await rpcNearbyOrders({
        lat: shopLocation.lat,
        lng: shopLocation.lng,
        radius_km: radiusKm,
      });

      if (rpcError) {
        setError('Talepler yüklenemedi. Lütfen tekrar deneyin.');
        return;
      }

      const newOrders = data ?? [];
      setOrders(newOrders);

      // Kendi tekliflerimi + teklif istatistiklerini getir
      if (newOrders.length > 0 && user?.id) {
        const orderIds = newOrders.map((o) => o.id);
        // Kendi tekliflerim (yakındaki siparişlere)
        const { data: myOfferData } = await _db
          .from('offers')
          .select('id, order_id, price, status')
          .eq('baker_id', user.id)
          .in('order_id', orderIds);
        setMyOfferMap(new Map((myOfferData ?? []).map((o: MyOffer) => [o.order_id, o])));

        // Teklif istatistikleri: baker_id'leri al, sonra shop puanlarını ayrı sorgula
        type OfferRow = { order_id: string; baker_id: string };
        const { data: offerRows } = await _db
          .from('offers')
          .select('order_id, baker_id')
          .in('order_id', orderIds)
          .neq('status', 'withdrawn')
          .neq('status', 'rejected') as { data: OfferRow[] | null };

        const bakerIds = [...new Set((offerRows ?? []).map((r) => r.baker_id))];
        const ratingMap = new Map<string, number>();
        if (bakerIds.length > 0) {
          const { data: shopData } = await _db
            .from('pastry_shops')
            .select('user_id, rating')
            .in('user_id', bakerIds) as { data: { user_id: string; rating: number }[] | null };
          for (const s of shopData ?? []) ratingMap.set(s.user_id, s.rating);
        }

        const statsMap = new Map<string, OfferStats>();
        for (const row of offerRows ?? []) {
          const prev = statsMap.get(row.order_id);
          const rating = ratingMap.has(row.baker_id) ? (ratingMap.get(row.baker_id) ?? null) : null;
          if (!prev) {
            statsMap.set(row.order_id, { count: 1, avgRating: rating });
          } else {
            const newCount = prev.count + 1;
            const newAvg = rating != null
              ? ((prev.avgRating ?? 0) * prev.count + rating) / newCount
              : prev.avgRating;
            statsMap.set(row.order_id, { count: newCount, avgRating: newAvg });
          }
        }
        setOfferStatsMap(statsMap);
      } else {
        setMyOfferMap(new Map());
        setOfferStatsMap(new Map());
      }

      // Bekleyen + reddedilen + geri çekilen tekliflerimi getir (sipariş özetiyle)
      if (user?.id) {
        const { data: allMyOffers } = await _db
          .from('offers')
          .select(`
            id, order_id, price, status, created_at,
            order:orders!order_id (
              id, title, serving_size, delivery_date, status,
              customer:users!customer_id ( full_name, created_at )
            )
          `)
          .eq('baker_id', user.id)
          .in('status', ['pending', 'rejected', 'withdrawn'])
          .order('created_at', { ascending: false }) as { data: MyOfferWithOrder[] | null };

        const all = allMyOffers ?? [];
        setPendingOffers(all.filter((o) => o.status === 'pending'));
        setInactiveOffers(all.filter((o) => o.status === 'rejected' || o.status === 'withdrawn'));
      } else {
        setPendingOffers([]);
        setInactiveOffers([]);
      }
    } catch {
      setError('Talepler yüklenirken bir sorun oluştu.');
    } finally {
      if (refresh) setIsRefreshing(false);
      else setIsLoading(false);
    }
  }, [shopLocation, radiusKm, user?.id]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Tab'a odaklanınca teklif durumunu güncelle
  useFocusEffect(useCallback(() => { fetchOrders(); }, [fetchOrders]));

  // Realtime: kendi tekliflerim ve siparişler değişince listeyi tazele.
  // NOT: DELETE event'lerinin baker_id filtresiyle düşmesi REPLICA IDENTITY FULL
  // gerektirir; bu yüzden offers tablosunu filtresiz dinleyip refetch ediyoruz.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`baker-home:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'offers' },
        () => { fetchOrders(true); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => { fetchOrders(true); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchOrders]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <TabHeader
        title={`Hoş geldin, ${profile?.full_name?.split(' ')[0] ?? 'Pastacı'}`}
        subtitle="Talepleri inceleyip teklif verin"
        unreadCount={unreadCount}
        onBellPress={() => router.push('/(baker)/notifications' as never)}
      />

      {/* Mesafe Filtresi */}
      <View style={[styles.filterBar, { backgroundColor: C.card, borderBottomColor: C.border }]}>
        <Text style={[styles.filterLabel, { color: C.textSecondary }]}>
          📍 Arama:{' '}
          <Text style={{ color: C.primary, fontWeight: '700' }}>
            {radiusKm >= 9999 ? 'Tümü' : `${radiusKm} km`}
          </Text>
        </Text>
        <View style={styles.radiusButtons}>
          {[5, 10, 20, 50].map((km) => (
            <TouchableOpacity
              key={km}
              style={[
                styles.radiusBtn,
                {
                  backgroundColor: radiusKm === km ? C.primary : C.background,
                  borderColor: radiusKm === km ? C.primary : C.border,
                },
              ]}
              onPress={() => setRadiusKm(km)}
            >
              <Text style={[styles.radiusBtnText, { color: radiusKm === km ? '#FFF' : C.textSecondary }]}>
                {km}km
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[
              styles.radiusBtn,
              {
                backgroundColor: radiusKm >= 9999 ? C.primary : C.background,
                borderColor: radiusKm >= 9999 ? C.primary : C.border,
              },
            ]}
            onPress={() => setRadiusKm(9999)}
          >
            <Text style={[styles.radiusBtnText, { color: radiusKm >= 9999 ? '#FFF' : C.textSecondary }]}>
              🌍
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* İçerik */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={[styles.loadingText, { color: C.textSecondary }]}>Talepler aranıyor…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorEmoji}>😢</Text>
          <Text style={[styles.errorText, { color: C.text }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: C.primary }]}
            onPress={() => fetchOrders()}
          >
            <Text style={styles.retryBtnText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={orders.filter((o) => {
            const myOffer = myOfferMap.get(o.id);
            return !myOffer || myOffer.status === 'rejected' || myOffer.status === 'withdrawn';
          })}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RequestCard
              order={item}
              colors={C}
              myOffer={myOfferMap.get(item.id)}
              offerStats={offerStatsMap.get(item.id)}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchOrders(true)}
              tintColor={C.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🗺️</Text>
              <Text style={[styles.emptyTitle, { color: C.text }]}>Bu bölgede talep yok</Text>
              <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>
                Mesafe aralığını artırabilirsin
              </Text>
            </View>
          }
          ListHeaderComponent={(() => {
            const count = orders.filter((o) => {
              const myOffer = myOfferMap.get(o.id);
              return !myOffer || myOffer.status === 'rejected' || myOffer.status === 'withdrawn';
            }).length;
            return count > 0 ? (
              <Text style={[styles.listHeader, { color: C.textSecondary }]}>
                {count} açık talep
              </Text>
            ) : null;
          })()}
          ListFooterComponent={
            <View>
              {/* Bekleyen Tekliflerim */}
              {pendingOffers.length > 0 && (
                <View style={[styles.sectionBox, { backgroundColor: C.card, borderColor: C.border }]}>
                  <Text style={[styles.sectionTitle, { color: C.text }]}>
                    📤 Bekleyen Tekliflerim ({pendingOffers.length})
                  </Text>
                  <Text style={[styles.sectionHint, { color: C.placeholder }]}>
                    Müşteri kararını bekliyor
                  </Text>
                  {pendingOffers.map((p) => {
                    const memberDays = p.order?.customer?.created_at
                      ? Math.max(0, Math.floor((Date.now() - new Date(p.order.customer.created_at).getTime()) / (1000 * 60 * 60 * 24)))
                      : null;
                    const memberStr = memberDays == null
                      ? ''
                      : memberDays < 30
                        ? `${memberDays}g üye`
                        : memberDays < 365
                          ? `${Math.floor(memberDays / 30)}ay üye`
                          : `${Math.floor(memberDays / 365)}y üye`;
                    return (
                    <View key={p.id} style={[styles.miniCard, { borderTopColor: C.border }]}>
                      <TouchableOpacity
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}
                        onPress={() => p.order && router.push({
                          pathname: '/(baker)/offer/[orderId]',
                          params: { orderId: p.order.id },
                        })}
                        activeOpacity={0.7}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.miniTitle, { color: C.text }]} numberOfLines={1}>
                            {p.order?.title ?? 'Sipariş'}
                          </Text>
                          {p.order?.customer?.full_name ? (
                            <Text style={[styles.miniMeta, { color: C.textSecondary }]} numberOfLines={1}>
                              👤 {p.order.customer.full_name}
                              {memberStr ? ` · ${memberStr}` : ''}
                            </Text>
                          ) : null}
                          <Text style={[styles.miniMeta, { color: C.textSecondary }]} numberOfLines={1}>
                            ⏳ Bekleniyor
                            {p.order?.serving_size ? ` · 👥 ${p.order.serving_size} kişilik` : ''}
                          </Text>
                        </View>
                        <Text style={[styles.miniPrice, { color: C.primary }]}>₺{p.price}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.withdrawBtn, { borderColor: C.error + '88' }]}
                        onPress={() => handleWithdraw(p.id, p.order?.title ?? 'Bu sipariş')}
                        disabled={withdrawingId === p.id}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        {withdrawingId === p.id ? (
                          <ActivityIndicator size="small" color={C.error} />
                        ) : (
                          <Text style={[styles.withdrawBtnText, { color: C.error }]}>↩️ Geri Çek</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                    );
                  })}
                </View>
              )}

              {/* Siparişe Dönmeyen Tekliflerim (Collapse) */}
              {inactiveOffers.length > 0 && (
                <View style={[styles.sectionBox, { backgroundColor: C.card, borderColor: C.border }]}>
                  <TouchableOpacity
                    style={styles.sectionHeaderRow}
                    onPress={() => setInactiveExpanded((v) => !v)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.sectionTitle, { color: C.text }]}>
                      📁 Siparişe Dönmeyen Tekliflerim ({inactiveOffers.length})
                    </Text>
                    <Text style={[styles.chevron, { color: C.textSecondary }]}>
                      {inactiveExpanded ? '▾' : '▸'}
                    </Text>
                  </TouchableOpacity>
                  {inactiveExpanded && inactiveOffers.map((p) => (
                    <View key={p.id} style={[styles.miniCard, { borderTopColor: C.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.miniTitle, { color: C.text }]} numberOfLines={1}>
                          {p.order?.title ?? 'Sipariş'}
                        </Text>
                        <Text style={[styles.miniMeta, { color: C.textSecondary }]} numberOfLines={1}>
                          {p.status === 'rejected' ? '❌ Müşteri başka teklif kabul etti' : '↩️ Geri çekildi'}
                        </Text>
                      </View>
                      <Text style={[styles.miniPriceMuted, { color: C.placeholder }]}>₺{p.price}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ─── RequestCard ─────────────────────────────────────────────────────────────
function RequestCard({
  order, colors: C, myOffer, offerStats,
}: {
  order: NearbyOrder;
  colors: ThemeColors;
  myOffer?: MyOffer;
  offerStats?: OfferStats;
}) {
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
    });
  };

  const offerConfig = myOffer ? OFFER_STATUS_CONFIG[myOffer.status] : null;
  // Yalnızca AKTİF teklif (pending/accepted) "mevcut" sayılır ve butonu kilitler.
  // rejected VE withdrawn yeniden teklif verilebilir (submit_offer onları
  // pending'e çevirir) — withdrawn'ı da 'mevcut' sayan eski mantık, teklif
  // verilebilecek kartı yanlışlıkla kilitliyordu.
  const alreadyOffered = !!myOffer && (myOffer.status === 'pending' || myOffer.status === 'accepted');

  const isUrgent = (() => {
    if (!order.delivery_date) return false;
    const diff = (new Date(order.delivery_date).setHours(23, 59, 59) - Date.now()) / (1000 * 60 * 60 * 24);
    return diff <= 2;
  })();

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: C.card, borderColor: isUrgent ? '#E53E3E' : alreadyOffered ? C.primary : C.border },
        (isUrgent || alreadyOffered) && { borderWidth: 2 },
      ]}
      activeOpacity={0.8}
      onPress={() => router.push({ pathname: '/(baker)/offer/[orderId]', params: { orderId: order.id } })}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: C.text }]} numberOfLines={1}>
          {order.title}
        </Text>
        <View style={styles.badgeRow}>
          {isUrgent && (
            <View style={styles.urgentBadge}>
              <Text style={styles.urgentBadgeText}>🔥 ACİL</Text>
            </View>
          )}
          <View style={[styles.deliveryBadge, { backgroundColor: C.primary + '18', borderColor: C.primary + '44' }]}>
            <Text style={[styles.deliveryBadgeText, { color: C.primary }]}>
              {DELIVERY_TYPE_LABELS[order.delivery_type ?? 'delivery']}
            </Text>
          </View>
        </View>
      </View>

      {order.description && (
        <Text style={[styles.cardDesc, { color: C.textSecondary }]} numberOfLines={2}>
          {order.description}
        </Text>
      )}

      <View style={styles.cardMeta}>
        {order.serving_size && (
          <View style={[styles.metaChip, { backgroundColor: C.background }]}>
            <Text style={[styles.metaChipText, { color: C.textSecondary }]}>
              👥 {order.serving_size} kişilik
            </Text>
          </View>
        )}
        {order.delivery_date && (
          <View style={[styles.metaChip, { backgroundColor: isUrgent ? '#E53E3E18' : C.background }]}>
            <Text style={[styles.metaChipText, { color: isUrgent ? '#E53E3E' : C.textSecondary, fontWeight: isUrgent ? '700' : '400' }]}>
              📅 Teslim: {formatDate(order.delivery_date)}
            </Text>
          </View>
        )}
        {(order as any).delivery_time && (
          <View style={[styles.metaChip, { backgroundColor: C.background }]}>
            <Text style={[styles.metaChipText, { color: C.textSecondary }]}>
              🕐 {((order as any).delivery_time as string).substring(0, 5)}
            </Text>
          </View>
        )}
        {(order as any).is_urgent && (
          <View style={{ backgroundColor: '#FED7D7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ fontSize: FontSize.xs, color: '#C53030', fontWeight: '700' }}>⚡ Acil</Text>
          </View>
        )}
        {order.delivery_address && (
          <View style={[styles.metaChip, { backgroundColor: C.background }]}>
            <Text style={[styles.metaChipText, { color: C.textSecondary }]} numberOfLines={1}>
              📍 {order.delivery_address.length > 30 ? order.delivery_address.substring(0, 30) + '…' : order.delivery_address}
            </Text>
          </View>
        )}
        {order.created_at && (
          <View style={[styles.metaChip, { backgroundColor: C.background }]}>
            <Text style={[styles.metaChipText, { color: C.placeholder }]}>
              🗓 Talep: {formatDate(order.created_at)}
            </Text>
          </View>
        )}
      </View>

      {/* Müşteri özeti */}
      {order.customer_full_name && (
        <View style={[styles.customerRow, { backgroundColor: C.background, borderColor: C.border }]}>
          <Text style={[styles.customerEmoji]}>👤</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.customerName, { color: C.text }]} numberOfLines={1}>
              {order.customer_full_name}
            </Text>
            <Text style={[styles.customerStats, { color: C.textSecondary }]} numberOfLines={1}>
              {order.customer_total_orders === 0 ? '🆕 İlk siparişi'
                : `📦 ${order.customer_total_orders} sipariş · ✅ ${order.customer_completed_orders}`}
              {' · '}
              {order.customer_member_days < 30
                ? `${order.customer_member_days}g`
                : order.customer_member_days < 365
                  ? `${Math.floor(order.customer_member_days / 30)}ay`
                  : `${Math.floor(order.customer_member_days / 365)}y`} üye
            </Text>
          </View>
        </View>
      )}

      {/* Teklif istatistikleri (her zaman göster — 0 ise ilk olma avantajını vurgula) */}
      {(() => {
        const count = offerStats?.count ?? 0;
        const avg = offerStats?.avgRating;
        return (
          <View style={[styles.statsChip, { backgroundColor: count === 0 ? C.primary + '12' : C.background, borderColor: count === 0 ? C.primary + '44' : C.border }]}>
            <Text style={[styles.statsChipText, { color: count === 0 ? C.primary : C.textSecondary }]}>
              {count === 0
                ? '💬 Henüz teklif yok — ilk olun!'
                : `💬 ${count} teklif${avg != null && avg > 0 ? `  ·  ⭐ ${avg.toFixed(1)}` : ''}`}
            </Text>
          </View>
        );
      })()}

      {/* Kendi teklif durumu */}
      {offerConfig && (
        <View style={[styles.myOfferBadge, { backgroundColor: offerConfig.bg }]}>
          <Text style={[styles.myOfferText, { color: offerConfig.text }]}>
            {offerConfig.label}
            {myOffer?.status === 'pending' ? `  ·  ₺${myOffer.price}` : ''}
          </Text>
        </View>
      )}

      <View style={styles.cardFooter}>
        <Text style={[styles.cardDistance, { color: C.primary }]}>
          📍 {order.distance_km} km uzakta
        </Text>
        {alreadyOffered ? (
          <View style={[styles.offeredBtn, { borderColor: C.primary + '66' }]}>
            <Text style={[styles.offeredBtnText, { color: C.primary }]}>Güncelle →</Text>
          </View>
        ) : (
          <View style={[styles.offerBtn, { backgroundColor: C.primary }]}>
            <Text style={styles.offerBtnText}>Teklif Ver →</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  greeting: { fontSize: FontSize.sm },
  name: { fontSize: FontSize.xl, fontWeight: '800' },
  filterBar: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    gap: Spacing.sm,
  },
  filterLabel: { fontSize: FontSize.sm },
  radiusButtons: { flexDirection: 'row', gap: Spacing.xs },
  radiusBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  radiusBtnText: { fontSize: FontSize.xs, fontWeight: '600' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  loadingText: { fontSize: FontSize.md },
  errorEmoji: { fontSize: 48 },
  errorText: { fontSize: FontSize.md, textAlign: 'center' },
  retryBtn: { paddingHorizontal: Spacing.xl, paddingVertical: 10, borderRadius: Radius.full },
  retryBtnText: { color: '#FFF', fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: Spacing.md },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { fontSize: FontSize.md, textAlign: 'center' },
  list: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 80 },
  listHeader: { fontSize: FontSize.sm, marginBottom: Spacing.xs },
  sectionBox: {
    borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md,
    marginTop: Spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700' },
  sectionHint: { fontSize: FontSize.xs, marginTop: 2 },
  chevron: { fontSize: 18, fontWeight: '700' },
  miniCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: 10, borderTopWidth: 1, marginTop: 8,
  },
  miniTitle: { fontSize: FontSize.sm, fontWeight: '700' },
  miniMeta: { fontSize: FontSize.xs, marginTop: 2 },
  miniPrice: { fontSize: FontSize.md, fontWeight: '800' },
  miniPriceMuted: { fontSize: FontSize.sm, fontWeight: '600', textDecorationLine: 'line-through' },
  withdrawBtn: {
    borderWidth: 1, borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 6,
    alignSelf: 'flex-start', marginTop: 4,
  },
  withdrawBtnText: { fontSize: FontSize.xs, fontWeight: '700' },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', flex: 1 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  urgentBadge: { backgroundColor: '#E53E3E', borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  urgentBadgeText: { color: '#FFF', fontSize: FontSize.xs, fontWeight: '800', letterSpacing: 0.5 },
  deliveryBadge: { borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  deliveryBadgeText: { fontSize: FontSize.xs, fontWeight: '600' },
  cardDesc: { fontSize: FontSize.sm, lineHeight: 18 },
  cardMeta: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' },
  metaChip: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.sm },
  metaChipText: { fontSize: FontSize.xs },
  myOfferBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  myOfferText: { fontSize: FontSize.sm, fontWeight: '700' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDistance: { fontSize: FontSize.sm, fontWeight: '600' },
  offerBtn: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full },
  offerBtnText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '700' },
  offeredBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  offeredBtnText: { fontSize: FontSize.sm, fontWeight: '700' },
  statsChip: {
    borderWidth: 1, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  statsChipText: { fontSize: FontSize.xs, fontWeight: '600' },
  customerRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 8,
    borderRadius: Radius.md, borderWidth: 1,
    marginTop: 6,
  },
  customerEmoji: { fontSize: 18 },
  customerName: { fontSize: FontSize.sm, fontWeight: '700' },
  customerStats: { fontSize: 11, marginTop: 1 },
});

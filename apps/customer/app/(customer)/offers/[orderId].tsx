import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase, rpcAcceptOffer, rpcRejectOffer, notifyUser, useAuth, useThemeColors, ThemeColors, Spacing, Radius, FontSize } from '@pastacim/shared';
import type { Database } from '@pastacim/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

type Offer = Database['public']['Tables']['offers']['Row'] & {
  baker_profile?: { full_name: string | null } | null;
  shop?: { name: string; rating: number; review_count: number } | null;
};

export default function OffersScreen() {
  const C = useThemeColors();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { user } = useAuth();

  const [offers, setOffers] = useState<Offer[]>([]);
  const [order, setOrder] = useState<Database['public']['Tables']['orders']['Row'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const fetchData = useCallback(async (refresh = false) => {
    if (!orderId) return;
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);

    // Siparişi yükle
    const orderRes = await _db.from('orders').select('*').eq('id', orderId).single();
    if (orderRes.data) setOrder(orderRes.data);

    // Teklifleri yükle — join ile dükkan ve baker bilgisi
    const offersRes = await _db
      .from('offers')
      .select(`
        *,
        baker_profile:users!baker_id ( full_name ),
        shop:pastry_shops!shop_id ( name, rating, review_count )
      `)
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (offersRes.data) {
      setOffers(offersRes.data as Offer[]);
    }

    if (refresh) setIsRefreshing(false);
    else setIsLoading(false);
  }, [orderId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAccept = async (offer: Offer) => {
    Alert.alert(
      '✅ Teklifi Kabul Et',
      `"${offer.shop?.name ?? 'Bu pastacı'}" teklifini kabul etmek istiyor musunuz?\n\nFiyat: ₺${offer.price}`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Kabul Et',
          onPress: async () => {
            setAcceptingId(offer.id);
            const { data, error } = await rpcAcceptOffer({ p_offer_id: offer.id });
            setAcceptingId(null);

            if (error || (data as { error?: string } | null)?.error) {
              Alert.alert('Hata', (data as { error?: string } | null)?.error ?? 'İşlem başarısız.');
              return;
            }

            // Pastacıya bildirim gönder
            notifyUser({
              userId: offer.baker_id,
              type: 'offer_accepted',
              title: '✅ Teklifiniz Kabul Edildi!',
              body: `${order?.title ?? 'Siparişiniz'} için teklifiniz kabul edildi.`,
              data: { orderId: orderId as string },
            }).catch(() => {});

            Alert.alert(
              '🎉 Teklif Kabul Edildi!',
              'Pastacıya bildirim gönderildi. İletişime geçebilirsiniz.',
              [
                {
                  text: 'Mesaj Gönder',
                  onPress: () => {
                    router.replace({
                      pathname: '/messages/[conversationId]',
                      params: { conversationId: offer.baker_id, orderId: orderId as string },
                    });
                  },
                },
                {
                  text: 'Tamam',
                  onPress: () => {
                    fetchData();
                    // Keşfet'i de güncelle (sipariş artık "Kabul Edildi" göstermeli)
                    router.replace('/(customer)');
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleReject = async (offer: Offer) => {
    Alert.alert(
      '❌ Teklifi Reddet',
      `"${offer.shop?.name ?? 'Bu pastacı'}" teklifini reddetmek istiyor musunuz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Reddet',
          style: 'destructive',
          onPress: async () => {
            setRejectingId(offer.id);
            const { data, error } = await rpcRejectOffer({ p_offer_id: offer.id });
            setRejectingId(null);

            if (error || (data as { error?: string } | null)?.error) {
              Alert.alert('Hata', (data as { error?: string } | null)?.error ?? 'İşlem başarısız.');
              return;
            }

            // Pastacıya ret bildirimi
            notifyUser({
              userId: offer.baker_id,
              type: 'offer_rejected',
              title: '❌ Teklifiniz Reddedildi',
              body: `${order?.title ?? 'Siparişiniz'} için teklifiniz reddedildi.`,
              data: { orderId: orderId as string },
            }).catch(() => {});

            // Listeyi güncelle
            setOffers((prev) =>
              prev.map((o) => (o.id === offer.id ? { ...o, status: 'rejected' } : o))
            );
          },
        },
      ]
    );
  };

  const handleMessage = (offer: Offer) => {
    router.push({
      pathname: '/messages/[conversationId]',
      params: { conversationId: offer.baker_id, orderId: orderId as string },
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.backText, { color: C.primary }]}>← Geri</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: C.text }]}>Teklifler</Text>
          {order && (
            <Text style={[styles.headerSubtitle, { color: C.textSecondary }]} numberOfLines={1}>
              {order.title}
            </Text>
          )}
        </View>
        <View style={{ width: 48 }} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : offers.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>⏳</Text>
          <Text style={[styles.emptyTitle, { color: C.text }]}>Henüz teklif yok</Text>
          <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>
            Yakındaki pastacılar tekliflerini gönderince burada görünecek
          </Text>
        </View>
      ) : (
        <FlatList
          data={offers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <OfferCard
              offer={item}
              isAccepted={order?.selected_offer_id === item.id}
              isOrderAccepted={order?.status === 'accepted'}
              onAccept={() => handleAccept(item)}
              onReject={() => handleReject(item)}
              onMessage={() => handleMessage(item)}
              onViewProfile={() => router.push({
                pathname: '/(customer)/baker/[shopId]',
                params: { shopId: item.shop_id },
              })}
              isAccepting={acceptingId === item.id}
              isRejecting={rejectingId === item.id}
              colors={C}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={() => fetchData(true)} tintColor={C.primary} />
          }
          ListHeaderComponent={
            <Text style={[styles.listHeader, { color: C.textSecondary }]}>
              {offers.filter(o => o.status !== 'rejected').length} teklif
              {offers.filter(o => o.status === 'rejected').length > 0 &&
                ` · ${offers.filter(o => o.status === 'rejected').length} reddedildi`}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

function OfferCard({
  offer, isAccepted, isOrderAccepted, onAccept, onReject, onMessage, onViewProfile, isAccepting, isRejecting, colors: C,
}: {
  offer: Offer;
  isAccepted: boolean;
  isOrderAccepted: boolean;
  onAccept: () => void;
  onReject: () => void;
  onMessage: () => void;
  onViewProfile: () => void;
  isAccepting: boolean;
  isRejecting: boolean;
  colors: ThemeColors;
}) {
  const isRejected = offer.status === 'rejected';

  return (
    <View style={[
      styles.card,
      { backgroundColor: C.card, borderColor: isAccepted ? C.success : isRejected ? C.error + '55' : C.border },
      isAccepted && styles.cardAccepted,
      isRejected && { opacity: 0.6 },
    ]}>
      {isAccepted && (
        <View style={[styles.statusBanner, { backgroundColor: C.success + '22' }]}>
          <Text style={[styles.statusBannerText, { color: C.success }]}>✅ Kabul Edildi</Text>
        </View>
      )}
      {isRejected && (
        <View style={[styles.statusBanner, { backgroundColor: C.error + '18' }]}>
          <Text style={[styles.statusBannerText, { color: C.error }]}>❌ Reddedildi</Text>
        </View>
      )}

      {/* Dükkan */}
      <View style={styles.shopRow}>
        <View style={[styles.shopAvatar, { backgroundColor: C.primary + '22' }]}>
          <Text style={styles.shopAvatarEmoji}>🎂</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.shopName, { color: C.text }]}>
            {offer.shop?.name ?? 'Pastacı'}
          </Text>
          {offer.baker_profile?.full_name ? (
            <Text style={[styles.bakerName, { color: C.textSecondary }]}>
              {offer.baker_profile.full_name}
            </Text>
          ) : null}
        </View>
        {(offer.shop?.rating ?? 0) > 0 && (
          <View style={styles.ratingRow}>
            <Text style={styles.ratingStar}>⭐</Text>
            <Text style={[styles.ratingText, { color: C.text }]}>
              {(offer.shop?.rating ?? 0).toFixed(1)}
            </Text>
          </View>
        )}
      </View>

      {/* Fiyat */}
      <View style={styles.priceRow}>
        <Text style={[styles.price, { color: C.primary }]}>₺{offer.price}</Text>
        {offer.estimated_days ? (
          <Text style={[styles.days, { color: C.textSecondary }]}>
            📅 {offer.estimated_days} gün içinde
          </Text>
        ) : null}
      </View>

      {/* Mesaj */}
      {offer.message ? (
        <Text style={[styles.message, { color: C.textSecondary }]} numberOfLines={4}>
          "{offer.message}"
        </Text>
      ) : null}

      {/* Aksiyon butonları */}
      {!isRejected && (
        <View style={styles.btnRow}>
          {/* Profili Gör */}
          <TouchableOpacity
            style={[styles.profileBtn, { borderColor: C.border, backgroundColor: C.background }]}
            onPress={onViewProfile}
          >
            <Text style={[styles.msgBtnText, { color: C.textSecondary }]}>🏪 Profil</Text>
          </TouchableOpacity>

          {/* Mesaj — her zaman göster (teklif verildiği anda aktif) */}
          <TouchableOpacity
            style={[styles.msgBtn, { borderColor: C.primary + '66', backgroundColor: C.primary + '12' }]}
            onPress={onMessage}
          >
            <Text style={[styles.msgBtnText, { color: C.primary }]}>💬 Mesaj</Text>
          </TouchableOpacity>

          {/* Reddet + Kabul Et — sadece karar verilmemişse */}
          {!isOrderAccepted && offer.status === 'pending' && (
            <>
              <TouchableOpacity
                style={[styles.rejectBtn, { borderColor: C.error + '88' }]}
                onPress={onReject}
                disabled={isRejecting}
              >
                {isRejecting ? (
                  <ActivityIndicator color={C.error} size="small" />
                ) : (
                  <Text style={[styles.rejectBtnText, { color: C.error }]}>✕ Reddet</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.acceptBtn, { backgroundColor: C.primary }]}
                onPress={onAccept}
                disabled={isAccepting}
              >
                {isAccepting ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.acceptBtnText}>✓ Kabul</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1,
  },
  backText: { fontSize: FontSize.md, fontWeight: '600' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800' },
  headerSubtitle: { fontSize: FontSize.xs, marginTop: 2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  emptySubtitle: { fontSize: FontSize.md, textAlign: 'center' },
  list: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 80 },
  listHeader: { fontSize: FontSize.sm, marginBottom: Spacing.xs },
  card: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm, overflow: 'hidden' },
  cardAccepted: { borderWidth: 2 },
  statusBanner: { padding: Spacing.sm, borderRadius: Radius.sm, alignItems: 'center' },
  statusBannerText: { fontWeight: '700', fontSize: FontSize.sm },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  shopAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  shopAvatarEmoji: { fontSize: 22 },
  shopName: { fontSize: FontSize.md, fontWeight: '700' },
  bakerName: { fontSize: FontSize.xs },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingStar: { fontSize: 13 },
  ratingText: { fontSize: FontSize.sm, fontWeight: '600' },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price: { fontSize: FontSize.xxl, fontWeight: '800' },
  days: { fontSize: FontSize.sm },
  message: { fontSize: FontSize.sm, lineHeight: 18, fontStyle: 'italic' },
  btnRow: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.xs },
  profileBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 10, borderRadius: Radius.full, borderWidth: 1.5, alignItems: 'center' },
  msgBtn: { flex: 1, paddingVertical: 10, borderRadius: Radius.full, borderWidth: 1.5, alignItems: 'center' },
  msgBtnText: { fontSize: FontSize.xs, fontWeight: '600' },
  rejectBtn: { flex: 1, paddingVertical: 10, borderRadius: Radius.full, borderWidth: 1.5, alignItems: 'center' },
  rejectBtnText: { fontSize: FontSize.xs, fontWeight: '600' },
  acceptBtn: { flex: 2, paddingVertical: 10, borderRadius: Radius.full, alignItems: 'center' },
  acceptBtnText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '700' },
  fullBtn: { paddingVertical: 12, borderRadius: Radius.full, alignItems: 'center', marginTop: Spacing.xs },
});

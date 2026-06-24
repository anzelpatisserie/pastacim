import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase, rpcAcceptOffer, rpcRejectOffer, notifyFromTemplate, sendAppEmail, getUserPushToken, sendPushNotification, useAuth, useThemeColors, ThemeColors, Spacing, Radius, FontSize } from '@pastacim/shared';
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
      // Sıralama: rating yüksekten düşüğe → review_count → düşük fiyat
      // Reddedilen teklifler en sona düşsün.
      const sorted = [...(offersRes.data as Offer[])].sort((a, b) => {
        const aRejected = a.status === 'rejected' ? 1 : 0;
        const bRejected = b.status === 'rejected' ? 1 : 0;
        if (aRejected !== bRejected) return aRejected - bRejected;

        const aRating = a.shop?.rating ?? 0;
        const bRating = b.shop?.rating ?? 0;
        if (bRating !== aRating) return bRating - aRating;

        const aReviews = a.shop?.review_count ?? 0;
        const bReviews = b.shop?.review_count ?? 0;
        if (bReviews !== aReviews) return bReviews - aReviews;

        return (a.price ?? 0) - (b.price ?? 0);
      });
      setOffers(sorted);
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

            // Pastacıya bildirim gönder (düzenlenebilir şablon)
            notifyFromTemplate({
              userId: offer.baker_id,
              key: 'offer_accepted',
              vars: { title: order?.title ?? 'Siparişiniz' },
              fallback: {
                title: '✅ Teklifiniz Kabul Edildi!',
                body: `${order?.title ?? 'Siparişiniz'} için teklifiniz kabul edildi.`,
              },
              data: { orderId: orderId as string },
              targetRole: 'baker',
            }).catch(() => {});
            sendAppEmail(offer.baker_id, 'offer_accepted', { orderTitle: order?.title, orderId: orderId as string });

            // accept_offer RPC diğer teklifleri DB tarafında otomatik 'rejected'
            // yapıp in-app bildirimi (notifications tablosu) ekledi. Burada da
            // reddedilen baker'lara PUSH bildirimi yollayalım — in-app duplicate
            // olmaması için notifyUser yerine doğrudan sendPushNotification kullan.
            offers
              .filter((o) => o.id !== offer.id && o.baker_id !== offer.baker_id && o.status === 'pending')
              .forEach(async (rejected) => {
                try {
                  const token = await getUserPushToken(rejected.baker_id);
                  if (token) {
                    await sendPushNotification({
                      token,
                      title: '❌ Teklifin Reddedildi',
                      body: 'Müşteri başka bir pastacının teklifini kabul etti.',
                      data: { type: 'offer_rejected', orderId: orderId as string },
                    });
                  }
                } catch { /* push hatası akışı engellemesin */ }
              });

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

            // Pastacıya ret bildirimi (düzenlenebilir şablon)
            notifyFromTemplate({
              userId: offer.baker_id,
              key: 'offer_rejected',
              vars: { title: order?.title ?? 'Siparişiniz' },
              fallback: {
                title: '❌ Teklifiniz Reddedildi',
                body: `${order?.title ?? 'Siparişiniz'} için teklifiniz reddedildi.`,
              },
              data: { orderId: orderId as string },
              targetRole: 'baker',
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
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          activeOpacity={0.6}
        >
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
          renderItem={({ item, index }) => (
            <OfferCard
              offer={item}
              rank={index + 1}
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
            <>
              {order?.status === 'accepted' && (
                <View style={[styles.acceptedBanner, { backgroundColor: C.success + '18', borderColor: C.success + '66' }]}>
                  <Text style={[styles.acceptedBannerTitle, { color: C.success }]}>
                    ✅ Bu sipariş için bir teklif kabul ettiniz
                  </Text>
                  <Text style={[styles.acceptedBannerSubtitle, { color: C.text }]}>
                    Diğer teklifler artık aktif değil.
                  </Text>
                </View>
              )}
              <Text style={[styles.listHeader, { color: C.textSecondary }]}>
                {offers.filter(o => o.status !== 'rejected').length} teklif
                {offers.filter(o => o.status === 'rejected').length > 0 &&
                  ` · ${offers.filter(o => o.status === 'rejected').length} reddedildi`}
                {' '}· puana göre sıralı
              </Text>
            </>
          }
        />
      )}
    </SafeAreaView>
  );
}

function OfferCard({
  offer, rank, isAccepted, isOrderAccepted, onAccept, onReject, onMessage, onViewProfile, isAccepting, isRejecting, colors: C,
}: {
  offer: Offer;
  rank: number;
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
  const rating = offer.shop?.rating ?? 0;
  const reviewCount = offer.shop?.review_count ?? 0;

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

      {/* Dükkan + sıra + puan */}
      <View style={styles.shopRow}>
        <View style={[styles.rankBadge, { backgroundColor: C.primary + '18', borderColor: C.primary + '44' }]}>
          <Text style={[styles.rankText, { color: C.primary }]}>{rank}.</Text>
        </View>
        <TouchableOpacity style={{ flex: 1 }} onPress={onViewProfile} activeOpacity={0.6}>
          <Text style={[styles.shopName, { color: C.text }]} numberOfLines={1}>
            {offer.shop?.name ?? 'Pastacı'} ›
          </Text>
          <View style={styles.metaLine}>
            {rating > 0 ? (
              <Text style={[styles.metaLineText, { color: C.textSecondary }]}>
                ⭐ {rating.toFixed(1)}
                {reviewCount > 0 ? ` (${reviewCount} yorum)` : ''}
              </Text>
            ) : (
              <Text style={[styles.metaLineText, { color: C.placeholder }]}>
                Henüz puan yok
              </Text>
            )}
            <Text style={[styles.metaLineDot, { color: C.placeholder }]}>·</Text>
            <Text style={[styles.metaLinePrice, { color: C.primary }]}>₺{offer.price}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Süre */}
      {offer.estimated_days ? (
        <Text style={[styles.days, { color: C.textSecondary }]}>
          📅 {offer.estimated_days} gün içinde teslim
        </Text>
      ) : null}

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
  rankBadge: {
    minWidth: 36, height: 36, borderRadius: Radius.sm,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  rankText: { fontSize: FontSize.md, fontWeight: '800' },
  shopName: { fontSize: FontSize.md, fontWeight: '700' },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  metaLineText: { fontSize: FontSize.sm, fontWeight: '600' },
  metaLineDot: { fontSize: FontSize.sm, fontWeight: '700' },
  metaLinePrice: { fontSize: FontSize.md, fontWeight: '800' },
  days: { fontSize: FontSize.sm },
  acceptedBanner: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: 4,
  },
  acceptedBannerTitle: { fontSize: FontSize.md, fontWeight: '800' },
  acceptedBannerSubtitle: { fontSize: FontSize.sm },
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

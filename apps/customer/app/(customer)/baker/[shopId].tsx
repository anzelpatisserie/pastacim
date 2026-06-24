/**
 * Müşteri → Pastacı Profil Sayfası
 * Keşfet ekranından bir pastacıya tıklanınca açılır.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Image, RefreshControl, Linking,
  LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { supabase, useAuth, useThemeColors, Spacing, Radius, FontSize, ReportModal } from '@pastacim/shared';
import type { Database } from '@pastacim/shared';

function normalizeMapsUrl(url: string, name = ''): string {
  const q = encodeURIComponent(name);
  const oldFormat = url.match(/[?&]q=place_id:([^&]+)/);
  if (oldFormat) return `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=${oldFormat[1]}`;
  if (url.startsWith('place_id:')) return `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=${url.slice(9)}`;
  return url;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

type Shop = Database['public']['Tables']['pastry_shops']['Row'] & {
  owner?: { avatar_url: string | null; full_name: string | null; created_at: string | null } | null;
};

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  is_anonymous: boolean;
  customer: { full_name: string | null } | null;
};

export default function CustomerBakerProfileScreen() {
  const C = useThemeColors();
  const { shopId } = useLocalSearchParams<{ shopId: string }>();
  const { user } = useAuth();

  const [shop, setShop] = useState<Shop | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  // Müşterinin bu pastacıyla aktif siparişi var mı?
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [pendingOrderCount, setPendingOrderCount] = useState(0);
  const [ownerCreatedAt, setOwnerCreatedAt] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  const toggleReviews = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setReviewsOpen((v) => !v);
  };

  const loadData = useCallback(async (refresh = false) => {
    if (!shopId) return;
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);

    // Dükkan bilgisi + sahip avatar + yorumlar paralel
    const [shopRes, revRes] = await Promise.all([
      _db.from('pastry_shops').select('*, owner:users!user_id(avatar_url, full_name, created_at)').eq('id', shopId).single(),
      _db
        .from('reviews')
        .select('id, rating, comment, created_at, is_anonymous, customer:users!customer_id(full_name)')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (shopRes.data) {
      setShop(shopRes.data as Shop);
      // owner join'den created_at gelmezse doğrudan users tablosundan çek
      const ownerCat = (shopRes.data as Shop).owner?.created_at;
      if (ownerCat) {
        setOwnerCreatedAt(ownerCat);
      } else if ((shopRes.data as { user_id?: string }).user_id) {
        const { data: userData } = await _db
          .from('users')
          .select('created_at')
          .eq('id', (shopRes.data as { user_id: string }).user_id)
          .single();
        setOwnerCreatedAt(userData?.created_at ?? null);
      }
    }
    setReviews((revRes.data ?? []) as Review[]);

    if (refresh) setIsRefreshing(false);
    else setIsLoading(false);
  }, [shopId]);

  // Müşterinin bu pastacıyla aktif sipariş/teklif durumu
  const loadOrderState = useCallback(async () => {
    if (!user?.id || !shopId) return;

    // Bu dükkanla accepted/in_progress/ready durumunda sipariş var mı?
    const { data: activeOffers } = await _db
      .from('offers')
      .select('order_id, order:orders!order_id(id, status, customer_id)')
      .eq('shop_id', shopId)
      .in('status', ['accepted'])
      .limit(1);

    const activeOffer = (activeOffers ?? []).find(
      (o: { order: { customer_id: string; id: string; status: string } | null }) =>
        o.order?.customer_id === user.id &&
        ['accepted', 'in_progress', 'ready'].includes(o.order?.status ?? '')
    );
    setActiveOrderId(activeOffer?.order?.id ?? null);

    // Bu pastacıdan teklif bekleyen sipariş sayısı
    const { count } = await _db
      .from('offers')
      .select('id', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .eq('status', 'pending');
    setPendingOrderCount(count ?? 0);
  }, [user?.id, shopId]);

  // Her odaklanmada hem veri hem sipariş durumunu tazele
  useFocusEffect(useCallback(() => {
    loadData();
    loadOrderState();
  }, [loadData, loadOrderState]));

  // Realtime: yorum eklenince veya puan değişince anında güncelle
  useEffect(() => {
    if (!shopId) return;

    const channel = supabase
      .channel(`baker-profile:${shopId}`)
      // Yeni yorum
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reviews', filter: `shop_id=eq.${shopId}` },
        () => { loadData(); }
      )
      // Puan güncellendi (trigger)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pastry_shops', filter: `id=eq.${shopId}` },
        (payload) => {
          const updated = payload.new as Shop;
          setShop((prev) => prev ? { ...prev, rating: updated.rating, review_count: updated.review_count } : prev);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [shopId, loadData]);

  if (isLoading) {
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
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!shop) {
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
        </View>
        <View style={styles.centered}>
          <Text style={{ fontSize: 48 }}>🏪</Text>
          <Text style={[styles.emptyTitle, { color: C.text }]}>Dükkan bulunamadı</Text>
        </View>
      </SafeAreaView>
    );
  }

  const stars = shop.rating > 0
    ? `⭐ ${shop.rating.toFixed(1)}`
    : 'Henüz puan yok';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          activeOpacity={0.6}
        >
          <Text style={[styles.back, { color: C.primary }]}>← Geri</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: C.text }]} numberOfLines={1}>
          {shop.name}
        </Text>
        <TouchableOpacity
          onPress={() => setShowReport(true)}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          activeOpacity={0.6}
          style={{ width: 48, alignItems: 'flex-end' }}
        >
          <Text style={{ fontSize: 18 }}>⚠️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => { loadData(true); loadOrderState(); }}
            tintColor={C.primary}
          />
        }
      >
        {/* Kapak Fotoğrafı + Profil Avatar overlay */}
        <View style={styles.coverWrap}>
          {shop.cover_image_url ? (
            <Image source={{ uri: shop.cover_image_url }} style={styles.cover} resizeMode="cover" />
          ) : (
            <View style={[styles.coverPlaceholder, { backgroundColor: C.skeleton }]}>
              <Text style={styles.coverEmoji}>🎂</Text>
            </View>
          )}
          <View style={[styles.avatarOverlay, { backgroundColor: C.card, borderColor: C.card }]}>
            <View style={[styles.avatarCircle, { backgroundColor: C.primary + '22' }]}>
              {shop.owner?.avatar_url ? (
                <Image source={{ uri: shop.owner.avatar_url }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarEmoji}>👨‍🍳</Text>
              )}
            </View>
          </View>
        </View>

        {/* Temel Bilgiler */}
        <View style={[styles.infoCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[styles.shopName, { color: C.text }]}>{shop.name}</Text>
          {shop.description && (
            <Text style={[styles.shopDesc, { color: C.textSecondary }]}>{shop.description}</Text>
          )}
          <View style={styles.statsRow}>
            <View style={[styles.statChip, { backgroundColor: C.background }]}>
              <Text style={[styles.statText, { color: C.text }]}>{stars}</Text>
            </View>
            {shop.review_count > 0 && (
              <View style={[styles.statChip, { backgroundColor: C.background }]}>
                <Text style={[styles.statText, { color: C.text }]}>💬 {shop.review_count} yorum</Text>
              </View>
            )}
            {pendingOrderCount > 0 && (
              <View style={[styles.statChip, { backgroundColor: C.primary + '18' }]}>
                <Text style={[styles.statText, { color: C.primary }]}>🔥 {pendingOrderCount} aktif teklif</Text>
              </View>
            )}
            {ownerCreatedAt && (
              <View style={[styles.statChip, { backgroundColor: C.background }]}>
                <Text style={[styles.statText, { color: C.textSecondary }]}>
                  🗓️ {Math.floor((Date.now() - new Date(ownerCreatedAt).getTime()) / 86_400_000)}g üye
                </Text>
              </View>
            )}
          </View>
          {shop.address && (
            <Text style={[styles.address, { color: C.textSecondary }]}>📍 {shop.address}</Text>
          )}

          {/* Google Bilgileri */}
          {(shop.google_rating != null || (shop.google_review_count ?? 0) > 0 || shop.google_maps_url) && (
            <View style={[styles.googleRow, { backgroundColor: C.background }]}>
              <Text style={{ fontSize: 14 }}>🌐</Text>
              <Text style={[styles.googleLabel, { color: C.text }]}>Google</Text>
              {shop.google_rating != null && (
                <View style={[styles.statChip, { backgroundColor: '#F5A623' + '20' }]}>
                  <Text style={[styles.statText, { color: '#F5A623' }]}>★ {shop.google_rating.toFixed(1)}</Text>
                </View>
              )}
              {(shop.google_review_count ?? 0) > 0 && (
                <Text style={[styles.googleReviewText, { color: C.textSecondary }]}>
                  ({shop.google_review_count} yorum)
                </Text>
              )}
              {shop.google_maps_url && (
                <TouchableOpacity onPress={() => Linking.openURL(normalizeMapsUrl(shop.google_maps_url!, shop.name))}>
                  <Text style={[styles.googleMapsLink, { color: C.primary }]}>Haritada Gör →</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Sosyal Medya Linkleri */}
          {(shop.instagram_url || shop.facebook_url || shop.tiktok_url || shop.youtube_url) && (
            <View style={styles.socialRow}>
              {shop.instagram_url && (
                <TouchableOpacity
                  style={[styles.socialBtn, { backgroundColor: '#E1306C' + '18', borderColor: '#E1306C' + '44' }]}
                  onPress={() => Linking.openURL(shop.instagram_url!)}
                >
                  <Text style={[styles.socialBtnText, { color: '#E1306C' }]}>📸 Instagram</Text>
                </TouchableOpacity>
              )}
              {shop.facebook_url && (
                <TouchableOpacity
                  style={[styles.socialBtn, { backgroundColor: '#1877F2' + '18', borderColor: '#1877F2' + '44' }]}
                  onPress={() => Linking.openURL(shop.facebook_url!)}
                >
                  <Text style={[styles.socialBtnText, { color: '#1877F2' }]}>👍 Facebook</Text>
                </TouchableOpacity>
              )}
              {shop.tiktok_url && (
                <TouchableOpacity
                  style={[styles.socialBtn, { backgroundColor: C.border + '40', borderColor: C.border }]}
                  onPress={() => Linking.openURL(shop.tiktok_url!)}
                >
                  <Text style={[styles.socialBtnText, { color: C.text }]}>🎵 TikTok</Text>
                </TouchableOpacity>
              )}
              {shop.youtube_url && (
                <TouchableOpacity
                  style={[styles.socialBtn, { backgroundColor: '#FF0000' + '18', borderColor: '#FF0000' + '44' }]}
                  onPress={() => Linking.openURL(shop.youtube_url!)}
                >
                  <Text style={[styles.socialBtnText, { color: '#FF0000' }]}>▶ YouTube</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Yorumlar (Collapsible) */}
        {reviews.length > 0 && (
          <View style={[styles.reviewsCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <TouchableOpacity style={styles.reviewsHeader} onPress={toggleReviews} activeOpacity={0.7}>
              <Text style={[styles.sectionTitle, { color: C.text }]}>
                💬 Müşteri Yorumları ({reviews.length})
              </Text>
              <Text style={[styles.chevron, { color: C.textSecondary }]}>
                {reviewsOpen ? '▾' : '▸'}
              </Text>
            </TouchableOpacity>
            {reviewsOpen && reviews.map((r, idx) => (
              <View
                key={r.id}
                style={[styles.reviewItem, idx > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}
              >
                <View style={styles.reviewTop}>
                  <Text style={[styles.reviewName, { color: C.text }]}>
                    {r.is_anonymous ? 'Anonim' : (r.customer?.full_name ?? 'Müşteri')}
                  </Text>
                  <Text style={styles.reviewStars}>
                    {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                  </Text>
                </View>
                {r.comment && (
                  <Text style={[styles.reviewComment, { color: C.textSecondary }]}>{r.comment}</Text>
                )}
                <Text style={[styles.reviewDate, { color: C.placeholder }]}>
                  {new Date(r.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </View>
            ))}
          </View>
        )}

        {reviews.length === 0 && (
          <View style={[styles.noReviews, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={styles.noReviewsEmoji}>💬</Text>
            <Text style={[styles.noReviewsText, { color: C.textSecondary }]}>
              Henüz yorum yok. İlk siparişi veren sen ol!
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Alt CTA — sadece aktif sipariş varsa göster */}
      {activeOrderId && (
        <View style={[styles.ctaBar, { backgroundColor: C.card, borderTopColor: C.border }]}>
          <TouchableOpacity
            style={[styles.ctaBtn, { backgroundColor: C.success }]}
            onPress={() => router.push({ pathname: '/(customer)/offers/[orderId]', params: { orderId: activeOrderId } })}
          >
            <Text style={styles.ctaBtnText}>✅ Bu Teklifi İncele →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Şikayet Et */}
      <ReportModal
        visible={showReport}
        onClose={() => setShowReport(false)}
        targetType="shop"
        targetId={shopId}
        appName="customer"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1,
  },
  back: { fontSize: FontSize.md, fontWeight: '600' },
  headerTitle: { fontSize: FontSize.md, fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: Spacing.sm },
  coverWrap: { position: 'relative', marginBottom: 36 },
  cover: { width: '100%', height: 220 },
  coverPlaceholder: { width: '100%', height: 180, alignItems: 'center', justifyContent: 'center' },
  coverEmoji: { fontSize: 64 },
  avatarOverlay: {
    position: 'absolute', bottom: -36, left: Spacing.md,
    borderRadius: 44, borderWidth: 4, padding: 0,
  },
  avatarCircle: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarEmoji: { fontSize: 40 },
  reviewsHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  chevron: { fontSize: 18, fontWeight: '700' },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700', textAlign: 'center' },
  infoCard: {
    margin: Spacing.md, borderRadius: Radius.lg, borderWidth: 1,
    padding: Spacing.md, gap: Spacing.sm,
  },
  shopName: { fontSize: FontSize.xl, fontWeight: '800' },
  shopDesc: { fontSize: FontSize.sm, lineHeight: 20 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  statChip: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full },
  statText: { fontSize: FontSize.sm, fontWeight: '600' },
  address: { fontSize: FontSize.sm },
  reviewsCard: {
    marginHorizontal: Spacing.md, marginBottom: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm,
  },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700' },
  reviewItem: { paddingTop: Spacing.sm, gap: 4 },
  reviewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewName: { fontSize: FontSize.sm, fontWeight: '700', flex: 1 },
  reviewStars: { fontSize: 13, color: '#F5A623' },
  reviewComment: { fontSize: FontSize.sm, lineHeight: 18 },
  reviewDate: { fontSize: FontSize.xs },
  noReviews: {
    marginHorizontal: Spacing.md, borderRadius: Radius.lg, borderWidth: 1,
    padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm,
  },
  noReviewsEmoji: { fontSize: 32 },
  noReviewsText: { fontSize: FontSize.sm, textAlign: 'center' },
  ctaBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopWidth: 1, padding: Spacing.md, paddingBottom: 32,
  },
  ctaBtn: {
    paddingVertical: 16, borderRadius: Radius.full,
    alignItems: 'center',
    shadowColor: '#D4526E', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  ctaBtnText: { color: '#FFF', fontSize: FontSize.md, fontWeight: '700' },
  googleRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    gap: 6, borderRadius: Radius.md, padding: Spacing.sm,
  },
  googleLabel: { fontSize: FontSize.sm, fontWeight: '600' },
  googleReviewText: { fontSize: FontSize.xs },
  googleMapsLink: { fontSize: FontSize.xs, fontWeight: '700', textDecorationLine: 'underline' },
  socialRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  socialBtn: {
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1,
  },
  socialBtnText: { fontSize: FontSize.xs, fontWeight: '700' },
});

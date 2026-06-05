import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  TextInput, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase, useAuth, useThemeColors, Spacing, Radius, FontSize } from '@pastacim/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

type ReviewData = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  is_anonymous: boolean;
};

export default function ReviewScreen() {
  const C = useThemeColors();
  const { user, profile } = useAuth();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  const [orderTitle, setOrderTitle] = useState('');
  const [shopName, setShopName] = useState('');
  const [shopId, setShopId] = useState<string | null>(null);
  const [bakerId, setBakerId] = useState<string | null>(null);
  const [existingReview, setExistingReview] = useState<ReviewData | null>(null);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!orderId || !user?.id) return;
    loadOrderInfo();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, user?.id]);

  const loadOrderInfo = async () => {
    setIsLoading(true);

    // Sipariş + kabul edilen teklif + dükkan bilgisi
    const { data: order } = await _db
      .from('orders')
      .select(`
        title,
        selected_offer_id,
        offer:offers!selected_offer_id(baker_id, shop_id, shop:pastry_shops!shop_id(name))
      `)
      .eq('id', orderId)
      .eq('customer_id', user!.id)
      .single();

    if (order) {
      setOrderTitle(order.title ?? '');
      const offer = Array.isArray(order.offer) ? order.offer[0] : order.offer;
      if (offer) {
        setBakerId(offer.baker_id ?? null);
        setShopId(offer.shop_id ?? null);
        const shop = Array.isArray(offer.shop) ? offer.shop[0] : offer.shop;
        setShopName(shop?.name ?? 'Pastacı');
      }
    }

    // Daha önce yorum yapıldı mı?
    const { data: review } = await _db
      .from('reviews')
      .select('id, rating, comment, created_at, is_anonymous')
      .eq('order_id', orderId)
      .eq('customer_id', user!.id)
      .maybeSingle();

    if (review) {
      setExistingReview(review as ReviewData);
      setRating(review.rating);
      setComment(review.comment ?? '');
      setIsAnonymous(review.is_anonymous ?? false);
    }

    setIsLoading(false);
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('Puan Gerekli', 'Lütfen bir puan seçin.');
      return;
    }
    if (!shopId || !bakerId) {
      Alert.alert('Hata', 'Sipariş bilgisi bulunamadı.');
      return;
    }

    setIsSubmitting(true);
    const { error } = await _db.from('reviews').insert({
      order_id:    orderId,
      customer_id: user!.id,
      baker_id:    bakerId,
      shop_id:     shopId,
      rating,
      comment: comment.trim() || null,
      is_anonymous: isAnonymous,
    });
    setIsSubmitting(false);

    if (error) {
      if (error.code === '23505') {
        Alert.alert('Zaten Yorumlandı', 'Bu sipariş için daha önce yorum yapmışsınız.');
      } else {
        Alert.alert('Hata', 'Yorum gönderilemedi. Lütfen tekrar deneyin.');
      }
      return;
    }

    Alert.alert(
      '🌟 Teşekkürler!',
      `"${shopName}" için yorumunuz kaydedildi.`,
      [{ text: 'Tamam', onPress: () => router.back() }]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const isReadOnly = existingReview !== null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: C.border }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            activeOpacity={0.6}
          >
            <Text style={[styles.backText, { color: C.primary }]}>← Geri</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: C.text }]}>
            {isReadOnly ? 'Yorumunuz' : 'Yorum Yaz'}
          </Text>
          <View style={{ width: 60 }} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Sipariş bilgisi */}
          <View style={[styles.orderCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[styles.shopName, { color: C.text }]}>🎂 {shopName}</Text>
            <Text style={[styles.orderTitle, { color: C.textSecondary }]}>{orderTitle}</Text>
          </View>

          {/* Yıldız Rating */}
          <Text style={[styles.sectionLabel, { color: C.text }]}>Puan</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => !isReadOnly && setRating(star)}
                disabled={isReadOnly}
                activeOpacity={isReadOnly ? 1 : 0.7}
              >
                <Text style={[styles.star, { color: star <= rating ? '#F5A623' : C.border }]}>
                  ★
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {rating > 0 && (
            <Text style={[styles.ratingLabel, { color: C.textSecondary }]}>
              {['', 'Berbattı 😠', 'Kötüydü 😕', 'İyiydi 😊', 'Harikaydı 😍', 'Mükemmeldi 🌟'][rating]}
            </Text>
          )}

          {/* Yorum */}
          <Text style={[styles.sectionLabel, { color: C.text }]}>Yorum (isteğe bağlı)</Text>
          <TextInput
            style={[
              styles.commentInput,
              {
                backgroundColor: C.card,
                borderColor: C.border,
                color: C.text,
              },
            ]}
            placeholder="Deneyiminizi paylaşın…"
            placeholderTextColor={C.placeholder}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            value={comment}
            onChangeText={setComment}
            editable={!isReadOnly}
          />

          {/* Anonim yorum toggle */}
          <View style={[styles.anonymousRow, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.anonymousLabel, { color: C.text }]}>İsmimi gizle</Text>
              <Text style={[styles.anonymousSub, { color: C.textSecondary }]}>
                {isAnonymous ? 'Yorumun "Anonim" olarak görünür' : `Yorumun "${profile?.full_name ?? 'isminizle'}" görünür`}
              </Text>
            </View>
            <Switch
              value={isAnonymous}
              onValueChange={setIsAnonymous}
              disabled={isReadOnly}
              trackColor={{ false: C.border, true: C.primary }}
              thumbColor="#FFF"
            />
          </View>

          {isReadOnly ? (
            <View style={[styles.readOnlyBadge, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[styles.readOnlyText, { color: C.textSecondary }]}>
                ✅ Bu sipariş için yorumunuz mevcut.
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: C.primary }, isSubmitting && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={isSubmitting || rating === 0}
            >
              {isSubmitting
                ? <ActivityIndicator color="#FFF" />
                : <Text style={styles.submitBtnText}>🌟 Yorumu Gönder</Text>
              }
            </TouchableOpacity>
          )}

          {/* Atla butonu */}
          {!isReadOnly && (
            <TouchableOpacity style={styles.skipBtn} onPress={() => router.back()}>
              <Text style={[styles.skipText, { color: C.textSecondary }]}>Şimdi değil, atla →</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
        </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1,
  },
  backBtn: { width: 60 },
  backText: { fontSize: FontSize.sm, fontWeight: '600' },
  title: { fontSize: FontSize.lg, fontWeight: '800' },
  scroll: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: 60 },
  orderCard: {
    borderRadius: Radius.lg, borderWidth: 1,
    padding: Spacing.md, gap: 4,
  },
  shopName: { fontSize: FontSize.lg, fontWeight: '700' },
  orderTitle: { fontSize: FontSize.sm },
  sectionLabel: { fontSize: FontSize.sm, fontWeight: '700', marginBottom: -Spacing.sm },
  starsRow: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'center' },
  star: { fontSize: 48 },
  ratingLabel: { textAlign: 'center', fontSize: FontSize.sm, marginTop: -Spacing.sm },
  commentInput: {
    borderWidth: 1, borderRadius: Radius.lg,
    padding: Spacing.md, minHeight: 100,
    fontSize: FontSize.md,
  },
  submitBtn: {
    paddingVertical: 14, borderRadius: Radius.full, alignItems: 'center',
  },
  submitBtnText: { color: '#FFF', fontSize: FontSize.md, fontWeight: '700' },
  skipBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  skipText: { fontSize: FontSize.sm },
  readOnlyBadge: {
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, alignItems: 'center',
  },
  readOnlyText: { fontSize: FontSize.sm },
  anonymousRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md,
  },
  anonymousLabel: { fontSize: FontSize.md, fontWeight: '700' },
  anonymousSub: { fontSize: FontSize.xs, marginTop: 2 },
});

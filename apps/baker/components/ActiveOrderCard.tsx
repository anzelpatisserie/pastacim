import { useState } from 'react';
import {
  View, Text, StyleSheet, Linking,
  TouchableOpacity, ActivityIndicator, Alert, Image,
} from 'react-native';
import { router } from 'expo-router';
import { supabase, notifyFromTemplate, sendAppEmail, useThemeColors, Spacing, Radius, FontSize, safeAvatarUri } from '@pastacim/shared';
import type { Database } from '@pastacim/shared';

export type ActiveOffer = Database['public']['Tables']['offers']['Row'] & {
  order: (Database['public']['Tables']['orders']['Row'] & {
    customer: { id: string; full_name: string | null; phone: string | null; avatar_url: string | null } | null;
  }) | null;
};

type OrderStatus = Database['public']['Enums']['order_status'];

const ORDER_STATUS_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  accepted:    { label: 'Kabul Edildi',      color: '#48BB78', emoji: '✅' },
  in_progress: { label: 'Hazırlanıyor',      color: '#9F7AEA', emoji: '👨‍🍳' },
  ready:       { label: 'Teslimata Hazır',   color: '#4299E1', emoji: '📦' },
  completed:   { label: 'Tamamlandı',        color: '#68D391', emoji: '🎂' },
  cancelled:   { label: 'İptal Edildi',      color: '#FC8181', emoji: '❌' },
};

// Aktif: kabul edilmiş + henüz tamamlanmamış/iptal edilmemiş
export function isActiveOffer(offer: ActiveOffer): boolean {
  const os = offer.order?.status;
  if (offer.status !== 'accepted') return false;
  if (!os) return false;
  return ['accepted', 'in_progress', 'ready'].includes(os);
}

/**
 * Kabul edilmiş bir siparişin kartı. Durum-geçiş butonu (Hazırlamaya Başla →
 * Teslimata Hazır → Teslim Ettim) ile bildirim/e-posta tetiklemesini içerir.
 * Mutasyon sonrası `onChanged` ile üst ekran listeyi tazeleyebilir.
 */
export function ActiveOrderCard({
  offer, onChanged,
}: {
  offer: ActiveOffer;
  onChanged?: () => void;
}) {
  const C = useThemeColors();
  const [isProgressing, setIsProgressing] = useState(false);

  const isAccepted  = offer.status === 'accepted';
  const orderStatus = offer.order?.status;
  const active      = isActiveOffer(offer);

  const handleSetStatus = async (newStatus: OrderStatus) => {
    if (!offer.order) return;
    setIsProgressing(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('orders')
      .update({ status: newStatus })
      .eq('id', offer.order.id);
    setIsProgressing(false);

    if (error) {
      Alert.alert('Hata', error.message ?? 'Durum güncellenemedi.');
      return;
    }

    const customerId = offer.order.customer_id;
    const orderTitle = offer.order.title;
    const orderId = offer.order.id;
    if (newStatus === 'in_progress') {
      notifyFromTemplate({
        userId: customerId,
        key: 'order_in_progress',
        vars: { title: orderTitle },
        fallback: { title: '🍳 Siparişin Hazırlanıyor!', body: `"${orderTitle}" siparişin hazırlanmaya başlandı.` },
        data: { orderId },
        targetRole: 'customer',
      }).catch(() => {});
    } else if (newStatus === 'ready') {
      notifyFromTemplate({
        userId: customerId,
        key: 'order_ready',
        vars: { title: orderTitle },
        fallback: { title: '📦 Siparişin Teslimata Hazır!', body: `"${orderTitle}" siparişin teslim almaya hazır.` },
        data: { orderId },
        targetRole: 'customer',
      }).catch(() => {});
      sendAppEmail(customerId, 'order_ready', { orderTitle, orderId });
    } else if (newStatus === 'completed') {
      // #13: Müşteri zaten yorum yaptıysa "teslim edildi" bildirimini ve yorum
      // teşvik e-postasını GÖNDERME (yorum yapmış müşteriyi rahatsız etmeyelim).
      const { data: existingReview } = await supabase
        .from('reviews')
        .select('id')
        .eq('order_id', orderId)
        .maybeSingle();
      if (!existingReview) {
        notifyFromTemplate({
          userId: customerId,
          key: 'order_delivered',
          vars: { title: orderTitle },
          fallback: { title: '🎂 Siparişin Teslim Edildi', body: `"${orderTitle}" siparişin teslim edildi olarak işaretlendi. Teslim almadıysan sipariş kartından geri alabilirsin.` },
          data: { orderId },
          targetRole: 'customer',
        }).catch(() => {});
        sendAppEmail(customerId, 'review_encourage', { orderTitle, orderId });
      }
    }

    onChanged?.();
  };

  const handleHide = () => {
    Alert.alert(
      '🗑️ Listeden Kaldır',
      'Bu teklif Siparişlerim listesinden kaldırılsın mı? Yalnızca sizin görünümünüzden silinir.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Kaldır', style: 'destructive',
          onPress: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any)
              .rpc('hide_order_for_me', { p_order_id: offer.order?.id });
            if (error) { Alert.alert('Hata', 'Kaldırılamadı.'); return; }
            onChanged?.();
          },
        },
      ]
    );
  };

  // Sipariş durumuna göre badge — kabul edilmiş tekliflerde sipariş statüsünü gösterir
  const singleBadge = (() => {
    if (orderStatus === 'cancelled') return ORDER_STATUS_LABELS.cancelled;
    if (isAccepted && orderStatus) return ORDER_STATUS_LABELS[orderStatus];
    return null;
  })();

  const nextAction: { label: string; status: OrderStatus; color: string } | null = (() => {
    if (!isAccepted) return null;
    if (orderStatus === 'accepted')    return { label: '🍳 Hazırlamaya Başla', status: 'in_progress', color: '#9F7AEA' };
    if (orderStatus === 'in_progress') return { label: '📦 Teslimata Hazır',   status: 'ready',       color: '#4299E1' };
    if (orderStatus === 'ready')       return { label: '🎂 Teslim Ettim',      status: 'completed',   color: '#68D391' };
    return null;
  })();

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: C.card,
          borderColor: isAccepted && active ? C.success : C.border,
          borderWidth: isAccepted && active ? 2 : 1,
        },
      ]}
      activeOpacity={0.85}
      onPress={() =>
        offer.order?.id &&
        router.push({ pathname: '/(baker)/offer/[orderId]', params: { orderId: offer.order.id } })
      }
    >
      <View style={styles.cardTop}>
        <Text style={[styles.orderTitle, { color: C.text }]} numberOfLines={1}>
          {offer.order?.title ?? 'Sipariş'}
        </Text>
        {singleBadge && (
          <View style={[styles.statusBadge, { backgroundColor: singleBadge.color + '22' }]}>
            <Text style={[styles.statusText, { color: singleBadge.color }]}>
              {'emoji' in singleBadge && singleBadge.emoji ? `${singleBadge.emoji} ` : ''}{singleBadge.label}
            </Text>
          </View>
        )}
      </View>

      <Text style={[styles.price, { color: C.primary }]}>₺{offer.price}</Text>

      {offer.order?.customer?.full_name && (
        <View style={styles.customerRow}>
          {safeAvatarUri(offer.order.customer.avatar_url) ? (
            <Image
              source={{ uri: safeAvatarUri(offer.order.customer.avatar_url)! }}
              style={styles.customerAvatar}
            />
          ) : (
            <Text style={styles.customerAvatarEmoji}>👤</Text>
          )}
          <Text style={[styles.customer, { color: C.textSecondary }]}>
            {offer.order.customer.full_name}
          </Text>
        </View>
      )}
      {active && offer.order?.customer?.phone ? (
        <TouchableOpacity onPress={() => Linking.openURL(`tel:${offer.order!.customer!.phone}`)} activeOpacity={0.6}>
          <Text style={[styles.customer, { color: C.primary, fontWeight: '700' }]}>
            📞 {offer.order.customer.phone}
          </Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.metaRow}>
        {offer.order?.serving_size && (
          <Text style={[styles.metaText, { color: C.textSecondary }]}>👥 {offer.order.serving_size} kişilik</Text>
        )}
        {offer.order?.delivery_date && (
          <Text style={[styles.metaText, { color: C.textSecondary }]}>
            📅 {new Date(offer.order.delivery_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
          </Text>
        )}
      </View>

      {offer.order && (
        <View style={styles.btnCol}>
          {nextAction && (
            <TouchableOpacity
              style={[styles.progressBtn, { backgroundColor: nextAction.color }]}
              onPress={() => handleSetStatus(nextAction.status)}
              disabled={isProgressing}
            >
              {isProgressing
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={styles.progressBtnText}>{nextAction.label}</Text>
              }
            </TouchableOpacity>
          )}

          <View style={styles.btnRow}>
            {/* Mesaj butonu yalnızca mesajlaşma açıkken (aktif sipariş) görünür;
                kapalı/tamamlanan siparişte sohbet kilitli olduğundan gizlenir. */}
            {active && (
              <TouchableOpacity
                style={[styles.msgBtn, { backgroundColor: C.primary, flex: 1 }]}
                onPress={() => router.push({
                  pathname: '/messages/[conversationId]',
                  params: { conversationId: offer.order!.customer_id, orderId: offer.order!.id },
                })}
              >
                <Text style={styles.msgBtnText}>💬 Müşteriye Mesaj</Text>
              </TouchableOpacity>
            )}

            {!active && (
              <TouchableOpacity
                style={[styles.iconBtn, { borderColor: C.border }]}
                onPress={handleHide}
              >
                <Text style={[styles.iconBtnText, { color: C.textSecondary }]}>🗑️</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm, marginTop: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  orderTitle: { fontSize: FontSize.md, fontWeight: '700', flex: 1 },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  statusText: { fontSize: FontSize.xs, fontWeight: '700' },
  price: { fontSize: FontSize.xxl, fontWeight: '800' },
  customer: { fontSize: FontSize.sm, flexShrink: 1 },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  customerAvatar: { width: 22, height: 22, borderRadius: 11, flexShrink: 0 },
  customerAvatarEmoji: { fontSize: 16 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  metaText: { fontSize: FontSize.xs },
  btnCol: { gap: Spacing.sm },
  btnRow: { flexDirection: 'row', gap: Spacing.sm },
  progressBtn: { paddingVertical: 11, borderRadius: Radius.full, alignItems: 'center' },
  progressBtnText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '700' },
  msgBtn: { paddingVertical: 10, borderRadius: Radius.full, alignItems: 'center' },
  msgBtnText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '700' },
  iconBtn: { paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: Radius.full, borderWidth: 1.5, alignItems: 'center' },
  iconBtnText: { fontSize: FontSize.sm, fontWeight: '700' },
});

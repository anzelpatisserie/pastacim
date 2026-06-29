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
 * Kabul edilmiş bir siparişin kompakt kartı. Durum-geçiş butonu (Hazırlamaya Başla →
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

  const avatarUri = safeAvatarUri(offer.order?.customer?.avatar_url);

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
      {/* Satır 1: Başlık · Fiyat · Durum */}
      <View style={styles.topRow}>
        <Text style={[styles.orderTitle, { color: C.text }]} numberOfLines={1}>
          {offer.order?.title ?? 'Sipariş'}
        </Text>
        <Text style={[styles.price, { color: C.primary }]}>₺{offer.price}</Text>
        {singleBadge && (
          <View style={[styles.statusBadge, { backgroundColor: singleBadge.color + '22' }]}>
            <Text style={[styles.statusText, { color: singleBadge.color }]}>
              {'emoji' in singleBadge && singleBadge.emoji ? `${singleBadge.emoji} ` : ''}{singleBadge.label}
            </Text>
          </View>
        )}
      </View>

      {/* Satır 2: Avatar · Müşteri · Meta (kişi sayısı, tarih) */}
      {offer.order?.customer?.full_name && (
        <View style={styles.infoRow}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <Text style={styles.avatarEmoji}>👤</Text>
          )}
          <Text style={[styles.customerName, { color: C.textSecondary }]} numberOfLines={1}>
            {offer.order.customer.full_name}
          </Text>
          {offer.order.serving_size ? (
            <Text style={[styles.metaText, { color: C.placeholder }]}>
              {' '}· 👥 {offer.order.serving_size}
            </Text>
          ) : null}
          {offer.order.delivery_date ? (
            <Text style={[styles.metaText, { color: C.placeholder }]}>
              {' '}· 📅 {new Date(offer.order.delivery_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
            </Text>
          ) : null}
        </View>
      )}

      {/* Telefon (yalnızca aktif sipariş) */}
      {active && offer.order?.customer?.phone ? (
        <TouchableOpacity
          onPress={() => Linking.openURL(`tel:${offer.order!.customer!.phone}`)}
          activeOpacity={0.6}
        >
          <Text style={[styles.phone, { color: C.primary }]}>
            📞 {offer.order.customer.phone}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* Aksiyon satırı: ilerleme butonu + mesaj / kaldır */}
      {offer.order && (
        <View style={styles.actionRow}>
          {nextAction && (
            <TouchableOpacity
              style={[styles.progressBtn, { backgroundColor: nextAction.color }]}
              onPress={() => handleSetStatus(nextAction.status)}
              disabled={isProgressing}
            >
              {isProgressing
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={styles.actionBtnText}>{nextAction.label}</Text>
              }
            </TouchableOpacity>
          )}
          {active && (
            <TouchableOpacity
              style={[styles.msgBtn, { backgroundColor: C.primary }]}
              onPress={() => router.push({
                pathname: '/messages/[conversationId]',
                params: { conversationId: offer.order!.customer_id, orderId: offer.order!.id },
              })}
            >
              <Text style={styles.actionBtnText}>💬 Mesaj</Text>
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
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.sm,
    gap: 6,
    marginTop: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  orderTitle: { fontSize: FontSize.sm, fontWeight: '700', flex: 1 },
  price: { fontSize: FontSize.md, fontWeight: '800', flexShrink: 0 },
  statusBadge: { paddingHorizontal: Spacing.xs, paddingVertical: 2, borderRadius: Radius.full },
  statusText: { fontSize: 10, fontWeight: '700' },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexWrap: 'wrap',
  },
  avatar: { width: 18, height: 18, borderRadius: 9, flexShrink: 0 },
  avatarEmoji: { fontSize: 14 },
  customerName: { fontSize: FontSize.xs, flexShrink: 1 },
  metaText: { fontSize: FontSize.xs },
  phone: { fontSize: FontSize.xs, fontWeight: '700' },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  progressBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  msgBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  actionBtnText: { color: '#FFF', fontSize: FontSize.xs, fontWeight: '700' },
  iconBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  iconBtnText: { fontSize: FontSize.sm, fontWeight: '700' },
});

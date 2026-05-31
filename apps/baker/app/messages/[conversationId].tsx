/**
 * Mesajlaşma Ekranı — Metin + Resim Desteği
 *
 * conversationId = karşı kullanıcının ID'si (order_id değil)
 * orderId       = (opsiyonel) hangi sipariş bağlamında açıldı; gönderim için kullanılır
 *
 * Aynı kişiyle olan TÜM siparişlerdeki mesajlar tek pencerede gösterilir.
 * Sipariş değişince ince bir "📦 <sipariş adı>" ayırıcı çıkar.
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image, Alert, Modal, Pressable, Keyboard,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase, rpcDeleteConversation, rpcDeleteMessageForMe, notifyUser, useAuth, useThemeColors, Spacing, Radius, FontSize } from '@pastacim/shared';
import type { Database } from '@pastacim/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

type MessageRow = Database['public']['Tables']['messages']['Row'];

type MessageWithOrder = MessageRow & {
  order_title?: string | null;
  showOrderHeader?: boolean; // Bu mesajdan önce sipariş başlığı göster
};

export default function MessagesScreen() {
  const C = useThemeColors();
  const params = useLocalSearchParams<{ conversationId: string; orderId?: string }>();
  const otherUserId = params.conversationId;   // karşı kişinin user_id'si
  const initialOrderId = params.orderId;       // ilk açılışta hangi sipariş bağlamı

  const { user, isBaker, isCustomer } = useAuth();
  const [messages, setMessages] = useState<MessageWithOrder[]>([]);
  const [otherUserName, setOtherUserName] = useState('');
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sendOrderId, setSendOrderId] = useState<string | null>(initialOrderId ?? null);
  const [deliveryDate, setDeliveryDate] = useState<Date | null>(null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const mountedRef = useRef(true);

  // Unmount temizliği
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // Teslim tarihi + sipariş durumunu çek — sendOrderId değişince güncelle
  useEffect(() => {
    if (!sendOrderId) return;
    _db.from('orders').select('delivery_date, status').eq('id', sendOrderId).single()
      .then(({ data }: { data: { delivery_date: string | null; status: string } | null }) => {
        if (!mountedRef.current) return;
        setOrderStatus(data?.status ?? null);
        setDeliveryDate(data?.delivery_date ? new Date(data.delivery_date) : null);
      });
  }, [sendOrderId]);

  const chatBlockReason = null;
  const isBeforeOffer = false;

  // Aktif süreç: iki kullanıcı arasında pending/accepted teklif + tamamlanmamış sipariş
  const [hasActiveProcess, setHasActiveProcess] = useState<boolean>(true);
  useEffect(() => {
    if (!user?.id || !otherUserId) return;
    _db
      .from('offers')
      .select('baker_id, status, order:orders!order_id(status, customer_id)')
      .in('status', ['pending', 'accepted'])
      .or(`baker_id.eq.${user.id},baker_id.eq.${otherUserId}`)
      .then(({ data }: { data: any[] | null }) => {
        if (!mountedRef.current) return;
        const active = (data ?? []).some((offer: any) => {
          const order = offer.order;
          if (!order || ['completed', 'cancelled'].includes(order.status)) return false;
          const userIsBaker     = offer.baker_id === user.id    && order.customer_id === otherUserId;
          const userIsCustomer  = offer.baker_id === otherUserId && order.customer_id === user.id;
          return userIsBaker || userIsCustomer;
        });
        setHasActiveProcess(active);
      });
  }, [user?.id, otherUserId]);

  const isChatExpired = !hasActiveProcess;
  const expiredReason = 'Aktif bir sipariş veya teklif bulunmuyor.';

  // Karşı kullanıcının adı
  useEffect(() => {
    if (!otherUserId) return;
    _db.from('users').select('full_name').eq('id', otherUserId).single()
      .then(({ data }: { data: { full_name: string | null } | null }) => {
        if (!mountedRef.current) return;
        if (data?.full_name) setOtherUserName(data.full_name);
      });
  }, [otherUserId]);

  // Tüm mesajları yükle (kişi bazlı — tüm siparişler dahil)
  const fetchMessages = useCallback(async () => {
    if (!user?.id || !otherUserId) return;

    const { data } = await _db
      .from('messages')
      .select(`*, order:orders!order_id(title)`)
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`)
      .not('deleted_for', 'cs', `{${user.id}}`)
      .order('created_at', { ascending: true });

    if (!mountedRef.current) return;

    const raw = (data ?? []) as (MessageRow & { order?: { title: string | null } | null })[];

    // Sipariş değişince başlık ekle
    const withHeaders: MessageWithOrder[] = raw.map((msg, idx) => {
      const prevOrderId = idx > 0 ? raw[idx - 1].order_id : null;
      return {
        ...msg,
        order_title: msg.order?.title ?? null,
        showOrderHeader: msg.order_id !== prevOrderId,
      };
    });

    setMessages(withHeaders);
    setIsLoading(false);

    // En son mesajın order_id'sini gönderim için sakla
    if (raw.length > 0) {
      setSendOrderId(raw[raw.length - 1].order_id);
    }

    // Okunmamışları okundu işaretle (fire-and-forget, unmount'u bloklamamalı)
    _db
      .from('messages')
      .update({ is_read: true })
      .or(`and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`)
      .eq('is_read', false)
      .then(() => {})
      .catch(() => {});
  }, [user?.id, otherUserId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Realtime — kişi bazlı dinle (INSERT + DELETE + UPDATE)
  useEffect(() => {
    if (!user?.id || !otherUserId) return;

    const uid = user.id;
    const channel = supabase
      .channel(`chat:${[uid, otherUserId].sort().join('_')}`)
      // Yeni mesaj
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as MessageRow;
        const isOurConv =
          (msg.sender_id === uid && msg.receiver_id === otherUserId) ||
          (msg.sender_id === otherUserId && msg.receiver_id === uid);
        if (!isOurConv) return;

        // deleted_for içinde zaten varsa gösterme
        const deletedFor = (msg as MessageRow & { deleted_for?: string[] }).deleted_for ?? [];
        if (deletedFor.includes(uid)) return;

        setMessages((prev) => {
          const prevOrderId = prev.length > 0 ? prev[prev.length - 1].order_id : null;
          const withHeader: MessageWithOrder = { ...msg, showOrderHeader: msg.order_id !== prevOrderId };
          return [...prev, withHeader];
        });
        setSendOrderId(msg.order_id);

        if (msg.receiver_id === uid) {
          _db.from('messages').update({ is_read: true }).eq('id', msg.id);
        }
      })
      // Mesaj silindi (herkesten sil)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        const old = payload.old as { id: string };
        setMessages((prev) => prev.filter((m) => m.id !== old.id));
      })
      // Mesaj güncellendi (sadece benden sil → deleted_for değişti)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
        const updated = payload.new as MessageRow & { deleted_for?: string[] };
        const isOurConv =
          (updated.sender_id === uid && updated.receiver_id === otherUserId) ||
          (updated.sender_id === otherUserId && updated.receiver_id === uid);
        if (!isOurConv) return;

        const deletedFor = updated.deleted_for ?? [];
        if (deletedFor.includes(uid)) {
          // Bu kullanıcı için silinmiş → listeden kaldır
          setMessages((prev) => prev.filter((m) => m.id !== updated.id));
        } else {
          // is_read gibi başka bir güncelleme → state'i senkronize et
          setMessages((prev) => prev.map((m) =>
            m.id === updated.id ? { ...m, is_read: updated.is_read } : m
          ));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, otherUserId]);

  // Otomatik aşağı kaydır
  useEffect(() => {
    if (messages.length === 0) return;
    const t = setTimeout(() => {
      if (mountedRef.current) flatListRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(t);
  }, [messages.length]);

  // ─── Metin Mesajı Gönder ───────────────────────────────────────────────────
  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text || !user?.id || !otherUserId || !sendOrderId) return;

    setIsSending(true);
    setInputText('');

    const { error } = await _db.from('messages').insert({
      order_id:    sendOrderId,
      sender_id:   user.id,
      receiver_id: otherUserId,
      content:     text,
    });

    setIsSending(false);
    if (error) { setInputText(text); return; }

    notifyUser({
      userId: otherUserId,
      type:  'new_message',
      title: '💬 Yeni Mesaj',
      body:  text.length > 60 ? text.slice(0, 57) + '…' : text,
      data:  { senderId: user.id },
    }).catch(() => {});
  };

  // ─── Resim Seç & Gönder ────────────────────────────────────────────────────
  const sendImage = async () => {
    if (!user?.id || !otherUserId || !sendOrderId) return;

    Alert.alert('Resim Ekle', 'Nereden eklemek istersiniz?', [
      {
        text: '📷 Kamera',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('İzin Gerekli', 'Kamera erişimi için izin vermeniz gerekiyor.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
            allowsEditing: true,
          });
          if (!result.canceled && result.assets[0]) {
            await uploadAndSendImage(result.assets[0].uri);
          }
        },
      },
      {
        text: '🖼️ Galeri',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('İzin Gerekli', 'Galeri erişimi için izin vermeniz gerekiyor.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
          });
          if (!result.canceled && result.assets[0]) {
            await uploadAndSendImage(result.assets[0].uri);
          }
        },
      },
      { text: 'İptal', style: 'cancel' },
    ]);
  };

  const uploadAndSendImage = async (uri: string) => {
    if (!user?.id || !otherUserId || !sendOrderId) return;
    setIsSending(true);

    try {
      // Görseli binary olarak oku
      const response = await fetch(uri);
      if (!response.ok) throw new Error('Görsel okunamadı');
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength === 0) throw new Error('Boş görsel');

      const timestamp = Date.now();
      const path = `${user.id}/${sendOrderId}/${timestamp}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('message-images')
        .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: false });

      if (uploadError) throw new Error(uploadError.message);

      const { data: urlData } = supabase.storage
        .from('message-images')
        .getPublicUrl(path);

      const imageUrl = urlData.publicUrl;

      // Mesajı kaydet (sadece resim — content null)
      const { error: msgError } = await _db.from('messages').insert({
        order_id:    sendOrderId,
        sender_id:   user.id,
        receiver_id: otherUserId,
        content:     null,
        image_url:   imageUrl,
      });

      if (msgError) throw new Error(msgError.message);

      notifyUser({
        userId: otherUserId,
        type:  'new_message',
        title: '📷 Yeni Görsel',
        body:  'Bir resim gönderildi',
        data:  { senderId: user.id },
      }).catch(() => {});

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
      Alert.alert('Görsel Gönderilemedi', msg);
    } finally {
      setIsSending(false);
    }
  };

  // ─── Mesaj Sil ────────────────────────────────────────────────────────────
  const deleteMessage = useCallback((msg: MessageWithOrder) => {
    const isOwn = msg.sender_id === user?.id;
    // Alınan mesajlarda sadece "Sadece Benden Sil" seçeneği; kendi mesajlarında her iki seçenek
    Alert.alert(
      '🗑️ Mesajı Sil',
      'Bu mesajı nasıl silmek istersiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sadece Benden Sil',
          onPress: async () => {
            const { error } = await rpcDeleteMessageForMe(msg.id);
            if (error) {
              Alert.alert('Hata', 'Mesaj silinemedi.');
              return;
            }
            setMessages((prev) => prev.filter((m) => m.id !== msg.id));
          },
        },
        ...(isOwn
          ? [{
              text: 'Herkesten Sil',
              style: 'destructive' as const,
              onPress: async () => {
                const { error } = await _db.from('messages').delete().eq('id', msg.id).eq('sender_id', user!.id);
                if (error) {
                  Alert.alert('Hata', 'Mesaj silinemedi.');
                  return;
                }
                setMessages((prev) => prev.filter((m) => m.id !== msg.id));
              },
            }]
          : []),
      ]
    );
  }, [user?.id]);

  // ─── Sohbeti Sil ──────────────────────────────────────────────────────────
  const deleteConversation = useCallback(() => {
    Alert.alert(
      '🗑️ Sohbeti Sil',
      `"${otherUserName || 'Bu kullanıcı'}" ile tüm mesajlaşma geçmişi sadece senin ekranından silinecek. Devam etmek istiyor musunuz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil', style: 'destructive',
          onPress: async () => {
            const { error } = await rpcDeleteConversation(otherUserId);
            if (error) {
              Alert.alert('Hata', 'Sohbet silinemedi. Lütfen tekrar deneyin.');
              return;
            }
            router.back();
          },
        },
      ]
    );
  }, [otherUserId, otherUserName]);

  const formatTime  = (s: string) => new Date(s).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const formatDate  = (s: string) => new Date(s).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: C.border, backgroundColor: C.card }]}>
          <TouchableOpacity onPress={() => { Keyboard.dismiss(); router.back(); }}>
            <Text style={[styles.backText, { color: C.primary }]}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={[styles.avatar, { backgroundColor: C.primary + '22' }]}>
              <Text style={styles.avatarEmoji}>👤</Text>
            </View>
            <Text style={[styles.headerName, { color: C.text }]}>
              {otherUserName || 'Kullanıcı'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.deleteConvBtn}
            onPress={deleteConversation}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.deleteConvIcon, { color: C.error }]}>🗑️</Text>
          </TouchableOpacity>
        </View>

        {/* Mesajlar */}
        {isLoading ? (
          <View style={styles.centered}><ActivityIndicator size="large" color={C.primary} /></View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => {
              const isMe = item.sender_id === user?.id;
              const prevMsg = index > 0 ? messages[index - 1] : null;
              const showDate = !prevMsg ||
                new Date(item.created_at).toDateString() !== new Date(prevMsg.created_at).toDateString();

              return (
                <View>
                  {/* Tarih ayırıcı */}
                  {showDate && (
                    <View style={styles.dateDivider}>
                      <Text style={[styles.dateText, { color: C.textSecondary, backgroundColor: C.background }]}>
                        {formatDate(item.created_at)}
                      </Text>
                    </View>
                  )}
                  {/* Sipariş bağlamı ayırıcı */}
                  {item.showOrderHeader && item.order_title && (
                    <View style={styles.orderDivider}>
                      <View style={[styles.orderDividerLine, { backgroundColor: C.border }]} />
                      <Text style={[styles.orderDividerText, { color: C.textSecondary, backgroundColor: C.background }]}>
                        📦 {item.order_title}
                      </Text>
                      <View style={[styles.orderDividerLine, { backgroundColor: C.border }]} />
                    </View>
                  )}
                  {/* Mesaj balonu */}
                  <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
                    {/* Kendi mesajlarımın SOLUNDA sil butonu */}
                    {isMe && (
                      <TouchableOpacity
                        style={styles.deleteMsgBtn}
                        onPress={() => deleteMessage(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.deleteMsgIcon}>🗑️</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[
                        styles.bubble,
                        isMe
                          ? [styles.bubbleMe, { backgroundColor: C.primary }]
                          : [styles.bubbleThem, { backgroundColor: C.card, borderColor: C.border }],
                        // Resim-only mesajda padding yok
                        item.image_url && !item.content && styles.bubbleImage,
                      ]}
                      activeOpacity={0.85}
                      onLongPress={() => deleteMessage(item)}
                      delayLongPress={500}
                    >
                      {/* Resim */}
                      {item.image_url && (
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => setFullscreenImage(item.image_url!)}
                        >
                          <Image
                            source={{ uri: item.image_url }}
                            style={styles.msgImage}
                            resizeMode="cover"
                          />
                        </TouchableOpacity>
                      )}
                      {/* Metin */}
                      {!!item.content && (
                        <Text style={[styles.bubbleText, { color: isMe ? '#FFF' : C.text }]}>
                          {item.content}
                        </Text>
                      )}
                      <Text style={[
                        styles.bubbleTime,
                        { color: isMe ? 'rgba(255,255,255,0.65)' : C.placeholder },
                        item.image_url && !item.content && styles.bubbleTimeOverImage,
                      ]}>
                        {formatTime(item.created_at)}
                        {isMe && (item.is_read ? ' ✓✓' : ' ✓')}
                      </Text>
                    </TouchableOpacity>
                    {/* Alınan mesajların SAĞINDA sil butonu */}
                    {!isMe && (
                      <TouchableOpacity
                        style={styles.deleteMsgBtn}
                        onPress={() => deleteMessage(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.deleteMsgIcon}>🗑️</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>💬</Text>
                <Text style={[styles.emptyText, { color: C.textSecondary }]}>
                  Henüz mesaj yok. İlk mesajı siz gönderin!
                </Text>
              </View>
            }
          />
        )}

        {/* Mesaj girişi / Kilitli banner */}
        {isChatExpired ? (
          <View style={[styles.lockedBar, { backgroundColor: C.card, borderTopColor: C.border }]}>
            <Text style={styles.lockedEmoji}>🔒</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.lockedTitle, { color: C.text }]}>Sohbet Kapatıldı</Text>
              <Text style={[styles.lockedSub, { color: C.textSecondary }]}>{expiredReason}</Text>
            </View>
          </View>
        ) : isBeforeOffer ? (
          <View style={[styles.lockedBar, { backgroundColor: C.card, borderTopColor: C.border }]}>
            <Text style={styles.lockedEmoji}>⏳</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.lockedTitle, { color: C.text }]}>Mesajlaşma Henüz Aktif Değil</Text>
              <Text style={[styles.lockedSub, { color: C.textSecondary }]}>{chatBlockReason}</Text>
            </View>
          </View>
        ) : (
          /* Normal giriş — metin + resim */
          <View style={[styles.inputBar, { backgroundColor: C.card, borderTopColor: C.border }]}>
            {/* Resim butonu */}
            <TouchableOpacity
              style={[styles.imageBtn, { backgroundColor: C.background, borderColor: C.border }]}
              onPress={sendImage}
              disabled={isSending || !sendOrderId}
              activeOpacity={0.7}
            >
              <Text style={styles.imageBtnIcon}>📷</Text>
            </TouchableOpacity>

            <TextInput
              style={[styles.input, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
              placeholder="Mesajınızı yazın..."
              placeholderTextColor={C.placeholder}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={1000}
              returnKeyType="send"
              onSubmitEditing={sendMessage}
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: inputText.trim() ? C.primary : C.border }]}
              onPress={sendMessage}
              disabled={!inputText.trim() || isSending || !sendOrderId}
              activeOpacity={0.8}
            >
              {isSending
                ? <ActivityIndicator color="#FFF" size="small" />
                : <Text style={styles.sendBtnIcon}>↑</Text>
              }
            </TouchableOpacity>
          </View>
        )}

      </KeyboardAvoidingView>

      {/* Tam Ekran Görsel */}
      <Modal visible={!!fullscreenImage} transparent animationType="fade" onRequestClose={() => setFullscreenImage(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setFullscreenImage(null)}>
          {fullscreenImage && (
            <Image source={{ uri: fullscreenImage }} style={styles.modalImage} resizeMode="contain" />
          )}
          <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setFullscreenImage(null)}>
            <Text style={styles.modalCloseBtnText}>✕</Text>
          </TouchableOpacity>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1,
  },
  backText: { fontSize: 24, fontWeight: '300', paddingHorizontal: Spacing.xs },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 18 },
  headerName: { fontSize: FontSize.md, fontWeight: '700' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messageList: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, paddingBottom: Spacing.md },
  dateDivider: { alignItems: 'center', marginVertical: Spacing.sm },
  dateText: { fontSize: FontSize.xs, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.full },
  orderDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: Spacing.sm, gap: Spacing.sm },
  orderDividerLine: { flex: 1, height: 1 },
  orderDividerText: { fontSize: 11, paddingHorizontal: Spacing.xs, fontWeight: '600' },
  msgRow: { flexDirection: 'row', marginBottom: Spacing.xs, alignItems: 'flex-end' },
  msgRowMe: { justifyContent: 'flex-end' },
  deleteConvBtn: { padding: 4 },
  deleteConvIcon: { fontSize: 20 },
  deleteMsgBtn: { marginRight: 4, marginBottom: 2, opacity: 0.45 },
  deleteMsgIcon: { fontSize: 14 },
  bubble: {
    maxWidth: '75%', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.lg, gap: 2,
  },
  bubbleMe: { borderBottomRightRadius: 4 },
  bubbleThem: { borderWidth: 1, borderBottomLeftRadius: 4 },
  bubbleImage: { padding: 0, overflow: 'hidden' },
  bubbleText: { fontSize: FontSize.md, lineHeight: 20 },
  bubbleTime: { fontSize: 10, alignSelf: 'flex-end' },
  bubbleTimeOverImage: {
    position: 'absolute', bottom: 6, right: 8,
    color: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 4, borderRadius: 4, overflow: 'hidden',
  },
  msgImage: {
    width: 220, height: 220, borderRadius: Radius.lg,
  },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: Spacing.md },
  emptyEmoji: { fontSize: 48 },
  emptyText: { fontSize: FontSize.sm, textAlign: 'center', paddingHorizontal: Spacing.xl },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1,
  },
  lockedBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderTopWidth: 1,
  },
  lockedEmoji: { fontSize: 24 },
  lockedTitle: { fontSize: FontSize.sm, fontWeight: '700' },
  lockedSub:   { fontSize: FontSize.xs, marginTop: 2 },
  imageBtn: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  imageBtnIcon: { fontSize: 20 },
  input: {
    flex: 1, borderWidth: 1, borderRadius: Radius.xl,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    fontSize: FontSize.md, maxHeight: 100,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sendBtnIcon: { color: '#FFF', fontSize: 20, fontWeight: '700', marginTop: -2 },
  // Tam ekran görsel
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.93)', alignItems: 'center', justifyContent: 'center' },
  modalImage: { width: '100%', height: '85%' },
  modalCloseBtn: {
    position: 'absolute', top: 52, right: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalCloseBtnText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
});

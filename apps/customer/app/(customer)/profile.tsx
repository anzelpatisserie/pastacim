import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, Share, Image,
  LayoutAnimation, Platform, UIManager, Modal, TextInput, KeyboardAvoidingView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { supabase, useAuth, useThemeColors, Spacing, Radius, FontSize, FeedbackModal, TabHeader } from '@pastacim/shared';
import { useNotifications } from '@/hooks/useNotifications';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type OrderStats = {
  total: number;
  active: number;
  completed: number;
};

export default function CustomerProfileScreen() {
  const C = useThemeColors();
  const { profile, signOut, refreshProfile } = useAuth();
  const { unreadCount } = useNotifications(profile?.id);

  const [stats, setStats] = useState<OrderStats>({ total: 0, active: 0, completed: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  // Hesap Ayarları collapse + alt işlemler
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const loadStats = useCallback(async () => {
    if (!profile?.id) return;
    setIsLoading(true);
    const { data } = await _db
      .from('orders')
      .select('status')
      .eq('customer_id', profile.id);
    const rows = (data ?? []) as { status: string }[];
    const total = rows.length;
    const active = rows.filter((r) => ['pending', 'accepted', 'in_progress', 'ready'].includes(r.status)).length;
    const completed = rows.filter((r) => r.status === 'completed').length;
    setStats({ total, active, completed });
    setIsLoading(false);
  }, [profile?.id]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const toggleSettings = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSettingsOpen((v) => !v);
  };

  const handleSignOut = () => {
    Alert.alert(
      'Çıkış Yap',
      'Hesabınızdan çıkmak istediğinizden emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Çıkış Yap', style: 'destructive', onPress: signOut },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Hesabı Sil',
      'Hesabınız kalıcı olarak silinecek. Sipariş geçmişiniz ve mesajlarınız kaybolacak. Bu işlem geri alınamaz. Devam etmek istiyor musunuz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            const { error } = await supabase.rpc('delete_account');
            if (error) {
              setIsDeleting(false);
              Alert.alert('Hata', 'Hesap silinemedi. Lütfen tekrar deneyin.');
            } else {
              await signOut();
            }
          },
        },
      ]
    );
  };

  // ─── Profil Resmi ────────────────────────────────────────────────────────────
  const pickAvatar = async () => {
    if (!profile?.id) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('İzin Gerekli', 'Profil resmi seçmek için galeri erişimine izin verin.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setIsUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const path = `${profile.id}/avatar.jpg`;

      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error('Görsel okunamadı');
      const arrayBuffer = await response.arrayBuffer();

      const { error: upErr } = await supabase.storage
        .from('user-avatars')
        .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
      if (upErr) throw new Error(upErr.message);

      const { data: urlData } = supabase.storage.from('user-avatars').getPublicUrl(path);
      const url = urlData.publicUrl + `?t=${Date.now()}`;

      const { error: updErr } = await _db.from('users').update({ avatar_url: url }).eq('id', profile.id);
      if (updErr) throw new Error(updErr.message);

      await refreshProfile();
      Alert.alert('✅ Güncellendi', 'Profil resminiz güncellendi.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
      Alert.alert('Hata', `Profil resmi yüklenemedi: ${msg}`);
    }
    setIsUploadingAvatar(false);
  };

  // ─── Cep Telefonu ────────────────────────────────────────────────────────────
  const openPhoneModal = () => {
    setPhoneInput(profile?.phone ?? '');
    setShowPhoneModal(true);
  };

  const savePhone = async () => {
    if (!profile?.id) return;
    const cleaned = phoneInput.trim();
    setIsSavingPhone(true);
    const { error } = await _db
      .from('users')
      .update({ phone: cleaned || null })
      .eq('id', profile.id);
    setIsSavingPhone(false);
    if (error) {
      Alert.alert('Hata', 'Telefon kaydedilemedi.');
    } else {
      await refreshProfile();
      setShowPhoneModal(false);
    }
  };

  // ─── Şifre Değiştirme ────────────────────────────────────────────────────────
  const handlePasswordReset = () => {
    if (!profile?.email) {
      Alert.alert('Hata', 'E-posta adresiniz bulunamadı.');
      return;
    }
    Alert.alert(
      'Şifre Sıfırlama',
      `Şifre sıfırlama bağlantısı ${profile.email} adresine gönderilsin mi?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Gönder',
          onPress: async () => {
            setIsResettingPassword(true);
            const { error } = await supabase.auth.resetPasswordForEmail(profile.email!, {
              redirectTo: 'pastacim://auth-callback?type=recovery',
            });
            setIsResettingPassword(false);
            if (error) {
              Alert.alert('Hata', 'Bağlantı gönderilemedi: ' + error.message);
            } else {
              Alert.alert('✅ Gönderildi', 'E-posta kutunuzu kontrol edin.');
            }
          },
        },
      ]
    );
  };

  const avatarUrl = profile?.avatar_url ?? null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <TabHeader
        title="Profilim"
        unreadCount={unreadCount}
        onBellPress={() => router.push('/(customer)/notifications' as never)}
        onAddPress={() => router.push('/(customer)/order/create')}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Kullanıcı Kartı */}
        <View style={[styles.userCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <TouchableOpacity
            onPress={pickAvatar}
            disabled={isUploadingAvatar}
            style={[styles.avatarCircle, { backgroundColor: C.primary + '22' }]}
            activeOpacity={0.8}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarEmoji}>🎂</Text>
            )}
            {isUploadingAvatar && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#FFF" />
              </View>
            )}
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.userName, { color: C.text }]}>{profile?.full_name ?? '—'}</Text>
            <Text style={[styles.userEmail, { color: C.textSecondary }]}>{profile?.email ?? '—'}</Text>
            {profile?.phone ? (
              <Text style={[styles.userPhone, { color: C.textSecondary }]}>📱 {profile.phone}</Text>
            ) : null}
          </View>
        </View>

        {/* Sipariş İstatistikleri */}
        <View style={[styles.statsCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[styles.sectionTitle, { color: C.text }]}>📊 Sipariş Özetim</Text>
          {isLoading ? (
            <ActivityIndicator color={C.primary} style={{ marginVertical: Spacing.md }} />
          ) : (
            <View style={styles.statsRow}>
              <View style={[styles.statBox, { backgroundColor: C.background }]}>
                <Text style={[styles.statValue, { color: C.primary }]}>{stats.total}</Text>
                <Text style={[styles.statLabel, { color: C.textSecondary }]}>Toplam</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: C.background }]}>
                <Text style={[styles.statValue, { color: '#F5A623' }]}>{stats.active}</Text>
                <Text style={[styles.statLabel, { color: C.textSecondary }]}>Aktif</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: C.background }]}>
                <Text style={[styles.statValue, { color: C.success }]}>{stats.completed}</Text>
                <Text style={[styles.statLabel, { color: C.textSecondary }]}>Tamamlandı</Text>
              </View>
            </View>
          )}
        </View>

        <FeedbackModal
          visible={showFeedback}
          onClose={() => setShowFeedback(false)}
          appName="customer"
        />

        {/* Hesap Ayarları (Collapsible) */}
        <View style={[styles.settingsCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <TouchableOpacity style={styles.settingsHeader} onPress={toggleSettings} activeOpacity={0.7}>
            <Text style={[styles.sectionTitle, { color: C.text }]}>⚙️ Hesap Ayarları</Text>
            <Text style={[styles.chevron, { color: C.textSecondary }]}>
              {settingsOpen ? '▾' : '▸'}
            </Text>
          </TouchableOpacity>

          {settingsOpen && (
            <View>
              {/* Profil Resmi Düzenle */}
              <TouchableOpacity
                style={[styles.settingRow, { borderTopColor: C.border }]}
                onPress={pickAvatar}
                disabled={isUploadingAvatar}
              >
                <Text style={styles.settingEmoji}>🖼</Text>
                <Text style={[styles.settingText, { color: C.text }]}>Profil Resmi Düzenle</Text>
                {isUploadingAvatar ? (
                  <ActivityIndicator size="small" color={C.primary} />
                ) : (
                  <Text style={[styles.settingArrow, { color: C.placeholder }]}>›</Text>
                )}
              </TouchableOpacity>

              {/* Cep Telefonu */}
              <TouchableOpacity
                style={[styles.settingRow, { borderTopColor: C.border }]}
                onPress={openPhoneModal}
              >
                <Text style={styles.settingEmoji}>📱</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingText, { color: C.text }]}>Cep Telefonu</Text>
                  {profile?.phone ? (
                    <Text style={[styles.settingSub, { color: C.textSecondary }]}>{profile.phone}</Text>
                  ) : (
                    <Text style={[styles.settingSub, { color: C.placeholder }]}>Eklenmedi</Text>
                  )}
                </View>
                <Text style={[styles.settingArrow, { color: C.placeholder }]}>›</Text>
              </TouchableOpacity>

              {/* Şifre Değiştir */}
              <TouchableOpacity
                style={[styles.settingRow, { borderTopColor: C.border }]}
                onPress={handlePasswordReset}
                disabled={isResettingPassword}
              >
                <Text style={styles.settingEmoji}>🔒</Text>
                <Text style={[styles.settingText, { color: C.text }]}>Şifre Değiştir</Text>
                {isResettingPassword ? (
                  <ActivityIndicator size="small" color={C.primary} />
                ) : (
                  <Text style={[styles.settingArrow, { color: C.placeholder }]}>›</Text>
                )}
              </TouchableOpacity>

              {/* Çıkış Yap */}
              <TouchableOpacity
                style={[styles.settingRow, { borderTopColor: C.border }]}
                onPress={handleSignOut}
              >
                <Text style={styles.settingEmoji}>🚪</Text>
                <Text style={[styles.settingText, { color: C.text }]}>Çıkış Yap</Text>
                <Text style={[styles.settingArrow, { color: C.placeholder }]}>›</Text>
              </TouchableOpacity>

              {/* Hesabımı Sil */}
              <TouchableOpacity
                style={[styles.settingRow, { borderTopColor: C.border, opacity: isDeleting ? 0.6 : 1 }]}
                disabled={isDeleting}
                onPress={handleDeleteAccount}
              >
                <Text style={styles.settingEmoji}>🗑</Text>
                <Text style={[styles.settingText, { color: '#E53E3E' }]}>Hesabımı Sil</Text>
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#E53E3E" />
                ) : (
                  <Text style={[styles.settingArrow, { color: '#E53E3E' }]}>›</Text>
                )}
              </TouchableOpacity>

              {/* Admin: Geri Bildirimler — sadece anzelpatisserie@gmail.com */}
              {profile?.email === 'anzelpatisserie@gmail.com' && (
                <TouchableOpacity
                  style={[styles.settingRow, { borderTopColor: C.border }]}
                  onPress={() => router.push('/(customer)/admin-feedbacks' as never)}
                >
                  <Text style={styles.settingEmoji}>📬</Text>
                  <Text style={[styles.settingText, { color: C.text }]}>Admin: Geri Bildirimler</Text>
                  <Text style={[styles.settingArrow, { color: C.placeholder }]}>›</Text>
                </TouchableOpacity>
              )}
              {/* Admin: Dashboard — sadece anzelpatisserie@gmail.com */}
              {profile?.email === 'anzelpatisserie@gmail.com' && (
                <TouchableOpacity
                  style={[styles.settingRow, { borderTopColor: C.border }]}
                  onPress={() => router.push('/(customer)/admin-dashboard' as never)}
                >
                  <Text style={styles.settingEmoji}>📊</Text>
                  <Text style={[styles.settingText, { color: C.text }]}>Admin: Kullanıcı Paneli</Text>
                  <Text style={[styles.settingArrow, { color: C.placeholder }]}>›</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Uygulamayı Tavsiye Et */}
        <TouchableOpacity
          style={[styles.shareCard, { backgroundColor: C.card, borderColor: C.border }]}
          onPress={() => Share.share({
            message: 'Pastacım ile pastacılardan kolayca teklif al! 🎂\nhttps://apps.apple.com/tr/app/pastac%C4%B1m/id6778031428?l=tr',
            title: 'Pastacım\'ı Arkadaşlarına Öner',
          })}
          activeOpacity={0.85}
        >
          <Text style={styles.shareEmoji}>🎁</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.shareTitle, { color: C.text }]}>Uygulamayı Tavsiye Et</Text>
            <Text style={[styles.shareSub, { color: C.textSecondary }]}>
              Pastacım'ı arkadaşlarına öner
            </Text>
          </View>
          <Text style={[styles.shareArrow, { color: C.primary }]}>→</Text>
        </TouchableOpacity>

        {/* Geri Bildirim */}
        <TouchableOpacity
          style={[styles.shareCard, { backgroundColor: C.card, borderColor: C.border }]}
          onPress={() => setShowFeedback(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.shareEmoji}>📣</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.shareTitle, { color: C.text }]}>Geri Bildirim Gönder</Text>
            <Text style={[styles.shareSub, { color: C.textSecondary }]}>
              Görüş ve Önerilerini Paylaş
            </Text>
          </View>
          <Text style={[styles.shareArrow, { color: C.primary }]}>→</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Telefon Modal */}
      <Modal visible={showPhoneModal} transparent animationType="slide" onRequestClose={() => setShowPhoneModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: C.card }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Cep Telefonu</Text>
            <Text style={[styles.modalSub, { color: C.textSecondary }]}>
              Pastacılar size ulaşmak için kullanır
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
              placeholder="0532 123 45 67"
              placeholderTextColor={C.placeholder}
              value={phoneInput}
              onChangeText={setPhoneInput}
              keyboardType="phone-pad"
              maxLength={20}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: C.border }]}
                onPress={() => setShowPhoneModal(false)}
              >
                <Text style={[styles.modalCancelText, { color: C.textSecondary }]}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: C.primary }]}
                onPress={savePhone}
                disabled={isSavingPhone}
              >
                {isSavingPhone ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.modalSaveText}>Kaydet</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1,
  },
  title: { fontSize: FontSize.xl, fontWeight: '800' },
  content: { padding: Spacing.lg, gap: Spacing.md },

  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md,
  },
  avatarCircle: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', position: 'relative',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarEmoji: { fontSize: 36 },
  avatarOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEditIcon: { fontSize: 11 },
  userName: { fontSize: FontSize.lg, fontWeight: '700' },
  userEmail: { fontSize: FontSize.sm, marginTop: 2 },
  userPhone: { fontSize: FontSize.xs, marginTop: 4 },

  statsCard: {
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm,
  },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
  statBox: { flex: 1, padding: Spacing.sm, borderRadius: Radius.md, alignItems: 'center' },
  statValue: { fontSize: FontSize.lg, fontWeight: '800' },
  statLabel: { fontSize: FontSize.xs, marginTop: 2 },

  shareCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md,
  },
  shareEmoji: { fontSize: 32 },
  shareTitle: { fontSize: FontSize.md, fontWeight: '700' },
  shareSub: { fontSize: FontSize.xs, marginTop: 2 },
  shareArrow: { fontSize: 20, fontWeight: '300' },

  settingsCard: {
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md,
  },
  settingsHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  chevron: { fontSize: 18, fontWeight: '700' },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: 12, borderTopWidth: 1, marginTop: 4,
  },
  settingEmoji: { fontSize: 17, width: 24 },
  settingText: { flex: 1, fontSize: FontSize.sm, fontWeight: '600' },
  settingSub: { fontSize: 11, marginTop: 2 },
  settingArrow: { fontSize: 20, fontWeight: '300' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: Spacing.lg, gap: Spacing.md,
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  modalSub: { fontSize: FontSize.sm },
  input: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: FontSize.md,
  },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: Radius.full,
    borderWidth: 1.5, alignItems: 'center',
  },
  modalCancelText: { fontSize: FontSize.sm, fontWeight: '600' },
  modalSaveBtn: {
    flex: 2, paddingVertical: 12, borderRadius: Radius.full, alignItems: 'center',
  },
  modalSaveText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '700' },
});

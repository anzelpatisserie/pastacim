// Şikayet / rapor modalı — sipariş / kullanıcı / dükkan / mesaj şikayeti.
// file_report RPC üzerinden insert eder (admin'e in-app + push sunucu tarafında gider).
import { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Image,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { fileReport } from '../lib/notifications';
import { useAuth } from '../hooks/useAuth';
import { useThemeColors, Spacing, Radius, FontSize } from '../lib/constants';

export type ReportTargetType = 'order' | 'user' | 'shop' | 'message';

const REASONS: string[] = [
  'Uygunsuz içerik',
  'Dolandırıcılık şüphesi',
  'Spam / taciz',
  'Diğer',
];

const TARGET_LABELS: Record<ReportTargetType, string> = {
  order: 'Sipariş',
  user: 'Kullanıcı',
  shop: 'Dükkan',
  message: 'Mesaj',
};

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId?: string;
  appName: string;
}

export default function ReportModal({
  visible, onClose, targetType, targetId, appName,
}: ReportModalProps) {
  const C = useThemeColors();
  const { user } = useAuth();

  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setReason(null);
    setDetails('');
    setImageUri(null);
    setImageBase64(null);
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('İzin Gerekli', 'Galeri iznine ihtiyaç var.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.6,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setImageBase64(result.assets[0].base64 ?? null);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!reason) {
      Alert.alert('Eksik Bilgi', 'Lütfen bir şikayet nedeni seçin.');
      return;
    }
    if (!user?.id) {
      Alert.alert('Hata', 'Şikayet göndermek için giriş yapmış olmalısınız.');
      return;
    }

    setIsSubmitting(true);
    let imageUrl: string | undefined;

    try {
      // Resim varsa yükle — RN'de fetch(file://).arrayBuffer() güvenilmez,
      // bu yüzden ImagePicker'ın base64 çıktısını byte dizisine çeviriyoruz.
      if (imageBase64 && user?.id) {
        const bin = atob(imageBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        // İlk klasör uid olmalı (feedbacks bucket RLS: foldername[1]=auth.uid)
        const path = `${user.id}/reports/${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('feedbacks')
          .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
        if (uploadError) {
          Alert.alert('Resim Yüklenemedi', 'Şikayetiniz resim olmadan gönderilecek.');
        } else {
          const { data: urlData } = supabase.storage.from('feedbacks').getPublicUrl(path);
          imageUrl = urlData.publicUrl;
        }
      }

      const { reportId } = await fileReport({
        targetType,
        targetId,
        reason,
        details: details.trim() || undefined,
        appName,
        imageUrl,
      });
      if (!reportId) throw new Error('Şikayet kaydedilemedi');

      Alert.alert(
        'Şikayetiniz Alındı',
        'Bildiriminiz için teşekkürler. En kısa sürede inceleyeceğiz.',
      );
      reset();
      onClose();
    } catch {
      Alert.alert('Hata', 'Şikayet gönderilemedi. Lütfen tekrar deneyin.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.sheet, { backgroundColor: C.background }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: C.border }]}>
            <Text style={[styles.title, { color: C.text }]}>
              ⚠️ {TARGET_LABELS[targetType]} Şikayet Et
            </Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.closeBtn, { color: C.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Neden */}
            <Text style={[styles.label, { color: C.textSecondary }]}>Şikayet Nedeni</Text>
            <View style={styles.reasonList}>
              {REASONS.map((r) => {
                const selected = reason === r;
                return (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.reasonChip,
                      {
                        backgroundColor: selected ? C.primary : C.card,
                        borderColor: selected ? C.primary : C.border,
                      },
                    ]}
                    onPress={() => setReason(r)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.reasonText, { color: selected ? '#FFF' : C.text }]}>
                      {r}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Açıklama */}
            <Text style={[styles.label, { color: C.textSecondary, marginTop: Spacing.md }]}>
              Açıklama (isteğe bağlı)
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
              placeholder="Durumu kısaca anlatın..."
              placeholderTextColor={C.placeholder}
              value={details}
              onChangeText={setDetails}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={[styles.charCount, { color: C.placeholder }]}>{details.length}/500</Text>

            {/* Resim eki */}
            <Text style={[styles.label, { color: C.textSecondary, marginTop: Spacing.md }]}>
              Resim (isteğe bağlı)
            </Text>
            {imageUri ? (
              <View style={styles.imageWrapper}>
                <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
                <TouchableOpacity
                  style={[styles.removeImageBtn, { backgroundColor: C.error }]}
                  onPress={() => { setImageUri(null); setImageBase64(null); }}
                >
                  <Text style={styles.removeImageText}>✕ Kaldır</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.imagePickBtn, { backgroundColor: C.card, borderColor: C.border }]}
                onPress={handlePickImage}
              >
                <Text style={[styles.imagePickText, { color: C.textSecondary }]}>📷 Resim Ekle</Text>
              </TouchableOpacity>
            )}

            {/* Gönder */}
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: C.primary }, isSubmitting && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={isSubmitting}
              activeOpacity={0.85}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitBtnText}>Şikayeti Gönder</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg,
    maxHeight: '90%',
  },
  scrollContent: { paddingBottom: Spacing.xl },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: Spacing.md, marginBottom: Spacing.md, borderBottomWidth: 1,
  },
  title: { fontSize: FontSize.lg, fontWeight: '800', flex: 1 },
  closeBtn: { fontSize: 20, fontWeight: '700' },
  label: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: Spacing.sm },
  reasonList: { gap: Spacing.sm },
  reasonChip: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  reasonText: { fontSize: FontSize.sm, fontWeight: '600' },
  input: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: FontSize.md, minHeight: 100,
  },
  charCount: { fontSize: FontSize.xs, textAlign: 'right', marginTop: 2 },
  imageWrapper: { marginTop: 4, marginBottom: Spacing.sm },
  imagePreview: { width: '100%', height: 140, borderRadius: Radius.md },
  removeImageBtn: {
    marginTop: Spacing.xs, paddingVertical: 8,
    borderRadius: Radius.md, alignItems: 'center',
  },
  removeImageText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.sm },
  imagePickBtn: {
    borderWidth: 1.5, borderStyle: 'dashed', borderRadius: Radius.md,
    paddingVertical: 16, alignItems: 'center', marginTop: 4, marginBottom: Spacing.sm,
  },
  imagePickText: { fontSize: FontSize.sm, fontWeight: '600' },
  submitBtn: {
    paddingVertical: 16, borderRadius: Radius.full, alignItems: 'center', marginTop: Spacing.lg,
  },
  submitBtnText: { color: '#FFF', fontSize: FontSize.md, fontWeight: '700' },
});

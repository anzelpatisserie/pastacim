import { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Image,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useThemeColors, Spacing, Radius, FontSize } from '../lib/constants';

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
  appName: 'customer' | 'baker';
}

export default function FeedbackModal({ visible, onClose, appName }: FeedbackModalProps) {
  const C = useThemeColors();
  const { user } = useAuth();

  const [message, setMessage] = useState('');
  const [screenshotUri, setScreenshotUri] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _db: any = supabase;

  const handlePickScreenshot = () => {
    Alert.alert('Ekran Görüntüsü', 'Nereden eklemek istersiniz?', [
      {
        text: '📷 Kamera',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('İzin Gerekli', 'Kamera izni gerekiyor.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: 'images',
            quality: 0.6,
            allowsEditing: false,
          });
          if (!result.canceled && result.assets[0]) {
            setScreenshotUri(result.assets[0].uri);
          }
        },
      },
      {
        text: '🖼️ Galeri',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('İzin Gerekli', 'Galeri izni gerekiyor.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: 'images',
            quality: 0.6,
          });
          if (!result.canceled && result.assets[0]) {
            setScreenshotUri(result.assets[0].uri);
          }
        },
      },
      { text: 'İptal', style: 'cancel' },
    ]);
  };

  const handleSubmit = async () => {
    if (!message.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen geri bildiriminizi yazın.');
      return;
    }

    setIsSubmitting(true);
    let screenshotUrl: string | null = null;

    try {
      // Screenshot yükle
      if (screenshotUri && user?.id) {
        const response = await fetch(screenshotUri);
        const arrayBuffer = await response.arrayBuffer();
        const path = `${user.id}/${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('feedbacks')
          .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('feedbacks').getPublicUrl(path);
          screenshotUrl = urlData.publicUrl;
        }
      }

      // Feedback kaydet
      const { error } = await _db.from('feedbacks').insert({
        user_id: user?.id ?? null,
        message: message.trim(),
        screenshot_url: screenshotUrl,
        app_name: appName,
      });

      if (error) throw new Error(error.message);

      Alert.alert('Teşekkürler!', 'Geri bildiriminiz alındı. Uygulamayı geliştirmemize yardımcı olduğunuz için teşekkür ederiz.');
      setMessage('');
      setScreenshotUri(null);
      onClose();
    } catch {
      Alert.alert('Hata', 'Geri bildirim gönderilemedi. Lütfen tekrar deneyin.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setMessage('');
    setScreenshotUri(null);
    onClose();
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
            <Text style={[styles.title, { color: C.text }]}>📣 Geri Bildirim</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.closeBtn, { color: C.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Mesaj */}
            <Text style={[styles.label, { color: C.textSecondary }]}>Mesajınız</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
              placeholder="Uygulama hakkında düşüncelerinizi paylaşın..."
              placeholderTextColor={C.placeholder}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              maxLength={1000}
            />
            <Text style={[styles.charCount, { color: C.placeholder }]}>{message.length}/1000</Text>

            {/* Screenshot */}
            <Text style={[styles.label, { color: C.textSecondary, marginTop: Spacing.sm }]}>
              Ekran Görüntüsü (isteğe bağlı)
            </Text>

            {screenshotUri ? (
              <View style={styles.screenshotWrapper}>
                <Image source={{ uri: screenshotUri }} style={styles.screenshot} resizeMode="cover" />
                <TouchableOpacity
                  style={[styles.removeScreenshotBtn, { backgroundColor: C.error }]}
                  onPress={() => setScreenshotUri(null)}
                >
                  <Text style={styles.removeScreenshotText}>✕ Kaldır</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.screenshotPickBtn, { backgroundColor: C.card, borderColor: C.border }]}
                onPress={handlePickScreenshot}
              >
                <Text style={[styles.screenshotPickText, { color: C.textSecondary }]}>📷 Ekran görüntüsü ekle</Text>
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
                <Text style={styles.submitBtnText}>Gönder</Text>
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
  scrollContent: {
    paddingBottom: Spacing.xl,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: Spacing.md, marginBottom: Spacing.md, borderBottomWidth: 1,
  },
  title: { fontSize: FontSize.lg, fontWeight: '800' },
  closeBtn: { fontSize: 20, fontWeight: '700' },
  label: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: Spacing.xs },
  input: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: FontSize.md, minHeight: 120,
  },
  charCount: { fontSize: FontSize.xs, textAlign: 'right', marginTop: 2 },
  screenshotWrapper: { marginTop: 4, marginBottom: Spacing.md },
  screenshot: { width: '100%', height: 160, borderRadius: Radius.md },
  removeScreenshotBtn: {
    marginTop: Spacing.xs, paddingVertical: 8,
    borderRadius: Radius.md, alignItems: 'center',
  },
  removeScreenshotText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.sm },
  screenshotPickBtn: {
    borderWidth: 1.5, borderStyle: 'dashed', borderRadius: Radius.md,
    paddingVertical: 16, alignItems: 'center', marginTop: 4, marginBottom: Spacing.md,
  },
  screenshotPickText: { fontSize: FontSize.sm, fontWeight: '600' },
  submitBtn: {
    paddingVertical: 16, borderRadius: Radius.full, alignItems: 'center', marginTop: Spacing.md,
  },
  submitBtnText: { color: '#FFF', fontSize: FontSize.md, fontWeight: '700' },
});

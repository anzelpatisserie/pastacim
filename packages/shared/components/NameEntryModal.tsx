// Apple "E-postamı Gizle" ile giriş yapan ve ismi olmayan kullanıcılara
// isim girişi yaptıran modal. İsim girilmeden uygulamaya geçilemez.
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useThemeColors, Spacing, Radius, FontSize } from '../lib/constants';

export default function NameEntryModal({
  visible,
  onDone,
}: {
  visible: boolean;
  onDone: () => void;
}): React.ReactElement | null {
  const C = useThemeColors();
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Lütfen isminizi girin.');
      return;
    }
    if (trimmed.length < 2) {
      setError('İsim en az 2 karakter olmalı.');
      return;
    }
    const uid = user?.id;
    if (!uid) {
      setError('Oturum bulunamadı. Lütfen tekrar deneyin.');
      return;
    }

    setIsSaving(true);
    try {
      const { error: updateError } = await supabase
        .from('users')
        .update({ full_name: trimmed })
        .eq('id', uid);
      if (updateError) {
        setError('İsim kaydedilemedi. Lütfen tekrar deneyin.');
        return;
      }
      await supabase.auth.updateUser({ data: { full_name: trimmed } });
      onDone();
    } catch {
      setError('Bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={styles.emoji}>👋</Text>
          <Text style={[styles.title, { color: C.text }]}>İsmini Gir</Text>
          <Text style={[styles.subtitle, { color: C.textSecondary }]}>
            Devam etmek için lütfen adını soyadını gir.
          </Text>

          <TextInput
            style={[
              styles.input,
              { backgroundColor: C.background, borderColor: C.border, color: C.text },
            ]}
            placeholder="Ayşe Yılmaz"
            placeholderTextColor={C.placeholder}
            autoCapitalize="words"
            autoComplete="name"
            value={name}
            onChangeText={(t) => {
              setName(t);
              setError(null);
            }}
            editable={!isSaving}
          />

          {error && (
            <View
              style={[
                styles.errorBox,
                { backgroundColor: C.error + '15', borderColor: C.error + '40' },
              ]}
            >
              <Text style={[styles.errorText, { color: C.error }]}>⚠️ {error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: C.primary }, isSaving && styles.btnDisabled]}
            activeOpacity={0.85}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.btnText}>Kaydet</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  emoji: { fontSize: 44, textAlign: 'center' },
  title: { fontSize: FontSize.xxl, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: FontSize.md, textAlign: 'center', lineHeight: 22 },
  input: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: FontSize.md,
    marginTop: Spacing.sm,
  },
  errorBox: { borderWidth: 1, borderRadius: Radius.sm, padding: Spacing.sm },
  errorText: { fontSize: FontSize.sm, fontWeight: '500' },
  btn: {
    paddingVertical: 16,
    borderRadius: Radius.full,
    alignItems: 'center',
    marginTop: Spacing.sm,
    shadowColor: '#D4526E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  btnText: { color: '#FFF', fontSize: FontSize.lg, fontWeight: '700' },
  btnDisabled: { opacity: 0.7 },
});

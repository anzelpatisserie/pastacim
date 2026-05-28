import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { supabase, useAuth, useThemeColors, Spacing, Radius, FontSize } from '@pastacim/shared';

export default function BakerSetupScreen() {
  const C = useThemeColors();
  const { refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return setError('Dükkan adı gerekli.');
    if (!address.trim()) return setError('Adres gerekli.');

    setIsLoading(true);
    setError(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcError } = await (supabase as any).rpc('create_shop', {
      p_name: name.trim(),
      p_description: description.trim() || null,
      p_address: address.trim(),
      p_latitude: null,
      p_longitude: null,
    });

    setIsLoading(false);

    if (rpcError) {
      Alert.alert('Hata', 'Dükkan oluşturulamadı. Lütfen tekrar deneyin.');
      return;
    }

    await refreshProfile();
    router.replace('/(baker)');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: C.text }]}>🧑‍🍳 Dükkanını Kur</Text>
        <Text style={[styles.subtitle, { color: C.textSecondary }]}>
          Pastacım Pro'yu kullanmak için önce bir dükkan oluşturman gerekiyor.
        </Text>

        <View style={styles.form}>
          <Text style={[styles.label, { color: C.textSecondary }]}>Dükkan Adı *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
            placeholder="Örn: Ayşe'nin Pastanesi"
            placeholderTextColor={C.placeholder}
            value={name}
            onChangeText={(t) => { setName(t); setError(null); }}
          />

          <Text style={[styles.label, { color: C.textSecondary }]}>Açıklama (opsiyonel)</Text>
          <TextInput
            style={[styles.input, styles.multiline, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
            placeholder="Dükkanınız hakkında kısa bir bilgi..."
            placeholderTextColor={C.placeholder}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <Text style={[styles.label, { color: C.textSecondary }]}>Adres *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
            placeholder="Mahalle, İlçe, İl"
            placeholderTextColor={C.placeholder}
            value={address}
            onChangeText={(t) => { setAddress(t); setError(null); }}
          />

          {error && (
            <View style={[styles.errorBox, { backgroundColor: C.error + '15', borderColor: C.error + '40' }]}>
              <Text style={[styles.errorText, { color: C.error }]}>⚠️ {error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: C.primary }, isLoading && styles.btnDisabled]}
            onPress={handleCreate}
            disabled={isLoading}
          >
            {isLoading
              ? <ActivityIndicator color="#FFF" />
              : <Text style={styles.btnText}>🏪 Dükkanı Oluştur</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingTop: 72 },
  title: { fontSize: FontSize.xxl, fontWeight: '800', marginBottom: Spacing.xs },
  subtitle: { fontSize: FontSize.md, lineHeight: 22, marginBottom: Spacing.md },
  form: { gap: Spacing.md },
  label: { fontSize: FontSize.sm, fontWeight: '600' },
  input: {
    borderWidth: 1.5, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
    fontSize: FontSize.md,
  },
  multiline: { height: 90 },
  errorBox: { borderWidth: 1, borderRadius: Radius.sm, padding: Spacing.sm },
  errorText: { fontSize: FontSize.sm, fontWeight: '500' },
  btn: {
    paddingVertical: 16, borderRadius: Radius.full,
    alignItems: 'center', marginTop: Spacing.sm,
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#FFF', fontSize: FontSize.lg, fontWeight: '700' },
});

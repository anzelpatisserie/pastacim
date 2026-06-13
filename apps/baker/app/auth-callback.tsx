import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase, useThemeColors, FontSize, Spacing } from '@pastacim/shared';

export default function AuthCallback() {
  const C = useThemeColors();
  const [statusText, setStatusText] = useState('Doğrulanıyor…');

  useEffect(() => {
    (async () => {
      try {
        const url = (await Linking.getInitialURL()) ?? '';
        if (!url) {
          router.replace('/');
          return;
        }

        const hashIdx = url.indexOf('#');
        if (hashIdx >= 0) {
          const hp = new URLSearchParams(url.substring(hashIdx + 1));
          const at = hp.get('access_token');
          const rt = hp.get('refresh_token');
          if (at && rt) {
            const { error } = await supabase.auth.setSession({
              access_token: at,
              refresh_token: rt,
            });
            if (error) setStatusText('Oturum oluşturulamadı: ' + error.message);
            router.replace('/');
            return;
          }
        }

        const qIdx = url.indexOf('?');
        if (qIdx >= 0) {
          const qp = new URLSearchParams(url.substring(qIdx + 1).split('#')[0]);
          const code = qp.get('code');
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(url);
            if (error) setStatusText('Oturum oluşturulamadı: ' + error.message);
            router.replace('/');
            return;
          }
        }

        router.replace('/');
      } catch (e) {
        setStatusText('Hata: ' + (e instanceof Error ? e.message : 'bilinmeyen'));
        setTimeout(() => router.replace('/'), 1500);
      }
    })();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ActivityIndicator size="large" color={C.primary} />
      <Text style={[styles.text, { color: C.text }]}>{statusText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  text: { fontSize: FontSize.md, fontWeight: '600' },
});

import { useEffect, useRef, useState } from 'react';
import { Linking, View, Platform } from 'react-native';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useAuth, navigateFromNotification, supabase, SplashAnimation, NameEntryModal, WebStoreBanner, installWebAlert, installWebRootStyle } from '@pastacim/shared';
import type { NotificationRole } from '@pastacim/shared';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

// Web'de Alert.alert NO-OP → window.confirm/alert ile çalışır hale getir.
installWebAlert();
// Web'de #root'u dinamik viewport'a (100dvh) sabitle (mobil araç çubuğu fix).
installWebRootStyle();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  // Web'de splash'ı atla: OAuth dönüşünde tam-sayfa reload splash'ı tekrar
  // oynatır + web'de native-açılış hissi gereksiz.
  const [showSplash, setShowSplash] = useState(Platform.OS !== 'web');

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  // Native splash'ı hemen kapatma — SplashAnimation görünür olduğunda kapat
  useEffect(() => {
    if (fontsLoaded) {
      // Bir kare sonra hide et — SplashAnimation render bitsin ki ekran boş kalmasın
      requestAnimationFrame(() => { SplashScreen.hideAsync().catch(() => {}); });
    }
  }, [fontsLoaded]);

  // Eager OTA: app her açıldığında son güncellemeyi indir ve hemen uygula.
  useEffect(() => {
    (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {
        // dev build veya network sorunu — sessiz geç
      }
    })();
  }, []);

  if (showSplash) {
    return (
      <>
        <StatusBar style="light" />
        <SplashAnimation appName="Pastacım" onComplete={() => setShowSplash(false)} />
      </>
    );
  }

  if (!fontsLoaded) return null;

  return <RootLayoutNav />;
}

async function handleAuthUrl(url: string) {
  // Implicit flow: e-posta doğrulama / şifre sıfırlama sonrası
  // #access_token=...&refresh_token=...
  if (url.includes('#')) {
    const [base, fragment] = url.split('#');
    const params: Record<string, string> = {};
    fragment.split('&').forEach((pair) => {
      const [k, v] = pair.split('=');
      if (k && v) params[k] = decodeURIComponent(v);
    });
    // Şifre sıfırlama tipi kontrolü (query string'den)
    const isRecovery = base.includes('type=recovery') || params.type === 'recovery';
    if (params.access_token && params.refresh_token) {
      try {
        await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
        if (isRecovery) {
          router.replace('/(auth)/reset-password');
        }
      } catch (e) {
        console.error('[handleAuthUrl] setSession failed:', e);
      }
    }
    return;
  }
  // NOT: PKCE (?code=...) deep-link burada işlenmiyor.
  // signInWithGoogle (useAuth.ts) zaten openAuthSessionAsync sonucunu işliyor;
  // burada paralel exchange yapmak PKCE kodunu tüketip yarış yaratıyor.
}

function RootLayoutNav() {
  const { isLoading, isAuthenticated, profile, refreshProfile } = useAuth();
  const notificationListener = useRef<Notifications.Subscription | null>(null);

  // İsim kapısı: Apple "E-postamı Gizle" ile giriş yapan kullanıcılarda full_name
  // boş kalabilir. Bu durumda isim girilene kadar NameEntryModal'i göster.
  const needsName =
    isAuthenticated && !!profile && !(profile.full_name && profile.full_name.trim());

  useEffect(() => {
    // Handle deep link opened while app is running
    const sub = Linking.addEventListener('url', ({ url }) => handleAuthUrl(url));
    // Handle deep link that launched the app cold
    Linking.getInitialURL().then((url) => { if (url) handleAuthUrl(url); });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace('/(auth)/onboarding');
      return;
    }

    // Profil yüklenmeden müşteri tabbar'ına yönlendirme — aksi halde
    // ekranlar profile-bağımlı veriyi (avatar, isim, sipariş listesi vb.)
    // ilk render'da bulamadan açılır ve "hesaba tam bağlanmadı" hissi yaratır.
    // Google OAuth sonrası bu özellikle belirgindir.
    if (!profile) return;

    router.replace('/(customer)');
  }, [isLoading, isAuthenticated, profile]);

  useEffect(() => {
    if (!isAuthenticated) return;

    notificationListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const type = response.notification.request.content.data?.type as string | undefined;
        const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
        if (type) navigateFromNotification(type, data, 'customer' as NotificationRole);
      },
    );

    return () => {
      notificationListener.current?.remove();
      notificationListener.current = null;
    };
  }, [isAuthenticated]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <WebStoreBanner
        appName="Pastacım"
        iosUrl="https://apps.apple.com/tr/app/pastac%C4%B1m/id6778031428"
        androidUrl="https://play.google.com/store/apps/details?id=com.pastacim.customer"
      />
      <StatusBar style="auto" />
      <View nativeID="pastacim-nav" style={{ flex: 1, minHeight: 0 }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(customer)" />
          <Stack.Screen name="messages/[conversationId]" options={{ headerShown: false }} />
        </Stack>
      </View>
      <NameEntryModal visible={needsName} onDone={refreshProfile} />
    </GestureHandlerRootView>
  );
}

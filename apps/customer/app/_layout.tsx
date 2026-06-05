import { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';

import { useAuth, navigateFromNotification, supabase, SplashAnimation } from '@pastacim/shared';
import type { NotificationRole } from '@pastacim/shared';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

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
  const [showSplash, setShowSplash] = useState(true);

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

function handleAuthUrl(url: string) {
  // Supabase appends session tokens as a URL fragment after email verification
  const fragment = url.includes('#') ? url.split('#')[1] : '';
  if (!fragment) return;
  const pairs = fragment.split('&');
  const params: Record<string, string> = {};
  pairs.forEach((pair) => {
    const [k, v] = pair.split('=');
    if (k && v) params[k] = decodeURIComponent(v);
  });
  if (params.access_token && params.refresh_token) {
    supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
  }
}

function RootLayoutNav() {
  const { isLoading, isAuthenticated } = useAuth();
  const notificationListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    // Handle deep link opened while app is running
    const sub = Linking.addEventListener('url', ({ url }) => handleAuthUrl(url));
    // Handle deep link that launched the app cold
    Linking.getInitialURL().then((url) => { if (url) handleAuthUrl(url); });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    router.replace(isAuthenticated ? '/(customer)' : '/(auth)/onboarding');
  }, [isLoading, isAuthenticated]);

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
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(customer)" />
        <Stack.Screen name="messages/[conversationId]" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

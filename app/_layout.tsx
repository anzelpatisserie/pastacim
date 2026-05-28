import { useEffect, useRef } from 'react';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';

import { useAuth } from '@/hooks/useAuth';
import { navigateFromNotification, type NotificationRole } from '@/lib/notifications';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

// Foreground bildirim davranışı — TEK yerde tanımla
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const { isLoading, isAuthenticated, role } = useAuth();
  const notificationListener = useRef<Notifications.Subscription | null>(null);

  // ─── Auth durumuna göre yönlendir ────────────────────────────────────────
  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace('/(auth)/onboarding');
      return;
    }

    if (role === 'baker') {
      router.replace('/(baker)');
    } else {
      router.replace('/(customer)');
    }
  }, [isLoading, isAuthenticated, role]);

  // ─── OS Push Bildirim Tap Dinleyici ──────────────────────────────────────
  useEffect(() => {
    if (!role) return;

    notificationListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const { notification } = response;
        const type = notification.request.content.data?.type as string | undefined;
        const data = (notification.request.content.data ?? {}) as Record<string, unknown>;
        if (type) {
          navigateFromNotification(type, data, role as NotificationRole);
        }
      },
    );

    return () => {
      notificationListener.current?.remove();
      notificationListener.current = null;
    };
  }, [role]);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(customer)" />
        <Stack.Screen name="(baker)" />
        <Stack.Screen name="messages/[conversationId]" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

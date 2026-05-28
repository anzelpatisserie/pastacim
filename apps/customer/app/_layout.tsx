import { useEffect, useRef } from 'react';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';

import { useAuth, navigateFromNotification } from '@pastacim/shared';
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
  const { isLoading, isAuthenticated } = useAuth();
  const notificationListener = useRef<Notifications.Subscription | null>(null);

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

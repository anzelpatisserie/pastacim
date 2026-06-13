import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="login" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="register" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="terms" options={{ animation: 'slide_from_right', presentation: 'modal' }} />
      <Stack.Screen name="privacy" options={{ animation: 'slide_from_right', presentation: 'modal' }} />
    </Stack>
  );
}

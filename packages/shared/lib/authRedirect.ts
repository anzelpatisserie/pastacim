import { Platform } from 'react-native';
import { makeRedirectUri } from 'expo-auth-session';

/**
 * Auth (Google OAuth / e-posta doğrulama / şifre sıfırlama) sonrası dönülecek
 * redirect URL'i platforma göre döndürür.
 *
 * - Native: app scheme deep-link (`pastacim://auth-callback`) — WebBrowser akışı bunu yakalar.
 * - Web: mevcut web origin (`https://pastacim.ipekciapp.com`). App scheme web'de
 *   tarayıcıyı "uygulamayı aç"a yönlendirip akışı kırar. Web'de `detectSessionInUrl`
 *   dönüşteki token'ı otomatik yakalar; recovery tipi de Supabase tarafından
 *   fragment'e eklenir, root layout handleAuthUrl bunu işler.
 *
 * @param scheme Native app scheme (customer: 'pastacim', baker: 'pastacim-pro')
 * @param recovery Şifre sıfırlama akışı için native'de `?type=recovery` ekler.
 */
export function authRedirectUrl(scheme: string, recovery = false): string {
  if (Platform.OS === 'web') {
    return globalThis.location?.origin ?? '';
  }
  const base = makeRedirectUri({ scheme, path: 'auth-callback' });
  return recovery ? `${base}?type=recovery` : base;
}

import { Platform, Share } from 'react-native';

/**
 * Platformlar arası paylaşım. Native'de `Share.share`; web'de `navigator.share`
 * (varsa) yoksa panoya kopyalama fallback'i. react-native Share web'de masaüstü
 * tarayıcıda çoğu zaman çalışmaz → bu helper güvenli davranır.
 */
export async function shareApp(opts: { message: string; title?: string }): Promise<void> {
  const { message, title } = opts;
  if (Platform.OS === 'web') {
    const nav = globalThis.navigator as
      | (Navigator & { share?: (d: { text?: string; title?: string }) => Promise<void> })
      | undefined;
    try {
      if (nav?.share) {
        await nav.share({ text: message, title });
        return;
      }
      await nav?.clipboard?.writeText(message);
      globalThis.alert?.('Bağlantı panoya kopyalandı 📋');
    } catch {
      // kullanıcı iptal etti veya desteklenmiyor — sessiz geç
    }
    return;
  }
  await Share.share(title ? { message, title } : { message });
}

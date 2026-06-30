import { Alert, Platform } from 'react-native';

type Btn = { text?: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' };

/**
 * react-native-web'de `Alert.alert` NO-OP'tur → çıkış yap, sil, onay gibi tüm
 * Alert tabanlı butonlar web'de çalışmaz. Bu fonksiyon `Alert.alert`'i web'de
 * `window.confirm`/`window.alert` kullanacak şekilde patch'ler. Mevcut tüm
 * `Alert.alert(...)` çağrıları DEĞİŞMEDEN çalışır. Native'de hiçbir etkisi yok.
 *
 * Root layout'ta modül seviyesinde bir kez çağrılır.
 */
export function installWebAlert(): void {
  if (Platform.OS !== 'web') return;
  const patched = Alert as unknown as { __webPatched?: boolean };
  if (patched.__webPatched) return;
  patched.__webPatched = true;

  Alert.alert = ((title: string, message?: string, buttons?: Btn[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');

    // Bilgi kutusu (0-1 buton): alert + varsa onPress
    if (!buttons || buttons.length === 0) {
      globalThis.alert?.(text);
      return;
    }
    if (buttons.length === 1) {
      globalThis.alert?.(text);
      buttons[0].onPress?.();
      return;
    }

    // 2+ buton: confirm (Tamam/İptal). cancel-style = İptal dalı.
    const confirmBtn = buttons.find((b) => b.style !== 'cancel') ?? buttons[buttons.length - 1];
    const cancelBtn = buttons.find((b) => b.style === 'cancel');
    const ok = globalThis.confirm?.(text) ?? false;
    if (ok) confirmBtn?.onPress?.();
    else cancelBtn?.onPress?.();
  }) as typeof Alert.alert;
}

import { Alert, Linking } from 'react-native';

/**
 * Adresi haritada açma seçici (Google Maps / Yandex).
 * Koordinat varsa onu, yoksa adres metnini kullanır.
 */
export function openAddressInMaps(
  address?: string | null,
  lat?: number | null,
  lng?: number | null,
): void {
  const hasCoords = typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng);
  const text = (address ?? '').trim();
  if (!hasCoords && !text) return;

  const encText = encodeURIComponent(text || `${lat},${lng}`);
  const googleUrl = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encText}`;
  const yandexUrl = hasCoords
    ? `https://yandex.com/maps/?ll=${lng},${lat}&z=16&pt=${lng},${lat}`
    : `https://yandex.com/maps/?text=${encText}`;

  Alert.alert(
    'Haritada Aç',
    text || undefined,
    [
      { text: 'Google Maps', onPress: () => { Linking.openURL(googleUrl).catch(() => {}); } },
      { text: 'Yandex', onPress: () => { Linking.openURL(yandexUrl).catch(() => {}); } },
      { text: 'Vazgeç', style: 'cancel' },
    ],
  );
}

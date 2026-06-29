import React from 'react';
import { Platform, View, Text, Pressable, Linking, StyleSheet, ViewStyle } from 'react-native';

// Web banner yüksekliği — root layout navigator'a bu kadar paddingTop verir
// (banner position:fixed olduğundan akıştan çıkar; içerik altında kalmasın diye).
export const WEB_BANNER_HEIGHT = 52;

type Props = {
  appName: string;
  iosUrl?: string;
  androidUrl?: string;
};

// position:'fixed' RN tiplerinde yok ama react-native-web destekler.
const fixedTop = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 1000,
} as unknown as ViewStyle;

export function WebStoreBanner({ appName, iosUrl, androidUrl }: Props) {
  if (Platform.OS !== 'web') return null;
  return (
    <View style={[styles.bar, fixedTop]}>
      <Text style={styles.brand}>{appName}</Text>
      <View style={styles.links}>
        {iosUrl ? (
          <Pressable onPress={() => Linking.openURL(iosUrl)} style={styles.btn}>
            <Text style={styles.btnText}>App Store</Text>
          </Pressable>
        ) : null}
        {androidUrl ? (
          <Pressable onPress={() => Linking.openURL(androidUrl)} style={styles.btn}>
            <Text style={styles.btnText}>Google Play</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: WEB_BANNER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#8B1A3D',
  },
  brand: { color: '#fff', fontWeight: '700', fontSize: 16 },
  links: { flexDirection: 'row', gap: 8 },
  btn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});

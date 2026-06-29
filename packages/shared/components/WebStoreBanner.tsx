import React from 'react';
import { Platform, View, Text, Pressable, Linking, StyleSheet } from 'react-native';

type Props = {
  appName: string;
  iosUrl?: string;
  androidUrl?: string;
};

export function WebStoreBanner({ appName, iosUrl, androidUrl }: Props) {
  if (Platform.OS !== 'web') return null;
  return (
    <View style={styles.bar}>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
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

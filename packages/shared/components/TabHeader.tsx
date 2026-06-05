import { View, Text, StyleSheet, TouchableOpacity, GestureResponderEvent } from 'react-native';
import { useThemeColors, Spacing, Radius, FontSize } from '../lib/constants';

type Props = {
  title: string;
  subtitle?: string;
  unreadCount?: number;
  onBellPress: (e?: GestureResponderEvent) => void;
  /** + butonu eklemek için (örn. customer "Teklif Al" kısayolu) */
  onAddPress?: (e?: GestureResponderEvent) => void;
  /** Sağ tarafta ek bir buton (geri vs.) — opsiyonel */
  rightAccessory?: React.ReactNode;
  /** Sol tarafta ek bir buton (geri vs.) — opsiyonel */
  leftAccessory?: React.ReactNode;
};

export default function TabHeader({
  title, subtitle, unreadCount = 0, onBellPress, onAddPress, rightAccessory, leftAccessory,
}: Props) {
  const C = useThemeColors();
  return (
    <View style={[styles.container, { borderBottomColor: C.border, backgroundColor: C.background }]}>
      {leftAccessory ? <View style={styles.side}>{leftAccessory}</View> : null}
      <View style={styles.titleArea}>
        <Text style={[styles.title, { color: C.text }]} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: C.textSecondary }]} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
      <View style={styles.side}>
        <TouchableOpacity
          onPress={onBellPress}
          style={styles.bellBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.bellIcon}>🔔</Text>
          {unreadCount > 0 && (
            <View style={[styles.badge, { backgroundColor: C.primary }]}>
              <Text style={styles.badgeText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        {onAddPress && (
          <TouchableOpacity
            onPress={onAddPress}
            style={[styles.addBtn, { backgroundColor: C.primary }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.8}
          >
            <Text style={styles.addIcon}>+</Text>
          </TouchableOpacity>
        )}
        {rightAccessory}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    gap: Spacing.sm,
  },
  side: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  titleArea: { flex: 1 },
  title: { fontSize: FontSize.xl, fontWeight: '800' },
  subtitle: { fontSize: FontSize.xs, marginTop: 2 },
  bellBtn: { position: 'relative', padding: 4 },
  bellIcon: { fontSize: 22 },
  addBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 3,
  },
  addIcon: { color: '#FFF', fontSize: 22, fontWeight: '300', marginTop: -2 },
  badge: {
    position: 'absolute', top: 0, right: 0,
    minWidth: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
});

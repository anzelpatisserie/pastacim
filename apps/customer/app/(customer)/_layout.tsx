import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors, useAuth } from '@pastacim/shared';
import { useNotifications } from '@/hooks/useNotifications';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';

function TabIcon({ emoji, label, focused, activeColor, inactiveColor, badge }: {
  emoji: string; label: string; focused: boolean;
  activeColor: string; inactiveColor: string; badge?: number;
}) {
  return (
    <View style={styles.tabItem}>
      <View>
        <Text style={styles.tabEmoji}>{emoji}</Text>
        {badge != null && badge > 0 && (
          <View style={[styles.badge, { backgroundColor: activeColor }]}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.tabLabel, { color: focused ? activeColor : inactiveColor }]}>{label}</Text>
    </View>
  );
}

export default function CustomerLayout() {
  const C = useThemeColors();
  const { user } = useAuth();
  const { unreadCount } = useNotifications(user?.id);
  const { unreadMessages } = useUnreadMessages(user?.id);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.tabBar, borderTopColor: C.tabBarBorder,
          borderTopWidth: 1, paddingBottom: 8, paddingTop: 8, height: 64,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen name="index" options={{
        tabBarIcon: ({ focused }) => (
          <TabIcon emoji="🏠" label="Keşfet" focused={focused} activeColor={C.primary} inactiveColor={C.icon} />
        ),
      }} />
      <Tabs.Screen name="my-orders" options={{
        tabBarIcon: ({ focused }) => (
          <TabIcon emoji="📦" label="Sipariş" focused={focused} activeColor={C.primary} inactiveColor={C.icon} />
        ),
      }} />
      <Tabs.Screen name="order/create" options={{
        tabBarIcon: () => (
          <View style={[styles.createBtn, { backgroundColor: C.primary }]}>
            <Text style={styles.createBtnText}>+</Text>
          </View>
        ),
      }} />
      <Tabs.Screen name="messages" options={{
        tabBarIcon: ({ focused }) => (
          <TabIcon emoji="💬" label="Mesajlar" focused={focused} activeColor={C.primary} inactiveColor={C.icon} badge={unreadMessages} />
        ),
      }} />
      <Tabs.Screen name="notifications" options={{
        tabBarIcon: ({ focused }) => (
          <TabIcon emoji="🔔" label="Bildirim" focused={focused} activeColor={C.primary} inactiveColor={C.icon} badge={unreadCount} />
        ),
      }} />
      <Tabs.Screen name="offers/[orderId]" options={{ href: null }} />
      <Tabs.Screen name="order/[id]" options={{ href: null }} />
      <Tabs.Screen name="review/[orderId]" options={{ href: null }} />
      <Tabs.Screen name="baker/[shopId]" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabItem: { alignItems: 'center', gap: 2 },
  tabEmoji: { fontSize: 22 },
  tabLabel: { fontSize: 10, fontWeight: '600' },
  badge: {
    position: 'absolute', top: -4, right: -8,
    minWidth: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  createBtn: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    shadowColor: '#D4526E', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  createBtnText: { color: '#FFF', fontSize: 28, fontWeight: '300', marginTop: -2 },
});

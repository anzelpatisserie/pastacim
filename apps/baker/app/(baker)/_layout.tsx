import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors, useAuth } from '@pastacim/shared';
import { useNotifications } from '../../hooks/useNotifications';
import { useUnreadMessages } from '../../hooks/useUnreadMessages';

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

export default function BakerLayout() {
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
          <TabIcon emoji="📋" label="Talepler" focused={focused} activeColor={C.primary} inactiveColor={C.icon} />
        ),
      }} />
      <Tabs.Screen name="my-orders" options={{
        tabBarIcon: ({ focused }) => (
          <TabIcon emoji="✅" label="Siparişlerim" focused={focused} activeColor={C.primary} inactiveColor={C.icon} />
        ),
      }} />
      <Tabs.Screen name="messages" options={{
        tabBarIcon: ({ focused }) => (
          <TabIcon emoji="💬" label="Mesajlar" focused={focused} activeColor={C.primary} inactiveColor={C.icon} badge={unreadMessages} />
        ),
      }} />
      <Tabs.Screen name="notifications" options={{
        tabBarIcon: ({ focused }) => (
          <TabIcon emoji="🔔" label="Bildirimler" focused={focused} activeColor={C.primary} inactiveColor={C.icon} badge={unreadCount} />
        ),
      }} />
      <Tabs.Screen name="wallet" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{
        tabBarIcon: ({ focused }) => (
          <TabIcon emoji="👤" label="Profilim" focused={focused} activeColor={C.primary} inactiveColor={C.icon} />
        ),
      }} />
      <Tabs.Screen name="offer/[orderId]" options={{ href: null }} />
      <Tabs.Screen name="setup" options={{ href: null }} />
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
});

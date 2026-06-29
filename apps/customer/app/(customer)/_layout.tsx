import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, useAuth } from '@pastacim/shared';
import { useNotifications } from '@/hooks/useNotifications';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';

function TabIcon({ emoji, focused, activeColor, inactiveColor, badge }: {
  emoji: string; focused: boolean;
  activeColor: string; inactiveColor: string; badge?: number;
}) {
  return (
    <View>
      <Text style={[styles.tabEmoji, { opacity: focused ? 1 : 0.55 }]}>{emoji}</Text>
      {badge != null && badge > 0 && (
        <View style={[styles.badge, { backgroundColor: activeColor }]}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </View>
  );
}

export default function CustomerLayout() {
  const C = useThemeColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  useNotifications(user?.id);
  const { unreadMessages } = useUnreadMessages(user?.id);

  return (
    <Tabs
      initialRouteName="my-orders"
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.icon,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarItemStyle: { paddingVertical: 4 },
        tabBarStyle: {
          backgroundColor: C.tabBar, borderTopColor: C.tabBarBorder,
          borderTopWidth: 1, paddingBottom: insets.bottom + 4, paddingTop: 6,
          height: 64 + insets.bottom,
        },
      }}
    >
      <Tabs.Screen name="my-orders" options={{
        title: 'Siparişlerim',
        tabBarLabel: 'Siparişlerim',
        tabBarIcon: ({ focused }) => (
          <TabIcon emoji="📦" focused={focused} activeColor={C.primary} inactiveColor={C.icon} />
        ),
      }} />
      <Tabs.Screen name="messages" options={{
        title: 'Mesajlar',
        tabBarLabel: 'Mesajlar',
        tabBarIcon: ({ focused }) => (
          <TabIcon emoji="💬" focused={focused} activeColor={C.primary} inactiveColor={C.icon} badge={unreadMessages} />
        ),
      }} />
      <Tabs.Screen name="profile" options={{
        title: 'Profil',
        tabBarLabel: 'Profil',
        tabBarIcon: ({ focused }) => (
          <TabIcon emoji="👤" focused={focused} activeColor={C.primary} inactiveColor={C.icon} />
        ),
      }} />
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="admin-feedbacks" options={{ href: null }} />
      <Tabs.Screen name="admin-dashboard" options={{ href: null }} />
      <Tabs.Screen name="admin-notifications" options={{ href: null }} />
      <Tabs.Screen name="admin-emails" options={{ href: null }} />
      <Tabs.Screen name="admin-reports" options={{ href: null }} />
      <Tabs.Screen name="order/create" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="offers/[orderId]" options={{ href: null }} />
      <Tabs.Screen name="order/[id]" options={{ href: null }} />
      <Tabs.Screen name="review/[orderId]" options={{ href: null }} />
      <Tabs.Screen name="baker/[shopId]" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabEmoji: { fontSize: 22 },
  badge: {
    position: 'absolute', top: -4, right: -8,
    minWidth: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
});

import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image,
  TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { router, useFocusEffect } from 'expo-router';
import { rpcGetConversations, rpcDeleteConversation, useThemeColors, useAuth, Spacing, Radius, FontSize, TabHeader, safeAvatarUri } from '@pastacim/shared';
import type { Database } from '@pastacim/shared';
import { useNotifications } from '@/hooks/useNotifications';

type Conversation = Database['public']['Functions']['get_conversations']['Returns'][number];

export default function CustomerMessagesScreen() {
  const C = useThemeColors();
  const { user } = useAuth();
  const { unreadCount } = useNotifications(user?.id);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchConvs = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    const { data } = await rpcGetConversations();
    setConvs((data ?? []) as Conversation[]);
    if (refresh) setIsRefreshing(false);
    else setIsLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchConvs(); }, [fetchConvs]));

  const handleDelete = useCallback((otherUserId: string) => {
    Alert.alert('Konuşmayı Sil', 'Bu konuşma ve mesajları sizin için silinsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil', style: 'destructive',
        onPress: async () => {
          setConvs((prev) => prev.filter((c) => c.other_user_id !== otherUserId));
          await rpcDeleteConversation(otherUserId);
        },
      },
    ]);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <TabHeader
        title="Mesajlar"
        unreadCount={unreadCount}
        onBellPress={() => router.push('/(customer)/notifications' as never)}
        onAddPress={() => router.push('/(customer)/order/create')}
      />

      {isLoading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : convs.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>💬</Text>
          <Text style={[styles.emptyTitle, { color: C.text }]}>Henüz mesaj yok</Text>
          <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>
            Teklif kabul ettikten sonra pastacıyla mesajlaşabilirsiniz
          </Text>
        </View>
      ) : (
        <FlatList
          data={convs}
          keyExtractor={(item) => item.other_user_id}
          renderItem={({ item }) => <ConvRow item={item} colors={C} onDelete={handleDelete} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={() => fetchConvs(true)} tintColor={C.primary} />
          }
        />
      )}
    </View>
  );
}

function ConvRow({ item, colors: C, onDelete }: { item: Conversation; colors: ReturnType<typeof useThemeColors>; onDelete: (otherUserId: string) => void }) {
  const hasUnread = item.unread_count > 0;
  const timeStr = item.last_message_at ? formatTime(item.last_message_at) : '';

  return (
    <Swipeable
      overshootRight={false}
      renderRightActions={() => (
        <TouchableOpacity
          style={[styles.deleteAction, { backgroundColor: C.error }]}
          onPress={() => onDelete(item.other_user_id)}
          activeOpacity={0.85}
        >
          <Text style={styles.deleteActionText}>🗑{'\n'}Sil</Text>
        </TouchableOpacity>
      )}
    >
    <TouchableOpacity
      style={[styles.row, { backgroundColor: C.card, borderColor: C.border }]}
      onPress={() => router.push({
        pathname: '/messages/[conversationId]',
        params: { conversationId: item.other_user_id },
      })}
      activeOpacity={0.75}
    >
      {safeAvatarUri(item.other_user_avatar) ? (
        <Image source={{ uri: safeAvatarUri(item.other_user_avatar)! }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: C.primary + '22' }]}>
          <Text style={styles.avatarEmoji}>🎂</Text>
        </View>
      )}

      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.rowTop}>
          <Text style={[styles.name, { color: C.text }]} numberOfLines={1}>
            {item.other_user_name ?? 'Pastacı'}
          </Text>
          <Text style={[styles.time, { color: C.placeholder }]}>{timeStr}</Text>
        </View>

        <View style={styles.lastMsgRow}>
          <Text
            style={[styles.lastMsg, { color: hasUnread ? C.text : C.textSecondary, fontWeight: hasUnread ? '600' : '400' }]}
            numberOfLines={1}
          >
            {item.last_message ?? 'Henüz mesaj yok'}
          </Text>
          {hasUnread && (
            <View style={[styles.badge, { backgroundColor: C.primary }]}>
              <Text style={styles.badgeText}>{item.unread_count > 99 ? '99+' : item.unread_count}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
    </Swipeable>
  );
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Dün';
  if (diffDays < 7) return d.toLocaleDateString('tr-TR', { weekday: 'short' });
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  title: { fontSize: FontSize.xl, fontWeight: '800' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  emptySubtitle: { fontSize: FontSize.md, textAlign: 'center' },
  list: { paddingVertical: Spacing.xs },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarEmoji: { fontSize: 24 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: FontSize.md, fontWeight: '700', flex: 1 },
  time: { fontSize: FontSize.xs, flexShrink: 0 },
  lastMsgRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  lastMsg: { fontSize: FontSize.sm, flex: 1 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, flexShrink: 0 },
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  deleteAction: {
    justifyContent: 'center', alignItems: 'center',
    width: 84, marginVertical: 1,
  },
  deleteActionText: { color: '#FFF', fontSize: FontSize.xs, fontWeight: '800', textAlign: 'center' },
});

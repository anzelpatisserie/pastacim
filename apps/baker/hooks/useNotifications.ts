/**
 * useNotifications
 *
 * Yalnızca tab bar badge sayısını yönetir.
 * Bildirim listesi NotificationsScreen'in kendi yerel state'indedir
 * → çift Supabase kanalı / çift listener sorunu ortadan kalkar.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@pastacim/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

export function useNotifications(userId?: string) {
  const [unreadCount, setUnreadCount] = useState(0);

  // Push token kaydı — sadece bir kez
  useEffect(() => {
    if (!userId) return;
    registerForPush(userId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Badge sayısı + realtime
  const fetchUnread = useCallback(async (uid: string) => {
    const { count } = await _db
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', uid)
      .eq('is_read', false);
    setUnreadCount(count ?? 0);
  }, []);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetchUnread(userId);

    // Önceki kanalı temizle, sonra yeni oluştur
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`notif_badge:${userId}:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => fetchUnread(userId),
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId, fetchUnread]);

  // Sayfa odağa gelince badge'i tazele — realtime kaçırma durumlarına karşı garanti güncelleme
  useFocusEffect(
    useCallback(() => {
      if (userId) fetchUnread(userId);
    }, [userId, fetchUnread])
  );

  return { unreadCount };
}

// ─── Push Token Kaydı ────────────────────────────────────────────────────────
async function registerForPush(uid: string) {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Pastacım',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#D4526E',
      sound: 'default',
    });
  }

  const { status } = await Notifications.getPermissionsAsync();
  let finalStatus = status;
  if (status !== 'granted') {
    const { status: s } = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    finalStatus = s;
  }
  if (finalStatus !== 'granted') return;

  try {
    // Kaynak önceliği:
    // 1. Constants.easConfig.projectId  → Expo Go + EAS Build otomatik doldurur
    // 2. app.json extra.eas.projectId   → manuel tanımlı fallback
    const extra     = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
    const easExtra  = extra?.eas as Record<string, unknown> | undefined;
    const projectId: string | undefined =
      (Constants.easConfig as { projectId?: string } | undefined)?.projectId ??
      (easExtra?.projectId as string | undefined);

    if (!projectId) {
      console.warn(
        '[Push] projectId bulunamadı.\n' +
        'Expo Go için: npx eas-cli@latest init komutunu çalıştırın.\n' +
        'Veya app.json > extra.eas.projectId alanını doldurun.'
      );
      return;
    }

    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    // SECURITY DEFINER RPC: aynı token başka kullanıcıda varsa önce temizler
    await _db.rpc('register_push_token', { p_token: result.data });
    console.log('[Push] Token kaydedildi:', result.data);
  } catch (err) {
    console.warn('[Push] Token alınamadı:', err);
  }
}

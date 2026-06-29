/// <reference path="../types/react-native-url-polyfill-auto.d.ts" />

import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { Database } from '../types/database.types';

// ─── Supabase Bağlantı Bilgileri ─────────────────────────────────────────────
const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    'Supabase config eksik. app.config.js içinde extra.supabaseUrl ve extra.supabaseAnonKey tanımlı olmalı.'
  );
}

// ─── Güvenli Oturum Depolama (iOS Keychain / Android Keystore) ───────────────
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

// ─── Web Oturum Depolama (localStorage) ──────────────────────────────────────
const WebStorageAdapter = {
  getItem: (key: string) => Promise.resolve(globalThis.localStorage?.getItem(key) ?? null),
  setItem: (key: string, value: string) => { globalThis.localStorage?.setItem(key, value); return Promise.resolve(); },
  removeItem: (key: string) => { globalThis.localStorage?.removeItem(key); return Promise.resolve(); },
};
const isWeb = Platform.OS === 'web';

// ─── Supabase Client ──────────────────────────────────────────────────────────
export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: isWeb ? WebStorageAdapter : ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: isWeb,
    },
  }
);

// ─── Typed RPC Wrappers ───────────────────────────────────────────────────────
// Supabase SDK v2.106+ ile manuel Database types arasındaki overload
// resolution sorununu çözen tip-güvenli wrapper'lar.
// Supabase CLI ile `supabase gen types typescript` çalıştırıldıktan sonra
// bu wrapper'lar kaldırılabilir ve direkt supabase.rpc() kullanılabilir.

type Functions = Database['public']['Functions'];

// Untyped RPC çağrısı — Supabase SDK v2 overload conflict'ini aşar.
// Tip güvenliği wrapper imzalarında (Args/Returns) sağlanır.
type _UntypedRpc = (fn: string, args: Record<string, unknown>) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;
const _rpc: _UntypedRpc = (fn, args) =>
  (supabase as unknown as { rpc: _UntypedRpc }).rpc(fn, args);

export async function rpcNearbyBakers(
  args: Functions['nearby_bakers']['Args']
): Promise<{ data: Functions['nearby_bakers']['Returns'] | null; error: Error | null }> {
  const result = await _rpc('nearby_bakers', args as Record<string, unknown>);
  return result as { data: Functions['nearby_bakers']['Returns'] | null; error: Error | null };
}

export async function rpcNearbyOrders(
  args: Functions['nearby_orders']['Args']
): Promise<{ data: Functions['nearby_orders']['Returns'] | null; error: Error | null }> {
  const result = await _rpc('nearby_orders', args as Record<string, unknown>);
  return result as { data: Functions['nearby_orders']['Returns'] | null; error: Error | null };
}

export async function rpcPlaceOrder(
  args: Functions['place_order']['Args']
): Promise<{ data: Functions['place_order']['Returns'] | null; error: Error | null }> {
  const result = await _rpc('place_order', args as Record<string, unknown>);
  return result as { data: Functions['place_order']['Returns'] | null; error: Error | null };
}

export async function rpcAcceptOffer(
  args: Functions['accept_offer']['Args']
): Promise<{ data: Functions['accept_offer']['Returns'] | null; error: Error | null }> {
  const result = await _rpc('accept_offer', args as Record<string, unknown>);
  return result as { data: Functions['accept_offer']['Returns'] | null; error: Error | null };
}

export async function rpcSubmitOffer(
  args: Functions['submit_offer']['Args']
): Promise<{ data: Functions['submit_offer']['Returns'] | null; error: Error | null }> {
  const result = await _rpc('submit_offer', args as Record<string, unknown>);
  return result as { data: Functions['submit_offer']['Returns'] | null; error: Error | null };
}

export type OrderOfferSummaryRow = {
  price: number;
  shop_rating: number;
  shop_review_count: number;
  is_mine: boolean;
};

export async function rpcGetOrderOfferSummary(
  orderId: string
): Promise<{ data: OrderOfferSummaryRow[] | null; error: Error | null }> {
  const result = await _rpc('get_order_offer_summary', { p_order_id: orderId });
  return result as { data: OrderOfferSummaryRow[] | null; error: Error | null };
}

export type CustomerSummary = {
  full_name: string | null;
  avatar_url: string | null;
  total_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  member_since: string;
  member_days: number;
};

export async function rpcGetCustomerSummaryForBaker(
  orderId: string
): Promise<{ data: CustomerSummary | null; error: Error | null }> {
  const result = await _rpc('get_customer_summary_for_baker', { p_order_id: orderId });
  const rows = (result as { data: CustomerSummary[] | null; error: Error | null }).data;
  return {
    data: rows && rows.length > 0 ? rows[0] : null,
    error: (result as { error: Error | null }).error,
  };
}

export async function rpcRejectOffer(
  args: Functions['reject_offer']['Args']
): Promise<{ data: Functions['reject_offer']['Returns'] | null; error: Error | null }> {
  const result = await _rpc('reject_offer', args as Record<string, unknown>);
  return result as { data: Functions['reject_offer']['Returns'] | null; error: Error | null };
}

export async function rpcCancelOrder(
  args: Functions['cancel_order']['Args']
): Promise<{ data: Functions['cancel_order']['Returns'] | null; error: Error | null }> {
  const result = await _rpc('cancel_order', args as Record<string, unknown>);
  return result as { data: Functions['cancel_order']['Returns'] | null; error: Error | null };
}

export async function rpcWithdrawOffer(
  args: Functions['withdraw_offer']['Args']
): Promise<{ data: Functions['withdraw_offer']['Returns'] | null; error: Error | null }> {
  const result = await _rpc('withdraw_offer', args as Record<string, unknown>);
  return result as { data: Functions['withdraw_offer']['Returns'] | null; error: Error | null };
}

export async function rpcGetConversations(): Promise<{
  data: Functions['get_conversations']['Returns'] | null;
  error: Error | null;
}> {
  const result = await _rpc('get_conversations', {});
  return result as { data: Functions['get_conversations']['Returns'] | null; error: Error | null };
}

export async function rpcCreateNotification(
  args: Functions['create_notification']['Args']
): Promise<{ data: string | null; error: Error | null }> {
  const result = await _rpc('create_notification', args as Record<string, unknown>);
  return result as { data: string | null; error: Error | null };
}

export async function rpcSetOrderStatus(
  args: Functions['set_order_status']['Args']
): Promise<{ data: Functions['set_order_status']['Returns'] | null; error: Error | null }> {
  const result = await _rpc('set_order_status', args as Record<string, unknown>);
  return result as { data: Functions['set_order_status']['Returns'] | null; error: Error | null };
}

export async function rpcDeleteConversation(
  otherUserId: string
): Promise<{ error: Error | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('delete_conversation', { p_other_user_id: otherUserId });
  return { error: error as Error | null };
}

export async function rpcDeleteMessageForMe(
  messageId: string
): Promise<{ error: Error | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('delete_message_for_me', { p_message_id: messageId });
  return { error: error as Error | null };
}

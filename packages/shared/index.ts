// @pastacim/shared — main entry point

// Supabase client and typed RPC wrappers
export { supabase } from './lib/supabase';
export {
  rpcNearbyBakers,
  rpcNearbyOrders,
  rpcPlaceOrder,
  rpcAcceptOffer,
  rpcSubmitOffer,
  rpcRejectOffer,
  rpcCancelOrder,
  rpcWithdrawOffer,
  rpcGetConversations,
  rpcCreateNotification,
  rpcAddWalletBalance,
  rpcSetOrderStatus,
  rpcDeleteConversation,
  rpcDeleteMessageForMe,
} from './lib/supabase';

// Theme constants
export {
  Colors,
  useThemeColors,
  Spacing,
  Radius,
  FontSize,
  TOKEN_WELCOME_BONUS,
  TOKEN_ORDER_COST,
  DEFAULT_RADIUS_KM,
  MAX_RADIUS_KM,
  MIN_RADIUS_KM,
  DEFAULT_LOCATION,
} from './lib/constants';
export type { ThemeColors } from './lib/constants';

// Notifications
export {
  navigateFromNotification,
  getUserPushToken,
  sendPushNotification,
  notifyUser,
} from './lib/notifications';
export type { NotificationRole } from './lib/notifications';

// Auth hook
export { useAuth } from './hooks/useAuth';

// Components
export { default as NotificationsScreen } from './components/NotificationsScreen';

// Types
export type { Database, Json } from './types/database.types';

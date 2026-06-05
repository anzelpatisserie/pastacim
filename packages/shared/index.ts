// @pastacim/shared — main entry point

// Supabase client and typed RPC wrappers
export { supabase } from './lib/supabase';
export {
  rpcNearbyBakers,
  rpcNearbyOrders,
  rpcPlaceOrder,
  rpcAcceptOffer,
  rpcSubmitOffer,
  rpcGetOrderOfferSummary,
  rpcGetCustomerSummaryForBaker,
  rpcRejectOffer,
  rpcCancelOrder,
  rpcWithdrawOffer,
  rpcGetConversations,
  rpcCreateNotification,
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
export { default as FeedbackModal } from './components/FeedbackModal';
export { default as SplashAnimation } from './components/SplashAnimation';
export { default as TabHeader } from './components/TabHeader';
export { default as BackButton } from './components/BackButton';
export { default as FeedbacksAdminScreen } from './components/FeedbacksAdminScreen';

// Types
export type { Database, Json } from './types/database.types';
export type { OrderOfferSummaryRow, CustomerSummary } from './lib/supabase';

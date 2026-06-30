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
  notifyFromTemplate,
  notifyNewMessage,
  fileReport,
  sendAppEmail,
} from './lib/notifications';
export type { NotificationRole } from './lib/notifications';

// Badge
export { computeBadgeCount, setAppBadge, fetchUnreadBadgeCount } from './lib/badge';
export { safeAvatarUri } from './lib/avatar';

// Maps
export { openAddressInMaps } from './lib/maps';

// Auth hook
export { useAuth } from './hooks/useAuth';

// Components
export { default as NotificationsScreen } from './components/NotificationsScreen';
export { default as FeedbackModal } from './components/FeedbackModal';
export { default as SplashAnimation } from './components/SplashAnimation';
export { default as TabHeader } from './components/TabHeader';
export { default as BackButton } from './components/BackButton';
export { default as FeedbacksAdminScreen } from './components/FeedbacksAdminScreen';
export { default as AdminNotificationsScreen } from './components/AdminNotificationsScreen';
export { default as AdminEmailsScreen } from './components/AdminEmailsScreen';
export { default as AdminReportsScreen } from './components/AdminReportsScreen';
export { default as NameEntryModal } from './components/NameEntryModal';
export { default as ReportModal } from './components/ReportModal';
export type { ReportTargetType } from './components/ReportModal';

// AppMap (platform-split: native = react-native-maps, web = Google Maps JS)
export { AppMapView, AppMarker } from './components/AppMap';
export type { Region } from './components/AppMap';

// WebStoreBanner (web-only; native'de null döner)
export { WebStoreBanner, WEB_BANNER_HEIGHT } from './components/WebStoreBanner';
export { authRedirectUrl } from './lib/authRedirect';
export { installWebAlert } from './lib/webAlert';
export { shareApp } from './lib/shareApp';
export { useViewportHeight } from './hooks/useViewportHeight';

// Types
export type { Database, Json } from './types/database.types';
export type { OrderOfferSummaryRow, CustomerSummary } from './lib/supabase';

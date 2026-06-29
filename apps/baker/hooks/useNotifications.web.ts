/**
 * useNotifications — web no-op shim
 *
 * Push bildirimleri web platformunda desteklenmez.
 * Expo, platform uzantısıyla (.web.ts) bu dosyayı otomatik seçer.
 */
export function useNotifications(_userId?: string): { unreadCount: number } {
  return { unreadCount: 0 };
}

/**
 * Avatar URL güvenlik filtresi.
 *
 * `users.avatar_url` kullanıcı-kontrollüdür; doğrudan <Image source={{uri}}>'ye
 * verilirse saldırgan kendi sunucusuna URL koyup onu GÖREN herkesin IP'sini/
 * cihaz bilgisini toplayabilir. Bu yüzden yalnızca güvenilir Supabase storage
 * host'undan gelen URL'leri kabul ediyoruz; aksi halde null → emoji fallback.
 */
const TRUSTED_AVATAR_PREFIX = 'https://lvrbzhziayegyinkcuka.supabase.co/storage/';

export function safeAvatarUri(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith(TRUSTED_AVATAR_PREFIX) ? url : null;
}

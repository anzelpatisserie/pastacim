// ─── Pastacım Marka Renkleri & Tasarım Sabitleri ─────────────────────────────
import { useColorScheme } from 'react-native';

export const Colors = {
  light: {
    primary: '#D4526E',
    primaryDark: '#B03D58',
    accent: '#F5A623',
    background: '#FFF8F5',
    card: '#FFFFFF',
    border: '#F0D5DC',
    text: '#1A0A10',
    textSecondary: '#7A5560',
    placeholder: '#B8939C',
    tabBar: '#FFFFFF',
    tabBarBorder: '#F0D5DC',
    icon: '#7A5560',
    iconActive: '#D4526E',
    error: '#E53E3E',
    success: '#38A169',
    skeleton: '#F5E0E5',
  },
  dark: {
    primary: '#E8728A',
    primaryDark: '#D4526E',
    accent: '#F5A623',
    background: '#1C1017',
    card: '#2D1F27',
    border: '#3D2D35',
    text: '#F5E6EA',
    textSecondary: '#C4A0AC',
    placeholder: '#7A5560',
    tabBar: '#2D1F27',
    tabBarBorder: '#3D2D35',
    icon: '#C4A0AC',
    iconActive: '#E8728A',
    error: '#FC8181',
    success: '#68D391',
    skeleton: '#3D2D35',
  },
};

/** Tüm component'larda renk prop tipi için kullan */
export type ThemeColors = typeof Colors['light'] | typeof Colors['dark'];

/** ColorSchemeName ('light' | 'dark' | null | undefined) → güvenli renk objesi */
export function useThemeColors(): ThemeColors {
  const scheme = useColorScheme();
  return Colors[scheme === 'dark' ? 'dark' : 'light'];
}

// ─── Boşluk ve Boyutlar ───────────────────────────────────────────────────────
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 30,
} as const;

// ─── Jeton ────────────────────────────────────────────────────────────────────
export const TOKEN_WELCOME_BONUS = 3;
export const TOKEN_ORDER_COST = 1;

// ─── Harita ───────────────────────────────────────────────────────────────────
export const DEFAULT_RADIUS_KM = 20;
export const MAX_RADIUS_KM = 50;
export const MIN_RADIUS_KM = 1;

// ─── Varsayılan Konum (İstanbul merkez) ───────────────────────────────────────
export const DEFAULT_LOCATION = {
  latitude: 41.0082,
  longitude: 28.9784,
};

import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useThemeColors, Spacing, FontSize } from '../lib/constants';

type Props = {
  label?: string;
  onPress?: () => void;
  color?: string;
};

export default function BackButton({ label = '← Geri', onPress, color }: Props) {
  const C = useThemeColors();
  const handlePress = onPress ?? (() => router.back());
  return (
    <TouchableOpacity
      onPress={handlePress}
      hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
      activeOpacity={0.6}
      style={styles.btn}
    >
      <Text style={[styles.text, { color: color ?? C.primary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    minWidth: 70,
  },
  text: { fontSize: FontSize.md, fontWeight: '700' },
});

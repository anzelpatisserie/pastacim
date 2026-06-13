import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Kadife pembe + altın paleti
const VELVET_PINK = '#8B1A3D';
const VELVET_PINK_LIGHT = '#A93257';
const GOLD = '#D4A574';
const GOLD_BRIGHT = '#F5D08C';
const CREAM = '#FFE9D9';

type Props = {
  appName: 'Pastacım' | 'Pastacım Pro';
  onComplete: () => void;
};

export default function SplashAnimation({ appName, onComplete }: Props) {
  // Animasyon değerleri
  const bgFade = useRef(new Animated.Value(0)).current;          // Kadife arka plan açılır
  const goldLine = useRef(new Animated.Value(0)).current;        // Altın çizgi çizilir (0 → 1)
  const plate = useRef(new Animated.Value(0)).current;           // Pasta tabağı belirir
  const cakeBody = useRef(new Animated.Value(0)).current;        // Kek gövdesi
  const cakeFrost = useRef(new Animated.Value(0)).current;       // Krema/dekor
  const candle1 = useRef(new Animated.Value(0)).current;
  const candle2 = useRef(new Animated.Value(0)).current;
  const candle3 = useRef(new Animated.Value(0)).current;
  const sparkle1 = useRef(new Animated.Value(0)).current;
  const sparkle2 = useRef(new Animated.Value(0)).current;
  const sparkle3 = useRef(new Animated.Value(0)).current;
  const flameFlicker = useRef(new Animated.Value(1)).current;    // Alev titreşimi
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(12)).current;
  const sloganOpacity = useRef(new Animated.Value(0)).current;
  const sloganY = useRef(new Animated.Value(8)).current;
  const containerFade = useRef(new Animated.Value(1)).current;

  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    Animated.sequence([
      // 1) Kadife arka plan açılır (0-450ms)
      Animated.timing(bgFade, {
        toValue: 1, duration: 450, useNativeDriver: true, easing: Easing.out(Easing.cubic),
      }),

      // 2) Altın çizgi çizilir (450-1100ms)
      Animated.timing(goldLine, {
        toValue: 1, duration: 650, useNativeDriver: false, easing: Easing.inOut(Easing.cubic),
      }),

      // 3) Pasta adım adım oluşur (1100-2200ms): tabak → gövde → krema
      Animated.stagger(220, [
        Animated.spring(plate,     { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.spring(cakeBody,  { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.spring(cakeFrost, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      ]),

      // 4) Mumlar yanar + ✨ pırıltılar (2200-2750ms)
      Animated.parallel([
        Animated.stagger(90, [
          Animated.timing(candle1, { toValue: 1, duration: 180, useNativeDriver: true }),
          Animated.timing(candle2, { toValue: 1, duration: 180, useNativeDriver: true }),
          Animated.timing(candle3, { toValue: 1, duration: 180, useNativeDriver: true }),
        ]),
        Animated.stagger(140, [
          Animated.timing(sparkle1, { toValue: 1, duration: 240, useNativeDriver: true }),
          Animated.timing(sparkle2, { toValue: 1, duration: 240, useNativeDriver: true }),
          Animated.timing(sparkle3, { toValue: 1, duration: 240, useNativeDriver: true }),
        ]),
      ]),

      // 5) Başlık fade-in (2750-3150ms)
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(titleY, { toValue: 0, duration: 400, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      ]),

      // 6) Alt yazı fade-in (3150-3550ms)
      Animated.parallel([
        Animated.timing(sloganOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(sloganY, { toValue: 0, duration: 400, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      ]),

      // Kısa nefes payı
      Animated.delay(450),

      // 7) Yumuşak fade-out (3550-3950ms)
      Animated.timing(containerFade, {
        toValue: 0, duration: 400, useNativeDriver: true, easing: Easing.in(Easing.cubic),
      }),
    ]).start(() => onComplete());

    // Alev titreşim loop (mumlar yandıktan sonra sürekli)
    setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(flameFlicker, { toValue: 0.75, duration: 240, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(flameFlicker, { toValue: 1.08, duration: 240, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      ).start();
    }, 2300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Altın çizginin animasyonlu genişliği
  const lineWidth = goldLine.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SCREEN_WIDTH * 0.55],
  });

  return (
    <Animated.View style={[styles.root, { opacity: containerFade }]}>
      {/* Kadife arka plan (üst üste iki katman ile derinlik) */}
      <Animated.View style={[styles.bgBase, { opacity: bgFade }]} />
      <Animated.View style={[styles.bgGlow, { opacity: bgFade }]} />

      <View style={styles.center}>
        {/* Pasta bileşenleri — alt → üst sıralı */}
        <View style={styles.cakeStack}>
          {/* Pırıltılar (pasta etrafında) */}
          <Animated.Text style={[styles.sparkle, styles.sparkleTopLeft, {
            opacity: sparkle1,
            transform: [{ scale: sparkle1.interpolate({ inputRange: [0, 1], outputRange: [0.01, 1] }) }],
          }]}>✨</Animated.Text>
          <Animated.Text style={[styles.sparkle, styles.sparkleTopRight, {
            opacity: sparkle2,
            transform: [{ scale: sparkle2.interpolate({ inputRange: [0, 1], outputRange: [0.01, 1] }) }],
          }]}>✨</Animated.Text>
          <Animated.Text style={[styles.sparkle, styles.sparkleBottom, {
            opacity: sparkle3,
            transform: [{ scale: sparkle3.interpolate({ inputRange: [0, 1], outputRange: [0.01, 1] }) }],
          }]}>✨</Animated.Text>

          {/* Mumlar (3 adet, pastanın üstünde) */}
          <View style={styles.candlesRow}>
            <Animated.Text style={[styles.candle, {
              opacity: candle1,
              transform: [{ scaleY: flameFlicker }, { translateY: candle1.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            }]}>🕯️</Animated.Text>
            <Animated.Text style={[styles.candle, {
              opacity: candle2,
              transform: [{ scaleY: flameFlicker }, { translateY: candle2.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            }]}>🕯️</Animated.Text>
            <Animated.Text style={[styles.candle, {
              opacity: candle3,
              transform: [{ scaleY: flameFlicker }, { translateY: candle3.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            }]}>🕯️</Animated.Text>
          </View>

          {/* Pasta — üst dekor (krema/güller) */}
          <Animated.Text style={[styles.cakeFrost, {
            opacity: cakeFrost,
            transform: [
              { scale: cakeFrost.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
              { translateY: cakeFrost.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
            ],
          }]}>🌸</Animated.Text>

          {/* Pasta — gövde */}
          <Animated.Text style={[styles.cakeBody, {
            opacity: cakeBody,
            transform: [
              { scale: cakeBody.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
              { translateY: cakeBody.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
            ],
          }]}>🎂</Animated.Text>

          {/* Tabak — pasta altı */}
          <Animated.View style={[styles.plate, {
            opacity: plate,
            transform: [
              { scaleX: plate.interpolate({ inputRange: [0, 1], outputRange: [0.01, 1] }) },
              { scaleY: plate.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
            ],
          }]} />
        </View>

        {/* Altın çizgi (pasta altından açılan dekoratif çizgi) */}
        <View style={styles.lineRow}>
          <Animated.View style={[styles.line, { width: lineWidth }]} />
        </View>

        {/* Başlık */}
        <Animated.Text style={[styles.title, {
          opacity: titleOpacity,
          transform: [{ translateY: titleY }],
        }]}>
          {appName}
        </Animated.Text>

        {/* Alt yazı */}
        <Animated.Text style={[styles.slogan, {
          opacity: sloganOpacity,
          transform: [{ translateY: sloganY }],
        }]}>
          {appName === 'Pastacım Pro'
            ? 'Yakınındaki siparişleri al,\nişini büyüt.'
            : 'Hayalindeki pastayı\nyakındaki ustalar yapsın.'}
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const PLATE_WIDTH = 150;

const styles = StyleSheet.create({
  root: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  bgBase: {
    ...StyleSheet.absoluteFill,
    backgroundColor: VELVET_PINK,
  },
  bgGlow: {
    position: 'absolute', top: '20%', left: '15%', right: '15%', bottom: '40%',
    backgroundColor: VELVET_PINK_LIGHT,
    borderRadius: 200,
    opacity: 0.5,
  },
  center: { alignItems: 'center', justifyContent: 'center' },

  cakeStack: {
    width: 200, height: 200, alignItems: 'center', justifyContent: 'flex-end',
    position: 'relative',
  },
  plate: {
    position: 'absolute', bottom: 6,
    width: PLATE_WIDTH, height: 14,
    borderRadius: 7,
    backgroundColor: GOLD,
    shadowColor: GOLD_BRIGHT, shadowOpacity: 0.6, shadowRadius: 10,
  },
  cakeBody: {
    fontSize: 96, lineHeight: 110, marginBottom: 14,
  },
  cakeFrost: {
    position: 'absolute', top: 24,
    fontSize: 30,
  },
  candlesRow: {
    position: 'absolute', top: 6,
    flexDirection: 'row', gap: 14,
  },
  candle: { fontSize: 28 },

  sparkle: { position: 'absolute', fontSize: 22 },
  sparkleTopLeft: { top: -6, left: 2 },
  sparkleTopRight: { top: 4, right: -2 },
  sparkleBottom: { bottom: -6, right: 18 },

  lineRow: { marginTop: 14, alignItems: 'center' },
  line: { height: 2, backgroundColor: GOLD, borderRadius: 2 },

  title: {
    marginTop: 22,
    fontSize: 36, fontWeight: '800', color: CREAM,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4,
  },
  slogan: {
    marginTop: 14,
    fontSize: 15, fontWeight: '500', color: GOLD_BRIGHT,
    textAlign: 'center', lineHeight: 22,
  },
});

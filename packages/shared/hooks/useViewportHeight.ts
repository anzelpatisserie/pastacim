import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

/**
 * Görünür viewport yüksekliği.
 *
 * Native: useWindowDimensions().height.
 * Web: `visualViewport.height` — mobil tarayıcılarda (özellikle iOS Safari)
 * `window.innerHeight` alt araç çubuğunun kapladığı alanı da sayar (layout
 * viewport) → app fazla uzun olur, alt sekme barı çubuğun arkasında kalır.
 * `visualViewport.height` o an GERÇEKTEN görünen yüksekliği verir; araç çubuğu
 * gösterilip gizlendikçe güncellenir.
 */
export function useViewportHeight(): number {
  const { height: rnHeight } = useWindowDimensions();
  const [webHeight, setWebHeight] = useState<number>(() => {
    if (Platform.OS !== 'web') return rnHeight;
    return globalThis.visualViewport?.height ?? globalThis.innerHeight ?? rnHeight;
  });

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const vv = globalThis.visualViewport;
    const update = () => setWebHeight(vv?.height ?? globalThis.innerHeight ?? rnHeight);
    update();
    vv?.addEventListener('resize', update);
    globalThis.addEventListener?.('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      globalThis.removeEventListener?.('resize', update);
    };
  }, [rnHeight]);

  return Platform.OS === 'web' ? webHeight : rnHeight;
}

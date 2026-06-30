import { Platform } from 'react-native';
import { WEB_BANNER_HEIGHT } from '../components/WebStoreBanner';

/**
 * Expo'nun default web index.html'i `#root { height: 100% }` verir. iOS Safari'de
 * `100%` = LAYOUT viewport (alt araç çubuğunun kapladığı alan dahil) → app fazla
 * uzun olur, alt sekme barı araç çubuğunun arkasında kalır. `+html.tsx` ise
 * output:'single' modunda yok sayılır. Bu yüzden runtime'da bir <style> enjekte
 * edip kökü DİNAMİK viewport'a (100dvh) sabitliyoruz; navigator (#pastacim-nav)
 * yüksekliği de calc(100dvh - banner) ile CSS'ten geliyor (JS timing'e gerek yok).
 *
 * `dvh` desteklemeyen eski tarayıcılar için `100vh` fallback'i (important'sız) bırakılır.
 */
export function installWebRootStyle(): void {
  if (Platform.OS !== 'web') return;
  const doc = globalThis.document;
  if (!doc || doc.getElementById('pastacim-web-root-style')) return;
  const h = WEB_BANNER_HEIGHT;
  const style = doc.createElement('style');
  style.id = 'pastacim-web-root-style';
  style.textContent =
    'html,body{height:100vh;height:100dvh;margin:0;padding:0}' +
    '#root{height:100vh;height:100dvh!important;min-height:0;display:flex;flex-direction:column;overflow:hidden}' +
    `#pastacim-nav{height:calc(100vh - ${h}px);height:calc(100dvh - ${h}px)!important;min-height:0}`;
  doc.head.appendChild(style);
}

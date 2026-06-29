// Native platform — react-native-maps doğrudan re-export.
// Web bundle bu dosyayı GÖRMEZ; AppMap.web.tsx kullanılır.
import MapView, { Marker } from 'react-native-maps';
export const AppMapView = MapView;
export const AppMarker = Marker;
export type { Region } from 'react-native-maps';

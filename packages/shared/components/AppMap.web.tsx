// Web platform — Google Maps JS API ile native MapView/Marker sözleşmesini taklit eder.
// react-native-maps bu dosyada import EDİLMEZ — web bundle'a sızarsa export kırılır.
import React from 'react';
import { GoogleMap, Marker as GMarker, useJsApiLoader } from '@react-google-maps/api';
import Constants from 'expo-constants';

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type Coordinate = { latitude: number; longitude: number };

type MapProps = {
  style?: object;
  region?: Region;
  initialRegion?: Region;
  onPress?: (e: { nativeEvent: { coordinate: Coordinate } }) => void;
  onRegionChangeComplete?: (r: Region) => void;
  children?: React.ReactNode;
  zoomControlEnabled?: boolean;
  zoomEnabled?: boolean;
};

const apiKey = (Constants.expoConfig?.extra?.googleMapsApiKey as string) ?? '';

export function AppMapView({
  style,
  region,
  initialRegion,
  onPress,
  children,
}: MapProps) {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: apiKey });
  if (!isLoaded) return null;

  const src = initialRegion ?? region;
  const center = src
    ? { lat: src.latitude, lng: src.longitude }
    : { lat: 41.0, lng: 29.0 };

  return (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height: '100%', ...(style ?? {}) }}
      center={center}
      zoom={15}
      onClick={(e) => {
        if (e.latLng && onPress) {
          onPress({
            nativeEvent: {
              coordinate: {
                latitude: e.latLng.lat(),
                longitude: e.latLng.lng(),
              },
            },
          });
        }
      }}
    >
      {children}
    </GoogleMap>
  );
}

export function AppMarker({
  coordinate,
  draggable,
  onDragEnd,
}: {
  coordinate: Coordinate;
  draggable?: boolean;
  onDragEnd?: (e: { nativeEvent: { coordinate: Coordinate } }) => void;
}) {
  return (
    <GMarker
      position={{ lat: coordinate.latitude, lng: coordinate.longitude }}
      draggable={draggable}
      onDragEnd={(e) => {
        if (e.latLng && onDragEnd) {
          onDragEnd({
            nativeEvent: {
              coordinate: { latitude: e.latLng.lat(), longitude: e.latLng.lng() },
            },
          });
        }
      }}
    />
  );
}

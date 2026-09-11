import type { MapStyleElement } from 'react-native-maps';
import type { ThemeScheme } from './colors';

// Map styling is intentionally a separate semantic surface: Google Maps needs
// literal values, while the rest of the interface reads the theme variables.
export const darkMapStyle: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#2E2E38' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#D6D6DB' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#2E2E38' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#41414D' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#1D1D27' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#16161F' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9A9AB2' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#1D1D26' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#101018' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1B1B26' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

export const lightMapStyle: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#B9B9BF' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#565660' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F4F4F6' }, { weight: 2 }] },
  { featureType: 'landscape.man_made', elementType: 'geometry.fill', stylers: [{ color: '#E1E1E5' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry.stroke', stylers: [{ color: '#C9C9D0' }, { weight: 1 }] },
  { featureType: 'poi', elementType: 'geometry.fill', stylers: [{ visibility: 'on' }, { color: '#E1E1E5' }] },
  { featureType: 'poi', elementType: 'geometry.stroke', stylers: [{ visibility: 'on' }, { color: '#C9C9D0' }, { weight: 1 }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#DBE4ED' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#EEEEF2' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#55555F' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#F8F8FA' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'poi.park', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#E4EFDF' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

export const mapStyleFor = (scheme: ThemeScheme) => scheme === 'dark' ? darkMapStyle : lightMapStyle;

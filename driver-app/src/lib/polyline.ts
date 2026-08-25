export type RoutePoint = { latitude: number; longitude: number };

/** Decode a Google Routes encoded polyline into react-native-maps coordinates. */
export function decodeGooglePolyline(encoded: string | null | undefined): RoutePoint[] {
  if (!encoded) return [];

  const points: RoutePoint[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  const readDelta = () => {
    let shift = 0;
    let result = 0;

    while (index < encoded.length) {
      const byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || shift > 30) return null;
      result |= (byte & 0x1f) << shift;
      if (byte < 0x20) return result & 1 ? ~(result >> 1) : result >> 1;
      shift += 5;
    }

    return null;
  };

  while (index < encoded.length) {
    const latitudeDelta = readDelta();
    const longitudeDelta = readDelta();
    if (latitudeDelta === null || longitudeDelta === null) return [];

    latitude += latitudeDelta;
    longitude += longitudeDelta;
    const point = { latitude: latitude / 1e5, longitude: longitude / 1e5 };
    if (Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) return [];
    points.push(point);
  }

  return points;
}

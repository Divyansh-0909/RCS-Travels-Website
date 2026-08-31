export type RoutePoint = { latitude: number; longitude: number };

const KM_PER_DEGREE = 111.32;
const ROUTE_OFFSET_LIMIT_KM = 0.08;

const distanceKm = (a: RoutePoint, b: RoutePoint) => {
  const referenceLatitude = ((a.latitude + b.latitude) / 2) * Math.PI / 180;
  const x = (b.longitude - a.longitude) * Math.cos(referenceLatitude) * KM_PER_DEGREE;
  const y = (b.latitude - a.latitude) * KM_PER_DEGREE;
  return Math.hypot(x, y);
};

const projectionOnSegment = (point: RoutePoint, start: RoutePoint, end: RoutePoint) => {
  const referenceLatitude = ((point.latitude + start.latitude + end.latitude) / 3) * Math.PI / 180;
  const longitudeScale = Math.max(0.01, Math.cos(referenceLatitude));
  const segmentX = (end.longitude - start.longitude) * longitudeScale * KM_PER_DEGREE;
  const segmentY = (end.latitude - start.latitude) * KM_PER_DEGREE;
  const pointX = (point.longitude - start.longitude) * longitudeScale * KM_PER_DEGREE;
  const pointY = (point.latitude - start.latitude) * KM_PER_DEGREE;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  const fraction = lengthSquared === 0
    ? 0
    : Math.min(1, Math.max(0, (pointX * segmentX + pointY * segmentY) / lengthSquared));
  const projected = {
    latitude: start.latitude + (end.latitude - start.latitude) * fraction,
    longitude: start.longitude + (end.longitude - start.longitude) * fraction,
  };
  return { projected, distanceKm: distanceKm(point, projected) };
};

/** Trim a periodically refreshed navigation path at the captain's newer GPS fix. */
export function remainingRoutePoints(
  route: RoutePoint[],
  current: RoutePoint,
  offsetLimitKm = ROUTE_OFFSET_LIMIT_KM,
): RoutePoint[] | null {
  if (route.length < 2) return null;

  let best: { projected: RoutePoint; distanceKm: number; segmentIndex: number } | null = null;
  for (let segmentIndex = 0; segmentIndex < route.length - 1; segmentIndex += 1) {
    const candidate = { ...projectionOnSegment(current, route[segmentIndex], route[segmentIndex + 1]), segmentIndex };
    if (!best || candidate.distanceKm < best.distanceKm) best = candidate;
  }
  if (!best || best.distanceKm > offsetLimitKm) return null;

  const remaining = [best.projected, ...route.slice(best.segmentIndex + 1)];
  return remaining.filter((point, index) => index === 0 || distanceKm(remaining[index - 1], point) > 0.0001);
}

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

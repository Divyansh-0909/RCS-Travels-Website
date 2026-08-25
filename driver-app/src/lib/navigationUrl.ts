export type NavigationPoint = { lat: number; lng: number };

const mapsPoint = ({ lat, lng }: NavigationPoint) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Invalid navigation coordinates');
  return `${lat},${lng}`;
};

export function buildDriverNavigationUrl(destination: NavigationPoint, waypoint?: NavigationPoint | null) {
  const route = [
    'api=1',
    `destination=${encodeURIComponent(mapsPoint(destination))}`,
    'travelmode=driving',
    'dir_action=navigate',
  ];
  if (waypoint) route.push(`waypoints=${encodeURIComponent(mapsPoint(waypoint))}`);
  return `https://www.google.com/maps/dir/?${route.join('&')}`;
}

import { mdiCar } from "@mdi/js";

// Shared map furniture for every screen that draws a ride on the singleton
// map (VehicleSelect, TrackingPage). Overlay handles are module-level for the
// same reason the map itself is: they outlive any one component, so a
// StrictMode remount or a page change must be able to find and clear them.

// Full-bleed behind the panel on mobile, right-side block on sm+ (mirrors
// OnBoarding's illustration).
export const MAP_CLASSES = "absolute inset-0 z-0 sm:rounded-lg sm:relative sm:inset-auto sm:z-auto sm:order-2 sm:shrink-0 sm:w-[350px] sm:h-[380px] lg:w-[500px] lg:h-[550px] xl:w-[660px] xl:h-[570px]";

// Same dot language as the OnBoarding inputs / RoutePanel: solid white =
// pickup, primary donut = drop, primary-light car = driver. SVG because map
// markers can't use CSS; the transparent padding enlarges the tap target.
const MARKER_SHADOW = `<filter id="ms" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.6"/></filter>`;
const PICKUP_MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">${MARKER_SHADOW}<circle cx="20" cy="20" r="8" fill="#ffffff" filter="url(#ms)"/></svg>`;
const DROP_MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">${MARKER_SHADOW}<g filter="url(#ms)"><circle cx="20" cy="20" r="9" fill="#243AFB"/><circle cx="20" cy="20" r="3.2" fill="#0B0B14"/></g></svg>`;
// mdiCar is a 24x24 path; 0.72 scale centres it in the 22px puck.
const DRIVER_MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44">${MARKER_SHADOW}<g filter="url(#ms)"><circle cx="22" cy="22" r="13" fill="#7A94FF"/><path d="${mdiCar}" fill="#0B0B14" transform="translate(13.4,13.4) scale(0.72)"/></g></svg>`;

const svgIcon = (g, svg, size) => ({
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new g.Size(size, size),
    anchor: new g.Point(size / 2, size / 2),
});

// Fixed centre pin for the confirm-location map — the tip sits on the map
// centre while the map drags underneath.
export const CenterPin = ({ target }) => (
    <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full flex flex-col items-center drop-shadow-[0_2px_5px_rgba(0,0,0,0.65)]">
        {target === "pickup"
            ? <div className="w-5 h-5 rounded-full bg-[var(--foreground)]" />
            : <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-[var(--background)]" /></div>}
        <div className={`w-0.5 h-4 ${target === "pickup" ? "bg-[var(--foreground)]" : "bg-primary"}`} />
    </div>
);

let routeOverlays = null;

export function clearRouteView() {
    if (!routeOverlays) return;
    Object.values(routeOverlays).forEach(o => o.setMap(null));
    routeOverlays = null;
}

// Zoomed-out full-route view: both endpoints marked, connected by the real
// road path from the fare estimate (straight-line fallback when it's missing),
// and fitted in frame. onPickupClick/onDropClick make the markers tappable —
// omit them where the route is already booked and can't be adjusted.
export function showRouteView(map, { pickupPoint, dropPoint, routePolyline, onPickupClick, onDropClick }) {
    clearRouteView();
    const g = window.google.maps;
    const routePath = routePolyline && g.geometry
        ? g.geometry.encoding.decodePath(routePolyline)
        : [pickupPoint, dropPoint];

    const pickupMarker = new g.Marker({ map, position: pickupPoint, icon: svgIcon(g, PICKUP_MARKER_SVG, 40) });
    const dropMarker = new g.Marker({ map, position: dropPoint, icon: svgIcon(g, DROP_MARKER_SVG, 40) });
    if (onPickupClick) pickupMarker.addListener("click", onPickupClick);
    if (onDropClick) dropMarker.addListener("click", onDropClick);

    const line = new g.Polyline({
        map, path: routePath, geodesic: true,
        strokeColor: "#7A94FF", strokeOpacity: 1, strokeWeight: 4,
    });
    routeOverlays = { pickupMarker, dropMarker, line };

    // fit over the whole path, not just the endpoints — a curving route can
    // swing well outside the straight-line bounding box
    const bounds = new g.LatLngBounds();
    routePath.forEach(p => bounds.extend(p));
    bounds.extend(pickupPoint);
    bounds.extend(dropPoint);
    map.fitBounds(bounds, 60);
}

// Driver puck, kept in its own registry so live position updates never
// disturb (or get cleared with) the route overlays.
let driverMarker = null;

export function setDriverPosition(map, coords) {
    if (!coords) return;
    const g = window.google.maps;
    if (!driverMarker) {
        driverMarker = new g.Marker({
            map, position: coords, zIndex: 10,
            icon: svgIcon(g, DRIVER_MARKER_SVG, 44),
        });
        return;
    }
    driverMarker.setMap(map);
    driverMarker.setPosition(coords);
}

export function clearDriverMarker() {
    driverMarker?.setMap(null);
    driverMarker = null;
}

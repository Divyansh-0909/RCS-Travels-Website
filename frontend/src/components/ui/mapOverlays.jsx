import { mdiCar } from "@mdi/js";
import { haversineKm } from "../../lib/trip";

// Shared map furniture for every screen that draws a ride on the singleton
// map (VehicleSelect, TrackingPage). Overlay handles are module-level for the
// same reason the map itself is: they outlive any one component, so a
// StrictMode remount or a page change must be able to find and clear them.

// Full-bleed behind the panel on mobile, right-side block on sm+ (mirrors
// OnBoarding's illustration).
export const MAP_CLASSES = "absolute inset-0 z-0 sm:rounded-lg sm:relative sm:inset-auto sm:z-auto sm:order-2 sm:shrink-0 sm:w-[350px] sm:h-[380px] lg:w-[500px] lg:h-[550px] xl:w-[660px] xl:h-[570px]";

// Same language on every map: white pin = pickup, primary donut pin = drop,
// primary-light car = driver. SVG because Google map markers can't use CSS;
// the transparent padding also gives endpoint pins a comfortable tap target.
const MARKER_SHADOW = `<filter id="ms" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.6"/></filter>`;
const PICKUP_MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="52">${MARKER_SHADOW}<g filter="url(#ms)"><path d="M24 24V46" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="17" r="12" fill="#ffffff"/></g></svg>`;
const DROP_MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="52">${MARKER_SHADOW}<g filter="url(#ms)"><path d="M24 24V46" stroke="#243AFB" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="17" r="12" fill="#243AFB"/><circle cx="24" cy="17" r="4.5" fill="#0B0B14"/></g></svg>`;
// mdiCar is a 24x24 path; 0.72 scale centres it in the 22px puck.
const DRIVER_MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44">${MARKER_SHADOW}<g filter="url(#ms)"><circle cx="22" cy="22" r="13" fill="#7A94FF"/><path d="${mdiCar}" fill="#0B0B14" transform="translate(13.4,13.4) scale(0.72)"/></g></svg>`;

const svgIcon = (g, svg, size) => ({
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new g.Size(size, size),
    anchor: new g.Point(size / 2, size / 2),
});

const endpointIcon = (g, svg) => ({
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new g.Size(48, 52),
    // The stem's tip, rather than the centre of the circle, is the coordinate.
    anchor: new g.Point(24, 46),
});

// Fixed centre pin for the confirm-location map — the tip sits on the map
// centre while the map drags underneath.
export const CenterPin = ({ target }) => (
    <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full flex flex-col items-center drop-shadow-[0_2px_5px_rgba(0,0,0,0.65)]">
        {target === "pickup"
            ? <div className="w-6 h-6 rounded-full bg-[var(--foreground)]" />
            : <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center"><div className="w-[9px] h-[9px] rounded-full bg-[var(--background)]" /></div>}
        <div className={`w-[3px] h-[22px] rounded-b-full ${target === "pickup" ? "bg-[var(--foreground)]" : "bg-primary"}`} />
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

    const pickupMarker = new g.Marker({ map, position: pickupPoint, icon: endpointIcon(g, PICKUP_MARKER_SVG) });
    const dropMarker = new g.Marker({ map, position: dropPoint, icon: endpointIcon(g, DROP_MARKER_SVG) });
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
let driverAnim = null;
// When the previous position landed, in performance.now() terms. The gap
// between two updates is what the next glide is timed against.
let lastDriverUpdate = 0;

// A GLIDE, NOT A JUMP, and it is the whole reason this file has an animation in
// it. The car reports every few seconds and the rider polls every five, so
// setting the position straight from the response teleports the puck across a
// block once per poll — the single thing that makes an otherwise live map read
// as broken. Interpolating between the two fixes is also what a rider expects
// a moving car to look like, and it costs nothing: no extra requests, no
// fresher data, just the same positions shown continuously instead of in steps.
//
// The duration is measured rather than fixed. Updates do not arrive on a tidy
// interval — the captain's app slows to a heartbeat when he is parked, speeds up
// on a live ride, and the poll itself drifts — so each glide is timed to the gap
// that preceded it and the puck keeps moving right up to the next fix instead of
// racing ahead and waiting. Clamped at both ends: below the floor the motion is
// not worth animating, above the ceiling a resumed tab would spend a minute
// creeping toward a position the car left long ago.
const GLIDE_MIN_MS = 400;
const GLIDE_MAX_MS = 8000;

// Past this, it is not movement — it is the first fix after a signal gap, a GPS
// jump between cell towers, or a different driver after a reassignment. Sliding
// the puck across it would draw a car travelling through buildings at
// improbable speed; snapping admits the discontinuity.
const SNAP_OVER_KM = 0.5;

function cancelDriverAnim() {
    if (driverAnim !== null) {
        cancelAnimationFrame(driverAnim);
        driverAnim = null;
    }
}

// Linear on purpose. Easing would have the car decelerate into every fix and
// pull away from it, which is what a car does at a junction and not what one
// does mid-road — and since each fix is only a sample of a continuous drive,
// constant velocity between two of them is the honest reading of the gap.
function glideDriverTo(from, to, duration) {
    const start = performance.now();
    const step = (now) => {
        const t = Math.min((now - start) / duration, 1);
        driverMarker.setPosition({
            lat: from.lat + (to.lat - from.lat) * t,
            lng: from.lng + (to.lng - from.lng) * t,
        });
        driverAnim = t < 1 ? requestAnimationFrame(step) : null;
    };
    driverAnim = requestAnimationFrame(step);
}

export function setDriverPosition(map, coords) {
    if (!coords) return;
    const g = window.google.maps;
    const now = performance.now();

    if (!driverMarker) {
        driverMarker = new g.Marker({
            map, position: coords, zIndex: 10,
            icon: svgIcon(g, DRIVER_MARKER_SVG, 44),
        });
        lastDriverUpdate = now;
        return;
    }

    driverMarker.setMap(map);

    // From wherever the puck actually IS, not from the last position we were
    // given. A fix arriving mid-glide leaves the marker part-way between two
    // points, and restarting from the previous target would snap it backwards
    // before setting off again.
    cancelDriverAnim();
    const at = driverMarker.getPosition();
    const from = { lat: at.lat(), lng: at.lng() };

    const gap = now - lastDriverUpdate;
    lastDriverUpdate = now;

    if (haversineKm(from, coords) > SNAP_OVER_KM) {
        driverMarker.setPosition(coords);
        return;
    }

    glideDriverTo(from, coords, Math.min(Math.max(gap, GLIDE_MIN_MS), GLIDE_MAX_MS));
}

export function clearDriverMarker() {
    // Before the marker goes: a frame still queued against a removed marker
    // would call setPosition on it every frame for the rest of the session.
    cancelDriverAnim();
    driverMarker?.setMap(null);
    driverMarker = null;
    lastDriverUpdate = 0;
}

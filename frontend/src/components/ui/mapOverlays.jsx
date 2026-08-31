import { haversineKm } from "../../lib/trip";
import { headingBetween, pointAlongPreparedPath, preparePathMotion, remainingRoadPath, roadPathBetween } from "../../lib/routeMotion";
import { labelOf } from "../../constants/vehicles";
import topViewVehicle from "../../assets/top-view.webp";
import topViewSedan from "../../assets/top-view-sedan.webp";

// Shared map furniture for every screen that draws a ride on the singleton
// map (VehicleSelect, TrackingPage). Overlay handles are module-level for the
// same reason the map itself is: they outlive any one component, so a
// StrictMode remount or a page change must be able to find and clear them.

// Full-bleed behind the panel on mobile, right-side block on sm+ (mirrors
// OnBoarding's illustration).
export const MAP_CLASSES = "absolute inset-0 z-0 sm:rounded-lg sm:relative sm:inset-auto sm:z-auto sm:order-2 sm:shrink-0 sm:w-[350px] sm:h-[380px] lg:w-[500px] lg:h-[550px] xl:w-[660px] xl:h-[570px]";

// Same language on every map: white pin = pickup, primary donut pin = drop,
// top-view car = driver. Endpoint SVG padding gives each pin room for its
// shadow; the live car uses the existing raster artwork below.
const MARKER_SHADOW = `<filter id="ms" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.6"/></filter>`;
// Match CenterPin's visible 16px circle and 20px stem. The larger SVG canvas
// is only transparent breathing room for the shadow; it does not enlarge it.
const ENDPOINT_ICON_WIDTH = 40;
const ENDPOINT_ICON_HEIGHT = 42;
const ENDPOINT_X = 20;
const ENDPOINT_CIRCLE_Y = 12;
const ENDPOINT_TIP_Y = 32;
const PICKUP_MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${ENDPOINT_ICON_WIDTH}" height="${ENDPOINT_ICON_HEIGHT}">${MARKER_SHADOW}<g filter="url(#ms)"><path d="M${ENDPOINT_X} ${ENDPOINT_CIRCLE_Y}V${ENDPOINT_TIP_Y}" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/><circle cx="${ENDPOINT_X}" cy="${ENDPOINT_CIRCLE_Y}" r="8" fill="#ffffff"/></g></svg>`;
const DROP_MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${ENDPOINT_ICON_WIDTH}" height="${ENDPOINT_ICON_HEIGHT}">${MARKER_SHADOW}<g filter="url(#ms)"><path d="M${ENDPOINT_X} ${ENDPOINT_CIRCLE_Y}V${ENDPOINT_TIP_Y}" stroke="#243AFB" stroke-width="2" stroke-linecap="round"/><circle cx="${ENDPOINT_X}" cy="${ENDPOINT_CIRCLE_Y}" r="8" fill="#243AFB"/><circle cx="${ENDPOINT_X}" cy="${ENDPOINT_CIRCLE_Y}" r="3" fill="#0B0B14"/></g></svg>`;
const LIVE_DRIVER_MARKER_SIZE = 72;
const LIVE_VEHICLE_CLASSES = new Set(["hatchback", "sedan", "suv", "suv_premium"]);
// These are the same top-view assets already used by the captain map. Sedan has
// its own art; every other current class uses the established larger-car image.
const LIVE_VEHICLE_IMAGE = {
    sedan: { src: topViewSedan, width: 60, height: 28 },
    default: { src: topViewVehicle, width: 60, height: 33 },
};
const loadedVehicleImages = new Map();
const rotatedVehicleIcons = new Map();

const normaliseVehicleClass = (vehicleClass) =>
    LIVE_VEHICLE_CLASSES.has(vehicleClass) ? vehicleClass : "hatchback";

const normaliseHeading = (heading, fallback = 0) => {
    const number = Number(heading);
    return Number.isFinite(number) ? (number % 360 + 360) % 360 : fallback;
};

const vehicleImageFor = (vehicleClass) =>
    normaliseVehicleClass(vehicleClass) === "sedan" ? LIVE_VEHICLE_IMAGE.sedan : LIVE_VEHICLE_IMAGE.default;

const loadVehicleImage = (src) => {
    if (!loadedVehicleImages.has(src)) {
        loadedVehicleImages.set(src, new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = src;
        }));
    }
    return loadedVehicleImages.get(src);
};

// The source artwork faces west. Rotating it by bearing + 90 degrees makes its
// nose use map compass bearings (0 north, 90 east). Three-degree buckets avoid
// generating a new PNG on every animation frame while remaining visually smooth.
const rotatedVehicleIconUrl = (vehicleClass, heading) => {
    const nextClass = normaliseVehicleClass(vehicleClass);
    const imageSpec = vehicleImageFor(nextClass);
    const headingBucket = Math.round(normaliseHeading(heading) / 3) * 3 % 360;
    const key = `${imageSpec.src}:${headingBucket}`;
    if (!rotatedVehicleIcons.has(key)) {
        rotatedVehicleIcons.set(key, loadVehicleImage(imageSpec.src).then((image) => {
            const canvas = document.createElement("canvas");
            canvas.width = LIVE_DRIVER_MARKER_SIZE;
            canvas.height = LIVE_DRIVER_MARKER_SIZE;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Canvas unavailable");

            context.translate(LIVE_DRIVER_MARKER_SIZE / 2, LIVE_DRIVER_MARKER_SIZE / 2);
            context.rotate((headingBucket + 90) * Math.PI / 180);
            context.shadowColor = "rgba(0, 0, 0, 0.55)";
            context.shadowBlur = 4;
            context.shadowOffsetY = 2;
            context.drawImage(image, -imageSpec.width / 2, -imageSpec.height / 2,
                imageSpec.width, imageSpec.height);
            return canvas.toDataURL("image/png");
        }));
    }
    return rotatedVehicleIcons.get(key);
};

const imageIcon = (g, url, width, height) => ({
    url,
    scaledSize: new g.Size(width, height),
    anchor: new g.Point(width / 2, height / 2),
});

const endpointIcon = (g, svg) => ({
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new g.Size(ENDPOINT_ICON_WIDTH, ENDPOINT_ICON_HEIGHT),
    // The stem's tip, rather than the centre of the circle, is the coordinate.
    anchor: new g.Point(ENDPOINT_X, ENDPOINT_TIP_Y),
});

// Fixed centre pin for the confirm-location map. The small endpoint circle sits
// exactly on the map centre while its stem rises into a compact location label.
export const CenterPin = ({ target }) => (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-0 w-0 drop-shadow-[0_2px_5px_rgba(0,0,0,0.65)]">
        <div className={`absolute bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold leading-none ${target === "pickup" ? "bg-[var(--foreground)] text-[var(--text-foreground)]" : "bg-primary text-[var(--foreground)]"}`}>
            {target === "pickup" ? "Pickup location" : "Drop location"}
        </div>
        <div className={`absolute bottom-0 left-1/2 h-5 w-0.5 -translate-x-1/2 ${target === "pickup" ? "bg-[var(--foreground)]" : "bg-primary"}`} />
        {target === "pickup"
            ? <div className="absolute left-1/2 top-1/2 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--foreground)]"><div className="h-1.5 w-1.5 rounded-full bg-[var(--background)]" /></div>
            : <div className="absolute left-1/2 top-1/2 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary"><div className="h-1.5 w-1.5 rounded-full bg-[var(--background)]" /></div>}
    </div>
);

let routeOverlays = null;
let progressRoutePath = null;

export function clearRouteView() {
    if (!routeOverlays) return;
    Object.values(routeOverlays).forEach(o => o.setMap(null));
    routeOverlays = null;
    progressRoutePath = null;
}

// Zoomed-out full-route view: both endpoints marked, connected by the real
// road path from the fare estimate (straight-line fallback when it's missing),
// and fitted in frame. onPickupClick/onDropClick make the markers tappable —
// omit them where the route is already booked and can't be adjusted.
export function showRouteView(map, { pickupPoint, dropPoint, routePolyline, progressPoint = null, onPickupClick, onDropClick, framePoints = [], padding = 60 }) {
    clearRouteView();
    const g = window.google.maps;
    const routePath = routePolyline && g.geometry
        ? g.geometry.encoding.decodePath(routePolyline)
        : [pickupPoint, dropPoint].filter(Boolean);
    const visibleRoutePath = progressPoint
        ? remainingRoadPath(routePath, progressPoint) ?? routePath
        : routePath;

    const pickupMarker = pickupPoint
        ? new g.Marker({ map, position: pickupPoint, icon: endpointIcon(g, PICKUP_MARKER_SVG) })
        : null;
    const dropMarker = dropPoint
        ? new g.Marker({ map, position: dropPoint, icon: endpointIcon(g, DROP_MARKER_SVG) })
        : null;
    if (pickupMarker && onPickupClick) pickupMarker.addListener("click", onPickupClick);
    if (dropMarker && onDropClick) dropMarker.addListener("click", onDropClick);

    const line = new g.Polyline({
        map, path: visibleRoutePath, geodesic: true,
        strokeColor: "#7A94FF", strokeOpacity: 1, strokeWeight: 4,
    });
    routeOverlays = { ...(pickupMarker ? { pickupMarker } : {}), ...(dropMarker ? { dropMarker } : {}), line };
    progressRoutePath = progressPoint ? routePath : null;

    // fit over the whole path, not just the endpoints — a curving route can
    // swing well outside the straight-line bounding box
    const bounds = new g.LatLngBounds();
    visibleRoutePath.forEach(p => bounds.extend(p));
    if (pickupPoint) bounds.extend(pickupPoint);
    if (dropPoint) bounds.extend(dropPoint);
    framePoints.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, padding);
}

// GPS fixes arrive more often than paid route recalculations. Trim the line at
// each fix without rebuilding markers or moving the camera; a fresh polyline
// from the server replaces progressRoutePath when the driver deviates.
export function setRouteProgress(coords) {
    if (!routeOverlays?.line || !progressRoutePath || !coords) return;
    const remaining = remainingRoadPath(progressRoutePath, coords);
    if (remaining) routeOverlays.line.setPath(remaining);
}

// Pre-booking fleet preview. Kept separate from the assigned-driver marker so
// leaving VehicleSelect cannot disturb TrackingPage's live animated car.
let nearbyVehicleMarkers = [];

export function setNearbyVehiclePositions(map, positions, vehicleClass) {
    clearNearbyVehicleMarkers();
    if (!positions?.length) return;
    const g = window.google.maps;
    const nextClass = normaliseVehicleClass(vehicleClass);
    const image = vehicleImageFor(nextClass);
    nearbyVehicleMarkers = positions.map((position) => new g.Marker({
        map,
        position,
        zIndex: 8,
        title: `Nearby ${labelOf(nextClass)}`,
        // Use the same top-view, class-aware artwork as the assigned-driver
        // marker. These anonymous preview points do not expose a bearing, so
        // they retain the source image's stable default orientation.
        icon: imageIcon(g, image.src, image.width, image.height),
    }));
}

export function clearNearbyVehicleMarkers() {
    nearbyVehicleMarkers.forEach(marker => marker.setMap(null));
    nearbyVehicleMarkers = [];
}

// Driver puck, kept in its own registry so live position updates never
// disturb (or get cleared with) the route overlays.
let driverMarker = null;
let driverAnim = null;
// When the previous position landed, in performance.now() terms. The gap
// between two updates is what the next glide is timed against.
let lastDriverUpdate = 0;
// The route returned with the previous poll starts at that poll's fix, which is
// exactly the road geometry needed to reach the next one. Keep it alongside the
// new route and choose whichever matches both displayed positions best.
let lastNavigationPolyline = null;
let lastDriverVehicleClass = null;
let lastDriverHeading = null;
let driverAppearanceVersion = 0;

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
function updateDriverAppearance(g, vehicleClass, heading, force = false) {
    if (!driverMarker) return;
    const nextClass = normaliseVehicleClass(vehicleClass);
    const nextHeading = normaliseHeading(heading, lastDriverHeading ?? 0);
    const headingDelta = lastDriverHeading == null
        ? Infinity
        : Math.abs(((nextHeading - lastDriverHeading + 540) % 360) - 180);
    if (!force && nextClass === lastDriverVehicleClass && headingDelta < 2) return;

    if (nextClass !== lastDriverVehicleClass) driverMarker.setTitle(`Driver location · ${labelOf(nextClass)}`);
    lastDriverVehicleClass = nextClass;
    lastDriverHeading = nextHeading;
    const version = ++driverAppearanceVersion;
    void rotatedVehicleIconUrl(nextClass, nextHeading)
        .then((url) => {
            // Image decoding and canvas work are asynchronous. A car can round
            // another bend before an earlier rotation finishes, so only the
            // newest requested heading is allowed to reach the marker.
            if (driverMarker && version === driverAppearanceVersion)
                driverMarker.setIcon(imageIcon(g, url, LIVE_DRIVER_MARKER_SIZE, LIVE_DRIVER_MARKER_SIZE));
        })
        .catch(() => {
            // Keep the unrotated established asset already on the marker. A
            // missing image must not interrupt position animation.
        });
}

function glideDriverTo(g, from, to, duration, vehicleClass, reportedBearing) {
    const start = performance.now();
    updateDriverAppearance(g, vehicleClass, headingBetween(from, to) ?? reportedBearing);
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

function decodeNavigationPath(g, encoded) {
    if (!encoded || !g.geometry?.encoding) return null;
    try {
        return g.geometry.encoding.decodePath(encoded);
    } catch {
        return null;
    }
}

function roadMotionFor(g, encodedPolylines, from, to) {
    let best = null;
    for (const encoded of new Set(encodedPolylines.filter(Boolean))) {
        const decoded = decodeNavigationPath(g, encoded);
        if (!decoded) continue;
        const candidate = roadPathBetween(decoded, from, to);
        if (candidate && (!best || candidate.routeOffsetKm < best.routeOffsetKm)) best = candidate;
    }
    return best ? preparePathMotion(best.points) : null;
}

function glideDriverAlong(g, motion, duration, vehicleClass, reportedBearing) {
    const start = performance.now();
    // Land on the road before setting off. Usually this is sub-metre because the
    // previous frame already ended on the same route; on the first routed update
    // it removes ordinary GPS drift instead of drawing that drift across a block.
    driverMarker.setPosition(motion.points[0]);
    let previousPoint = motion.points[0];
    updateDriverAppearance(g, vehicleClass,
        headingBetween(motion.points[0], motion.points[1]) ?? reportedBearing);
    const step = (now) => {
        const t = Math.min((now - start) / duration, 1);
        const nextPoint = pointAlongPreparedPath(motion, t);
        updateDriverAppearance(g, vehicleClass, headingBetween(previousPoint, nextPoint) ?? reportedBearing);
        driverMarker.setPosition(nextPoint);
        previousPoint = nextPoint;
        driverAnim = t < 1 ? requestAnimationFrame(step) : null;
    };
    driverAnim = requestAnimationFrame(step);
}

export function setDriverPosition(map, coords, { navigationPolyline = null, vehicleClass = null, bearing = null } = {}) {
    if (!coords) return;
    const g = window.google.maps;
    const now = performance.now();

    if (!driverMarker) {
        const initialClass = normaliseVehicleClass(vehicleClass);
        const initialHeading = normaliseHeading(bearing);
        const initialImage = vehicleImageFor(initialClass);
        driverMarker = new g.Marker({
            map, position: coords, zIndex: 10,
            icon: imageIcon(g, initialImage.src, initialImage.width, initialImage.height),
            title: `Driver location · ${labelOf(initialClass)}`,
        });
        lastDriverVehicleClass = null;
        lastDriverHeading = null;
        updateDriverAppearance(g, initialClass, initialHeading, true);
        lastDriverUpdate = now;
        lastNavigationPolyline = navigationPolyline;
        return;
    }

    driverMarker.setMap(map);
    updateDriverAppearance(g, vehicleClass, bearing);

    // From wherever the puck actually IS, not from the last position we were
    // given. A fix arriving mid-glide leaves the marker part-way between two
    // points, and restarting from the previous target would snap it backwards
    // before setting off again.
    cancelDriverAnim();
    const at = driverMarker.getPosition();
    const from = { lat: at.lat(), lng: at.lng() };

    const gap = now - lastDriverUpdate;
    lastDriverUpdate = now;
    const routeCandidates = [lastNavigationPolyline, navigationPolyline];
    lastNavigationPolyline = navigationPolyline;

    if (haversineKm(from, coords) > SNAP_OVER_KM) {
        driverMarker.setPosition(coords);
        return;
    }

    const duration = Math.min(Math.max(gap, GLIDE_MIN_MS), GLIDE_MAX_MS);
    const roadMotion = roadMotionFor(g, routeCandidates, from, coords);
    if (roadMotion) glideDriverAlong(g, roadMotion, duration, vehicleClass, bearing);
    else glideDriverTo(g, from, coords, duration, vehicleClass, bearing);
}

export function clearDriverMarker() {
    // Before the marker goes: a frame still queued against a removed marker
    // would call setPosition on it every frame for the rest of the session.
    cancelDriverAnim();
    driverMarker?.setMap(null);
    driverMarker = null;
    lastDriverUpdate = 0;
    lastNavigationPolyline = null;
    lastDriverVehicleClass = null;
    lastDriverHeading = null;
    driverAppearanceVersion += 1;
}

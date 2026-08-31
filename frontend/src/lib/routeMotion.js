import { haversineKm } from "./trip.js";

const KM_PER_DEGREE = 111.32;
const ROUTE_OFFSET_LIMIT_KM = 0.08;
const BACKTRACK_TOLERANCE_KM = 0.005;

const asPoint = (point) => {
    if (!point) return null;
    const lat = typeof point.lat === "function" ? point.lat() : Number(point.lat);
    const lng = typeof point.lng === "function" ? point.lng() : Number(point.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

const projectOntoSegment = (point, start, end) => {
    const referenceLat = ((point.lat + start.lat + end.lat) / 3) * Math.PI / 180;
    const lngScale = Math.max(0.01, Math.cos(referenceLat));
    const segmentX = (end.lng - start.lng) * lngScale * KM_PER_DEGREE;
    const segmentY = (end.lat - start.lat) * KM_PER_DEGREE;
    const pointX = (point.lng - start.lng) * lngScale * KM_PER_DEGREE;
    const pointY = (point.lat - start.lat) * KM_PER_DEGREE;
    const lengthSquared = segmentX * segmentX + segmentY * segmentY;
    const fraction = lengthSquared === 0
        ? 0
        : Math.min(1, Math.max(0, (pointX * segmentX + pointY * segmentY) / lengthSquared));
    const projected = {
        lat: start.lat + (end.lat - start.lat) * fraction,
        lng: start.lng + (end.lng - start.lng) * fraction,
    };
    return { point: projected, fraction, distanceKm: haversineKm(point, projected) };
};

const projectOntoPath = (path, point) => {
    let best = null;
    let distanceBefore = 0;

    for (let index = 0; index < path.length - 1; index += 1) {
        const segmentLengthKm = haversineKm(path[index], path[index + 1]);
        const projected = projectOntoSegment(point, path[index], path[index + 1]);
        const candidate = {
            ...projected,
            segmentIndex: index,
            distanceAlongKm: distanceBefore + segmentLengthKm * projected.fraction,
        };
        if (!best || candidate.distanceKm < best.distanceKm) best = candidate;
        distanceBefore += segmentLengthKm;
    }

    return best;
};

const withoutAdjacentDuplicates = (points) => points.filter((point, index) =>
    index === 0 || haversineKm(points[index - 1], point) > 0.0001);

/**
 * Extract the forward road subpath between two GPS fixes. Both fixes must be
 * close to the supplied navigation route; otherwise null tells the map to use
 * its conservative fallback rather than snapping onto an unrelated road.
 */
export function roadPathBetween(routePath, fromFix, toFix, offsetLimitKm = ROUTE_OFFSET_LIMIT_KM) {
    const path = routePath.map(asPoint).filter(Boolean);
    const from = asPoint(fromFix);
    const to = asPoint(toFix);
    if (path.length < 2 || !from || !to) return null;

    const start = projectOntoPath(path, from);
    const end = projectOntoPath(path, to);
    if (!start || !end || start.distanceKm > offsetLimitKm || end.distanceKm > offsetLimitKm)
        return null;
    if (end.distanceAlongKm + BACKTRACK_TOLERANCE_KM < start.distanceAlongKm)
        return null;

    const points = [start.point];
    for (let index = start.segmentIndex + 1; index <= end.segmentIndex; index += 1)
        points.push(path[index]);
    points.push(end.point);

    const cleanPoints = withoutAdjacentDuplicates(points);
    if (cleanPoints.length < 2) return null;

    return {
        points: cleanPoints,
        routeOffsetKm: Math.max(start.distanceKm, end.distanceKm),
    };
}

/**
 * Keep only the road still ahead of a moving vehicle.
 *
 * A live navigation polyline is refreshed periodically rather than for every
 * GPS fix. Projecting the newer fixes onto that path lets the visible line
 * shrink between route refreshes. If the vehicle is no longer close to the
 * path, return null so the caller keeps the last honest route until the server
 * supplies a recalculation instead of snapping the line onto an unrelated road.
 */
export function remainingRoadPath(routePath, currentFix, offsetLimitKm = ROUTE_OFFSET_LIMIT_KM) {
    const path = routePath.map(asPoint).filter(Boolean);
    const current = asPoint(currentFix);
    if (path.length < 2 || !current) return null;

    const start = projectOntoPath(path, current);
    if (!start || start.distanceKm > offsetLimitKm) return null;

    const points = [start.point, ...path.slice(start.segmentIndex + 1)];
    const cleanPoints = withoutAdjacentDuplicates(points);
    return cleanPoints.length >= 2 ? cleanPoints : [start.point, path[path.length - 1]];
}

export function preparePathMotion(path) {
    const points = path.map(asPoint).filter(Boolean);
    if (points.length < 2) return null;

    const cumulativeKm = [0];
    for (let index = 1; index < points.length; index += 1)
        cumulativeKm.push(cumulativeKm[index - 1] + haversineKm(points[index - 1], points[index]));

    const totalKm = cumulativeKm[cumulativeKm.length - 1];
    if (totalKm <= 0) return null;
    return { points, cumulativeKm, totalKm };
}

export function pointAlongPreparedPath(motion, progress) {
    const targetKm = motion.totalKm * Math.min(1, Math.max(0, progress));
    let segment = 1;
    while (segment < motion.cumulativeKm.length - 1 && motion.cumulativeKm[segment] < targetKm)
        segment += 1;

    const startKm = motion.cumulativeKm[segment - 1];
    const endKm = motion.cumulativeKm[segment];
    const fraction = endKm === startKm ? 1 : (targetKm - startKm) / (endKm - startKm);
    const start = motion.points[segment - 1];
    const end = motion.points[segment];
    return {
        lat: start.lat + (end.lat - start.lat) * fraction,
        lng: start.lng + (end.lng - start.lng) * fraction,
    };
}

/** Compass heading from one map point to another: north 0, east 90. */
export function headingBetween(fromPoint, toPoint) {
    const from = asPoint(fromPoint);
    const to = asPoint(toPoint);
    if (!from || !to || haversineKm(from, to) < 0.000001) return null;

    const toRadians = (degrees) => degrees * Math.PI / 180;
    const fromLat = toRadians(from.lat);
    const toLat = toRadians(to.lat);
    const deltaLng = toRadians(to.lng - from.lng);
    const y = Math.sin(deltaLng) * Math.cos(toLat);
    const x = Math.cos(fromLat) * Math.sin(toLat) -
        Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

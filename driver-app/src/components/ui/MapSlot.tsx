import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Image, Pressable, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type MapStyleElement } from 'react-native-maps';
import { CrosshairSimpleIcon } from 'phosphor-react-native';
import { decodeGooglePolyline } from '../../lib/polyline';

type Point = { latitude: number; longitude: number };
type Props = {
    pickup?: Point | null;
    drop?: Point | null;
    driver?: Point | null;
    carType?: string | null;
    routePolyline?: string | null;
    cameraMode?: 'follow-driver' | 'fit-route';
    bottomSheetHeight?: number;
};

const topView = require('../../../assets/top-view.webp');
const topViewSedan = require('../../../assets/top-view-sedan.webp');


const INITIAL_REGION_DELTA = 0.005;
const ROUTE_EDGE_PADDING = { top: 64, right: 64, bottom: 64, left: 64 };
const MAP_CONTROL_GAP = 16;
const MAP_CONTROL_SIZE = 48;
const GOOGLE_MAP_ID = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() || undefined;
const FALLBACK_POINT: Point = { latitude: 28.6315, longitude: 77.2167 };

// Native map props cross the React Native bridge before TypeScript can help us.
// An object containing `latitude: undefined` is serialised without that key and
// Android throws NoSuchKeyException while mounting the Polyline. Treat API and
// GPS values as untrusted at this boundary so one incomplete ride cannot take
// down the entire captain app.
const validPoint = (latitude: unknown, longitude: unknown): Point | null => {
    if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return null;
    if ((typeof latitude === 'string' && latitude.trim() === '') || (typeof longitude === 'string' && longitude.trim() === '')) return null;
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { latitude: lat, longitude: lng };
};

// Dark mirrors the passenger website. Light stays in the same blue-grey family,
// with lifted shades instead of switching to an unrelated stock Google theme.
export const DARK_MAP_STYLE: MapStyleElement[] = [
    { elementType: 'geometry', stylers: [{ color: '#2e2e38' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#d6d6db' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#2e2e38' }] },
    { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#41414d' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#1d1d27' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#16161f' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9a9ab2' }] },
    { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#1d1d26' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#101018' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.park', stylers: [{ visibility: 'on' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1b1b26' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

const LIGHT_MAP_STYLE: MapStyleElement[] = [
    { elementType: 'geometry', stylers: [{ color: '#b9b9bf' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#565660' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#f4f4f6' }, { weight: 2 }] },
    { featureType: 'landscape.man_made', elementType: 'geometry.fill', stylers: [{ color: '#e1e1e5' }] },
    { featureType: 'landscape.man_made', elementType: 'geometry.stroke', stylers: [{ color: '#c9c9d0' }, { weight: 1 }] },
    { featureType: 'poi', elementType: 'geometry.fill', stylers: [{ visibility: 'on' }, { color: '#e1e1e5' }] },
    { featureType: 'poi', elementType: 'geometry.stroke', stylers: [{ visibility: 'on' }, { color: '#c9c9d0' }, { weight: 1 }] },
    { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dbe4ed' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#eeeef2' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#55555f' }] },
    { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#f8f8fa' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'poi.park', stylers: [{ visibility: 'on' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e4efdf' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

const EndpointPin = ({ kind }: { kind: 'pickup' | 'drop' }) => {
    const pickup = kind === 'pickup';
    const color = pickup ? '#ffffff' : '#243AFB';
    return (
        <View style={{ width: 48, height: 52, alignItems: 'center' }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: color, alignItems: 'center', justifyContent: 'center', elevation: 5 }}>
                {!pickup ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#0B0B14' }} /> : null}
            </View>
            <View style={{ width: 3, height: 22, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, backgroundColor: color }} />
        </View>
    );
};


function DriverPin({ carType }: { carType: string | null }) {
    return (
        <View>
            <Image
                source={carType === 'sedan' ? topViewSedan : topView}
                style={{ width: 60, height: 60 }}
                resizeMode="contain"
            />
        </View>
    );
}

/** Full-bleed active-ride map. Booking endpoints are facts, never draggable. */
const MapSlot = ({
    pickup,
    drop,
    driver,
    carType,
    routePolyline,
    cameraMode = 'follow-driver',
    bottomSheetHeight = 0,
}: Props) => {
    const mapRef = useRef<MapView>(null);
    const mapReadyRef = useRef(false);
    const followsDriverRef = useRef(cameraMode === 'follow-driver');
    const cameraModeRef = useRef(cameraMode);
    cameraModeRef.current = cameraMode;
    const wasAwayRef = useRef(AppState.currentState !== 'active');
    const resumeCenterPendingRef = useRef(false);
    const resumeDriverKeyRef = useRef<string | null>(null);
    const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fittedRouteKeyRef = useRef<string | null>(null);
    const visibleLatitudeDeltaRef = useRef(INITIAL_REGION_DELTA);
    const initialBottomSheetHeightRef = useRef(bottomSheetHeight);
    const [mapHeight, setMapHeight] = useState(0);
    const [recenterPressed, setRecenterPressed] = useState(false);
    const pickupLatitude = pickup?.latitude;
    const pickupLongitude = pickup?.longitude;
    const dropLatitude = drop?.latitude;
    const dropLongitude = drop?.longitude;
    const driverLatitude = driver?.latitude;
    const driverLongitude = driver?.longitude;
    const pickupPoint = useMemo(
        () => validPoint(pickupLatitude, pickupLongitude),
        [pickupLatitude, pickupLongitude],
    );
    const dropPoint = useMemo(
        () => validPoint(dropLatitude, dropLongitude),
        [dropLatitude, dropLongitude],
    );
    const driverPoint = useMemo(
        () => validPoint(driverLatitude, driverLongitude),
        [driverLatitude, driverLongitude],
    );
    const driverKey = driverPoint ? `${driverPoint.latitude}:${driverPoint.longitude}` : null;
    const currentDriverKeyRef = useRef(driverKey);
    currentDriverKeyRef.current = driverKey;
    const endpointPoints = useMemo(
        () => [pickupPoint, dropPoint].filter((point): point is Point => point !== null),
        [pickupPoint, dropPoint],
    );
    const decodedRoute = useMemo(
        () => decodeGooglePolyline(routePolyline),
        [routePolyline],
    );
    const routePoints = useMemo(() => {
        if (decodedRoute.length >= 2) return decodedRoute;
        return endpointPoints;
    }, [decodedRoute, endpointPoints]);
    const points = useMemo(() => {
        const framePoints = driverPoint ? [...routePoints, driverPoint] : routePoints;
        return framePoints.length > 0 ? framePoints : [FALLBACK_POINT];
    }, [driverPoint, routePoints]);
    const routeFrameKey = `${pickupLatitude ?? ''}:${pickupLongitude ?? ''}:${dropLatitude ?? ''}:${dropLongitude ?? ''}:${routePolyline ?? ''}:driver-${Boolean(driverPoint)}`;

    const centerOnDriver = useCallback((animated: boolean, resetZoom = false) => {
        const map = mapRef.current;
        if (!map || !mapReadyRef.current || !driverPoint || mapHeight <= 0) return false;

        // The map continues under the sheet. Offset the native camera by half
        // of that covered fraction so the car lands in the centre of the part
        // the captain can actually see. Recenter restores the initial zoom;
        // automatic GPS following preserves the captain's chosen zoom.
        const coveredHeight = Math.min(Math.max(initialBottomSheetHeightRef.current, 0), mapHeight);
        const latitudeDelta = resetZoom ? INITIAL_REGION_DELTA : visibleLatitudeDeltaRef.current;
        const latitudeOffset = latitudeDelta * coveredHeight / (2 * mapHeight);
        const camera = {
            center: {
                latitude: driverPoint.latitude - latitudeOffset,
                longitude: driverPoint.longitude,
            },
        };

        if (resetZoom) {
            map.animateToRegion({
                ...camera.center,
                latitudeDelta: INITIAL_REGION_DELTA,
                longitudeDelta: INITIAL_REGION_DELTA,
            }, animated ? 250 : 0);
        } else if (animated) map.animateCamera(camera, { duration: 250 });
        else map.setCamera(camera);
        return true;
    }, [driverPoint, mapHeight]);

    const centerOnDriverRef = useRef(centerOnDriver);
    centerOnDriverRef.current = centerOnDriver;

    const fit = useCallback((animated: boolean) => {
        const map = mapRef.current;
        if (!map || !mapReadyRef.current || mapHeight <= 0) return;
        if (cameraMode === 'fit-route') {
            if (fittedRouteKeyRef.current !== routeFrameKey && points.length > 1) {
                fittedRouteKeyRef.current = routeFrameKey;
                map.fitToCoordinates(points, {
                    edgePadding: {
                        ...ROUTE_EDGE_PADDING,
                        bottom: ROUTE_EDGE_PADDING.bottom + Math.max(initialBottomSheetHeightRef.current, 0),
                    },
                    animated,
                });
            }
            return;
        }
        if (driverPoint) {
            // A deliberate pan suspends follow mode. Re-enabling it belongs to
            // the recenter button, otherwise the next GPS tick would yank the
            // map back while the captain is inspecting the road ahead.
            if (followsDriverRef.current) centerOnDriver(animated);
            return;
        }
        if (points.length === 1) {
            map.animateToRegion({
                ...points[0],
                latitudeDelta: INITIAL_REGION_DELTA,
                longitudeDelta: INITIAL_REGION_DELTA,
            }, animated ? 250 : 0);
            return;
        }
        map.fitToCoordinates(points, {
            edgePadding: {
                ...ROUTE_EDGE_PADDING,
                bottom: ROUTE_EDGE_PADDING.bottom + Math.max(initialBottomSheetHeightRef.current, 0),
            },
            animated,
        });
    }, [cameraMode, centerOnDriver, driverPoint, mapHeight, points, routeFrameKey]);

    useEffect(() => { fit(true); }, [fit]);

    useEffect(() => {
        const restoreCamera = () => {
            centerOnDriverRef.current(false);
        };

        const subscription = AppState.addEventListener('change', (state) => {
            if (state !== 'active') {
                wasAwayRef.current = true;
                if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
                resumeTimerRef.current = null;
                return;
            }

            if (!wasAwayRef.current) return;
            wasAwayRef.current = false;
            resumeCenterPendingRef.current = true;
            resumeDriverKeyRef.current = currentDriverKeyRef.current;
            followsDriverRef.current = cameraModeRef.current === 'follow-driver';

            // Restore against the first frame RCS owns again, using the fix we
            // already had while Maps was in front. The short second pass covers
            // Android devices that recreate the native GoogleMap surface a
            // fraction after React receives the active event.
            requestAnimationFrame(restoreCamera);
            resumeTimerRef.current = setTimeout(() => {
                resumeTimerRef.current = null;
                restoreCamera();
            }, 500);
        });

        return () => {
            subscription.remove();
            if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
            resumeTimerRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (resumeCenterPendingRef.current && centerOnDriver(false)) {
            // Keep the resume intent until native location hands us a position
            // different from the one we had before Google Maps. That prevents a
            // slow cached read from arriving after the settle timer and being
            // ignored by fit-route mode.
            if (driverKey !== resumeDriverKeyRef.current) {
                resumeCenterPendingRef.current = false;
            }
        }
    }, [centerOnDriver, driverKey]);

    const initialTarget = driverPoint ?? points[0];

    const recenter = () => {
        followsDriverRef.current = true;
        centerOnDriver(true, true);
    };

    // The control stays above the measured sheet, where it remains available
    // without covering the route or fighting the sheet's drag handle. Clamp it
    // on short screens so it cannot be pushed behind the top app chrome.
    const recenterBottom = Math.min(
        Math.max(bottomSheetHeight, 0) + MAP_CONTROL_GAP,
        Math.max(mapHeight - MAP_CONTROL_SIZE - 104, MAP_CONTROL_GAP),
    );

    return (
        <View style={{ position: 'absolute', inset: 0 }}>
        <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={{ position: 'absolute', inset: 0 }}
            googleMapId={GOOGLE_MAP_ID}
            googleRenderer="LATEST"
            customMapStyle={GOOGLE_MAP_ID ? undefined : LIGHT_MAP_STYLE}
            userInterfaceStyle="light"
            mapType="standard"
            showsBuildings={true}
            showsIndoors={false}
            onLayout={(event) => {
                const nextHeight = event.nativeEvent.layout.height;
                setMapHeight((currentHeight) => currentHeight === nextHeight ? currentHeight : nextHeight);
            }}
            initialRegion={{
                latitude: initialTarget.latitude,
                longitude: initialTarget.longitude,
                latitudeDelta: INITIAL_REGION_DELTA,
                longitudeDelta: INITIAL_REGION_DELTA,
            }}
            toolbarEnabled={false}
            zoomEnabled={true}
            rotateEnabled={false}
            pitchEnabled={false}
            showsCompass={false}
            showsMyLocationButton={false}
            moveOnMarkerPress={false}
            onRegionChangeComplete={(region) => {
                // Ref rather than state: camera movement should not render the
                // whole map tree, but the next GPS fix still needs the exact
                // zoom/span currently visible on screen.
                visibleLatitudeDeltaRef.current = region.latitudeDelta;
            }}
            onPanDrag={() => {
                followsDriverRef.current = false;
            }}
            onMapReady={() => {
                mapReadyRef.current = true;
                if (resumeCenterPendingRef.current && centerOnDriver(false)) {
                    return;
                }

                // A native GoogleMap surface may be recreated while React and
                // this component stay mounted. Its old route key no longer says
                // anything about the new camera, so allow the initial fit again.
                fittedRouteKeyRef.current = null;
                fit(false);
            }}
        >
            {routePoints.length >= 2 ? <Polyline coordinates={routePoints} strokeColor="#7A94FF" strokeWidth={4} /> : null}
            {pickupPoint ? (
                <Marker coordinate={pickupPoint} anchor={{ x: 0.5, y: 0.885 }} tracksViewChanges={false}>
                    <EndpointPin kind="pickup" />
                </Marker>
            ) : null}
            {dropPoint ? (
                <Marker coordinate={dropPoint} anchor={{ x: 0.5, y: 0.885 }} tracksViewChanges={false}>
                    <EndpointPin kind="drop" />
                </Marker>
            ) : null}
            {driverPoint ? (
                // Keep view tracking enabled for this single live marker. On
                // Android the WebP is decoded after the custom marker first
                // mounts; disabling tracking freezes that first blank bitmap.
                <Marker coordinate={driverPoint} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={true} zIndex={10}>
                    <DriverPin carType={carType ?? null} />
                </Marker>
            ) : null}
        </MapView>

        {driverPoint ? (
            <Pressable
                role="button"
                aria-label="Recenter map on your location"
                accessibilityHint="Moves the map back to the captain vehicle"
                hitSlop={4}
                onPress={recenter}
                onPressIn={() => setRecenterPressed(true)}
                onPressOut={() => setRecenterPressed(false)}
                style={{
                    position: 'absolute',
                    right: MAP_CONTROL_GAP,
                    bottom: recenterBottom,
                    width: MAP_CONTROL_SIZE,
                    height: MAP_CONTROL_SIZE,
                    borderRadius: MAP_CONTROL_SIZE / 2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#ffffff',
                    opacity: recenterPressed ? 0.75 : 1,
                    elevation: 6,
                }}
            >
                <CrosshairSimpleIcon size={24} weight="bold" color="#121220" />
            </Pressable>
        ) : null}
        </View>
    );
};

export default MapSlot;

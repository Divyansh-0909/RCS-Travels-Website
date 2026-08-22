import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type MapStyleElement } from 'react-native-maps';
import { CarIcon } from 'phosphor-react-native';

type Point = { latitude: number; longitude: number };
type Props = {
    pickup?: Point | null;
    drop?: Point | null;
    driver?: Point | null;
    bottomSheetHeight?: number;
};

const INITIAL_REGION_DELTA = 0.005;
const ROUTE_EDGE_PADDING = { top: 64, right: 64, bottom: 64, left: 64 };
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

const DriverPin = () => (
    <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7A94FF', elevation: 6 }}>
        <CarIcon size={23} weight="fill" color="#0B0B14" />
    </View>
);

/** Full-bleed active-ride map. Booking endpoints are facts, never draggable. */
const MapSlot = ({ pickup, drop, driver, bottomSheetHeight = 0 }: Props) => {
    const mapRef = useRef<MapView>(null);
    const mapReadyRef = useRef(false);
    const visibleLatitudeDeltaRef = useRef(INITIAL_REGION_DELTA);
    const initialBottomSheetHeightRef = useRef(bottomSheetHeight);
    const [mapHeight, setMapHeight] = useState(0);
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
    const points = useMemo(() => {
        const routePoints = [pickupPoint, dropPoint].filter((point): point is Point => point !== null);
        return routePoints.length > 0 ? routePoints : [FALLBACK_POINT];
    }, [pickupPoint, dropPoint]);
    const fit = useCallback((animated: boolean) => {
        const map = mapRef.current;
        if (!map || !mapReadyRef.current || mapHeight <= 0) return;
        if (driverPoint) {
            // The native camera centres against the full MapView. Shift its
            // target south by half the covered fraction so the driver renders
            // at the vertical centre of the map area above the initial sheet.
            // Use the CURRENT visible span: a GPS update must follow the driver
            // without throwing away a zoom level the captain chose by pinching.
            const coveredHeight = Math.min(Math.max(initialBottomSheetHeightRef.current, 0), mapHeight);
            const latitudeOffset = visibleLatitudeDeltaRef.current * coveredHeight / (2 * mapHeight);
            const camera = {
                center: {
                    latitude: driverPoint.latitude - latitudeOffset,
                    longitude: driverPoint.longitude,
                },
            };
            if (animated) map.animateCamera(camera, { duration: 250 });
            else map.setCamera(camera);
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
    }, [driverPoint, mapHeight, points]);

    useEffect(() => { fit(true); }, [fit]);

    const initialTarget = driverPoint ?? points[0];

    return (
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
            onMapReady={() => {
                mapReadyRef.current = true;
                fit(false);
            }}
        >
            {pickupPoint && dropPoint ? <Polyline coordinates={[pickupPoint, dropPoint]} strokeColor="#7A94FF" strokeWidth={4} /> : null}
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
                <Marker coordinate={driverPoint} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={10}>
                    <DriverPin />
                </Marker>
            ) : null}
        </MapView>
    );
};

export default MapSlot;

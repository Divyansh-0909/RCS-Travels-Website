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
    const points = useMemo(() => {
        if (pickupLatitude !== undefined && pickupLongitude !== undefined) {
            const start = { latitude: pickupLatitude, longitude: pickupLongitude };
            if (dropLatitude !== undefined && dropLongitude !== undefined)
                return [start, { latitude: dropLatitude, longitude: dropLongitude }];
            return [start];
        }
        return [{ latitude: 28.6315, longitude: 77.2167 }];
    }, [pickupLatitude, pickupLongitude, dropLatitude, dropLongitude]);
    const fit = useCallback((animated: boolean) => {
        const map = mapRef.current;
        if (!map || !mapReadyRef.current || mapHeight <= 0) return;
        if (driverLatitude !== undefined && driverLongitude !== undefined) {
            // The native camera centres against the full MapView. Shift its
            // target south by half the covered fraction so the driver renders
            // at the vertical centre of the map area above the initial sheet.
            // Use the CURRENT visible span: a GPS update must follow the driver
            // without throwing away a zoom level the captain chose by pinching.
            const coveredHeight = Math.min(Math.max(initialBottomSheetHeightRef.current, 0), mapHeight);
            const latitudeOffset = visibleLatitudeDeltaRef.current * coveredHeight / (2 * mapHeight);
            const camera = {
                center: {
                    latitude: driverLatitude - latitudeOffset,
                    longitude: driverLongitude,
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
    }, [driverLatitude, driverLongitude, mapHeight, points]);

    useEffect(() => { fit(true); }, [fit]);

    const initialTarget = driver ?? points[0];

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
            {pickup && drop ? <Polyline coordinates={[pickup, drop]} strokeColor="#7A94FF" strokeWidth={4} /> : null}
            {pickup ? (
                <Marker coordinate={pickup} anchor={{ x: 0.5, y: 0.885 }} tracksViewChanges={false}>
                    <EndpointPin kind="pickup" />
                </Marker>
            ) : null}
            {drop ? (
                <Marker coordinate={drop} anchor={{ x: 0.5, y: 0.885 }} tracksViewChanges={false}>
                    <EndpointPin kind="drop" />
                </Marker>
            ) : null}
            {driver ? (
                <Marker coordinate={driver} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={10}>
                    <DriverPin />
                </Marker>
            ) : null}
        </MapView>
    );
};

export default MapSlot;

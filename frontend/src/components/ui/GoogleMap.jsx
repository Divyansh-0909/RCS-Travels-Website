import { useEffect, useRef, useState } from "react";
import Skeleton from "./Skeleton";

// Usage:
//   <GoogleMap center={{ lat, lng }} zoom={17} onIdle={(c) => ...} className="...">
//     {/* overlays (e.g. a fixed center pin) render on top of the map */}
//   </GoogleMap>
// onIdle fires with { lat, lng } of the map center after every pan/zoom settles.
// onMapReady hands over the raw Map instance for anything bespoke (markers, fitBounds).

let loaderPromise = null;
let mapDiv = null;
let mapInstance = null;
// Tiles are only "first paint" once per session — the singleton keeps them
// afterwards, so later mounts must not flash the skeleton again.
let tilesEverLoaded = false;

export const MAP_LAND_COLOR = "#2e2e38";

const MAP_STYLES = [
    { elementType: "geometry", stylers: [{ color: MAP_LAND_COLOR }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#d6d6db" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#2e2e38" }, { weight: 2 }] },
    { featureType: "poi", elementType: "labels.icon", stylers: [{ saturation: -100 }, { color: "#5f5f6a" }] },
    { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d6d6db" }] },
    { featureType: "administrative.neighborhood", elementType: "labels.text.fill", stylers: [{ color: "#a0a0a8" }] },
    { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#34343f" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#1d1d27" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#70708c" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#16161f" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ visibility: "off" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9a9ab2" }] },
    { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#1d1d26" }] },
    { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#16161f" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#101018" }] },
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "poi.park", stylers: [{ visibility: "on" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1b1b26" }] },
    { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#5f5f6a" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
];

function loadMapsScript() {
    if (loaderPromise) return loaderPromise;
    loaderPromise = new Promise((resolve, reject) => {
        if (window.google?.maps?.Map) return resolve();
        window.__onMapsJsReady = () => resolve();
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&v=weekly&loading=async&libraries=geometry&callback=__onMapsJsReady`;
        // allow a retry on next mount instead of caching the failure
        script.onerror = () => { loaderPromise = null; reject(new Error("Google Maps JS failed to load")); };
        document.head.appendChild(script);
    });
    return loaderPromise;
}

const GoogleMap = ({ center, zoom = 16, onMapReady, onIdle, className, children }) => {
    const hostRef = useRef(null);
    // covers the map with a shimmer until Google reports the first tiles
    // painted — otherwise tiles pop in over white
    const [ready, setReady] = useState(tilesEverLoaded);
    // ref so the single idle listener always calls the latest callback without
    // re-running the mount effect
    const onIdleRef = useRef(onIdle);
    onIdleRef.current = onIdle;

    useEffect(() => {
        let cancelled = false;
        let idleListener = null;
        let tilesListener = null;

        (async () => {
            try {
                await loadMapsScript();
            } catch (err) {
                console.error(err);
                // drop the shimmer so the container shows its land colour
                // instead of pretending to still be loading
                setReady(true);
                return;
            }
            if (cancelled || !hostRef.current) return;

            if (!mapInstance) {
                mapDiv = document.createElement("div");
                mapDiv.style.width = "100%";
                mapDiv.style.height = "100%";
                mapInstance = new window.google.maps.Map(mapDiv, {
                    center: center ?? { lat: 28.6315, lng: 77.2167 },
                    zoom,
                    disableDefaultUI: true,
                    zoomControl: false,
                    keyboardShortcuts: false,
                    clickableIcons: false,
                    // the surface under not-yet-loaded tiles; Google's default
                    // is white, which flashes hard against this theme
                    backgroundColor: MAP_LAND_COLOR,
                    styles: MAP_STYLES,
                });
            } else {
                if (center) mapInstance.setCenter(center);
                mapInstance.setZoom(zoom);
            }

            // zoom buttons only on sm+ — mobile pinches, and the buttons
            // collide with the bottom-sheet layouts. Re-evaluated per mount,
            // which is when breakpoint hand-offs happen.
            mapInstance.setOptions({ zoomControl: window.matchMedia("(min-width: 640px)").matches });

            hostRef.current.appendChild(mapDiv);
            idleListener = mapInstance.addListener("idle", () => {
                onIdleRef.current?.(mapInstance.getCenter().toJSON());
            });
            if (tilesEverLoaded) setReady(true);
            else tilesListener = mapInstance.addListener("tilesloaded", () => {
                tilesEverLoaded = true;
                setReady(true);
            });
            onMapReady?.(mapInstance);
        })();

        return () => {
            cancelled = true;
            idleListener?.remove();
            tilesListener?.remove();
            if (mapDiv?.parentNode === hostRef.current) hostRef.current.removeChild(mapDiv);
        };
    }, []);

    // re-center when the caller's target moves (e.g. locate-me)
    useEffect(() => {
        if (mapInstance && center) mapInstance.setCenter(center);
    }, [center?.lat, center?.lng]);

    // the wrapper must be POSITIONED via className (relative/absolute) — the
    // host fills it with inset-0 and would otherwise escape to the nearest
    // positioned ancestor
    return (
        <div className={`${className ?? ""} overflow-hidden`}>
            <div ref={hostRef} className="absolute inset-0" />
            {children}
            {/* above children too: a pin floating on a shimmer reads as broken */}
            {!ready && (
                <div className="absolute inset-0 z-20" style={{ background: MAP_LAND_COLOR }}>
                    <Skeleton className="w-full h-full" rounded="rounded-none" />
                </div>
            )}
        </div>
    );
};

export default GoogleMap;

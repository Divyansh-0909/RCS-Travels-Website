import { useEffect, useRef, useState } from "react";
import Icon from "@mdi/react";
import { mdiAlertCircleOutline } from "@mdi/js";
import Skeleton from "./Skeleton";
import googleLogo from "../../assets/google-logo.webp";
import googleAttribution from "../../assets/google-ad.webp";

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

export const MAP_LAND_COLOR = "#b9b9bf";
const MAP_BUILDING_COLOR = "#e1e1e5";
const MAP_BUILDING_STROKE = "#c9c9d0";

const MAP_STYLES = [
    { elementType: "geometry", stylers: [{ color: MAP_LAND_COLOR }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#565660" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#f4f4f6" }, { weight: 2 }] },
    { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#4f4f58" }] },
    { featureType: "administrative.neighborhood", elementType: "labels.text.fill", stylers: [{ color: "#686872" }] },
    // At close zoom Google renders building footprints as man-made landscape.
    // Keep them visibly separate from the surrounding land so a rider can
    // place the pickup pin on the correct house/building.
    { featureType: "landscape.man_made", elementType: "geometry.fill", stylers: [{ color: MAP_BUILDING_COLOR }] },
    { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: MAP_BUILDING_STROKE }, { weight: 1 }] },
    // Named campuses and businesses move into POI geometry at detailed zooms.
    // Hide their labels, not the polygons themselves, or buildings disappear
    // just when the rider zooms in to place a precise pin.
    { featureType: "poi", elementType: "geometry.fill", stylers: [{ visibility: "on" }, { color: MAP_BUILDING_COLOR }] },
    { featureType: "poi", elementType: "geometry.stroke", stylers: [{ visibility: "on" }, { color: MAP_BUILDING_STROKE }, { weight: 1 }] },
    { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#dbe4ed" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#687687" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#eeeeF2" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#55555f" }] },
    { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#f8f8fa" }] },
    { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
    { featureType: "poi.park", stylers: [{ visibility: "on" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#e4efdf" }] },
    { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#667060" }] },
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
    // Maps JS never loaded (blocked, offline, bad key). The container used to be
    // left as a bare grey rectangle, which reads as a broken page rather than a
    // missing map.
    const [loadFailed, setLoadFailed] = useState(false);
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
                setLoadFailed(true);
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
                    renderingType: window.google.maps.RenderingType.RASTER,
                    mapTypeId: "roadmap",
                    tilt: 0,
                    heading: 0,
                    gestureHandling: "greedy",
                    scrollwheel: true,
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
            mapInstance.setOptions({
                zoomControl: window.matchMedia("(min-width: 640px)").matches,
                gestureHandling: "greedy",
                scrollwheel: true,
                styles: MAP_STYLES,
                backgroundColor: MAP_LAND_COLOR,
            });

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
            {/* Branding the SDK would normally draw itself — disableDefaultUI
                strips the logo and the data attribution along with the buttons,
                so they're redrawn here. Phones only: there the map is the page
                background and the sheets cover the bottom corners where Google
                puts them, so they move to the top row instead — logo left,
                attribution right, the same pairing Google ships. The
                attribution hugs its corner with no inset — Google's own chrome
                runs it flush to the edge.
                Hidden until the tiles are up (and dropped entirely if the
                script never loads): branding over a shimmer or over the
                "Map unavailable" card would be crediting a map that isn't
                there. */}
            {ready && !loadFailed && (
                <>
                    <img
                        src={googleLogo}
                        alt="Google"
                        className="absolute top-1 left-3 z-10 sm:hidden w-[58px] h-auto pointer-events-none"
                    />
                    <img
                        src={googleAttribution}
                        alt="Map data ©2026"
                        className="absolute top-0 right-0 z-10 sm:hidden w-[150px] h-auto pointer-events-none"
                    />
                </>
            )}
            {/* above children too: a pin floating on a shimmer reads as broken */}
            {!ready && (
                <div className="absolute inset-0 z-20" style={{ background: MAP_LAND_COLOR }}>
                    <Skeleton className="w-full h-full" rounded="rounded-none" />
                </div>
            )}
            {/* Names the gap rather than filling it. pointer-events-none on
                purpose: on phones this sits behind the booking sheets, and the
                map failing must never intercept a tap meant for the panel. The
                trip itself is unaffected, and the copy says so — every screen
                that shows a map states the same facts in text beside it. */}
            {loadFailed && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 px-6 text-center pointer-events-none" style={{ background: MAP_LAND_COLOR }}>
                    <Icon path={mdiAlertCircleOutline} size={1} className="text-[var(--text-muted)]/70" />
                    <h4 className="text-sm sm:text-base font-medium text-[var(--text)]/80">Map unavailable</h4>
                    {/* No "below": this panel sits beside the content on
                        desktop and behind the sheet on phones, so the copy
                        can't name a direction. */}
                    <p className="text-xs sm:text-sm leading-snug text-[var(--text-muted)] max-w-[28ch]">
                        Your ride is unaffected. Your driver and route details are live.
                    </p>
                </div>
            )}
        </div>
    );
};

export default GoogleMap;

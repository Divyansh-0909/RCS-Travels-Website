import { useContext, useEffect, useRef, useState } from "react";
import Icon from "@mdi/react";
import { mdiAlertCircleOutline } from "@mdi/js";
import MapSkeleton from "./MapSkeleton";
import googleLogo from "../../assets/google-logo.webp";
import googleAttribution from "../../assets/google-ad.webp";
import { ThemeContext } from "../../context/ThemeContext";

// Usage:
//   <GoogleMap center={{ lat, lng }} zoom={17} onIdle={(c) => ...} className="...">
//     {/* overlays (e.g. a fixed center pin) render on top of the map */}
//   </GoogleMap>
// onIdle fires with { lat, lng } of the map center after every pan/zoom settles.
// onMapReady hands over the raw Map instance for anything bespoke (markers, fitBounds).

let loaderPromise = null;
let mapDiv = null;
let mapInstance = null;
let activeMapAppearance = null;
// Tiles are only "first paint" once per session — the singleton keeps them
// afterwards, so later mounts must not flash the skeleton again.
let tilesEverLoaded = false;

const GOOGLE_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID?.trim() || undefined;
const DARK_MAP_LAND_COLOR = "#2e2e38";
const LIGHT_MAP_LAND_COLOR = "#b9b9bf";

// The exported colour is the dark shell fallback used behind full-bleed maps.
// GoogleMap selects its mode-specific background before tiles paint.
export const MAP_LAND_COLOR = DARK_MAP_LAND_COLOR;

// Keep both fallback palettes aligned with
// driver-app/src/components/ui/MapSlot.tsx. A configured JavaScript Map ID
// delegates all colours to Google Cloud and these arrays are not combined with
// the cloud style.
const DARK_MAP_STYLES = [
    { elementType: "geometry", stylers: [{ color: DARK_MAP_LAND_COLOR }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#d6d6db" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: DARK_MAP_LAND_COLOR }] },
    { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#41414d" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#1d1d27" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#16161f" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ visibility: "off" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9a9ab2" }] },
    { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#1d1d26" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#101018" }] },
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "poi.park", stylers: [{ visibility: "on" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1b1b26" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
];

const LIGHT_MAP_STYLES = [
    { elementType: "geometry", stylers: [{ color: LIGHT_MAP_LAND_COLOR }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#565660" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#f4f4f6" }, { weight: 2 }] },
    { featureType: "landscape.man_made", elementType: "geometry.fill", stylers: [{ color: "#e1e1e5" }] },
    { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: "#c9c9d0" }, { weight: 1 }] },
    { featureType: "poi", elementType: "geometry.fill", stylers: [{ visibility: "on" }, { color: "#e1e1e5" }] },
    { featureType: "poi", elementType: "geometry.stroke", stylers: [{ visibility: "on" }, { color: "#c9c9d0" }, { weight: 1 }] },
    { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#dbe4ed" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#eeeef2" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#55555f" }] },
    { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#f8f8fa" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
    { featureType: "poi.park", stylers: [{ visibility: "on" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#e4efdf" }] },
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
    const { darkMode } = useContext(ThemeContext);
    const mapColorScheme = darkMode ? "DARK" : "LIGHT";
    const mapBackgroundColor = darkMode ? DARK_MAP_LAND_COLOR : LIGHT_MAP_LAND_COLOR;
    const fallbackStyles = darkMode ? DARK_MAP_STYLES : LIGHT_MAP_STYLES;
    const mapAppearance = `${GOOGLE_MAP_ID ?? "local"}:${mapColorScheme}`;
    // covers the map with a shimmer until Google reports the first tiles
    // painted — otherwise tiles pop in over white
    const [ready, setReady] = useState(tilesEverLoaded);
    // Kept for the 200ms fade only, then unmounted so an invisible skeleton
    // does not keep animating behind an interactive map for the rest of a trip.
    const [showSkeleton, setShowSkeleton] = useState(!tilesEverLoaded);
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

            if (!mapInstance || activeMapAppearance !== mapAppearance) {
                mapDiv = document.createElement("div");
                mapDiv.style.width = "100%";
                mapDiv.style.height = "100%";
                mapInstance = new window.google.maps.Map(mapDiv, {
                    center: center ?? { lat: 28.6315, lng: 77.2167 },
                    zoom,
                    ...(GOOGLE_MAP_ID
                        ? { mapId: GOOGLE_MAP_ID, colorScheme: mapColorScheme }
                        : {
                            renderingType: window.google.maps.RenderingType.RASTER,
                            styles: fallbackStyles,
                        }),
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
                    backgroundColor: mapBackgroundColor,
                });
                activeMapAppearance = mapAppearance;
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
                ...(!GOOGLE_MAP_ID ? { styles: fallbackStyles } : {}),
                backgroundColor: mapBackgroundColor,
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
    }, [darkMode]);

    useEffect(() => {
        if (!ready) {
            setShowSkeleton(true);
            return;
        }

        const timer = setTimeout(() => setShowSkeleton(false), 220);
        return () => clearTimeout(timer);
    }, [ready]);

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
            {showSkeleton && (
                <div
                    className={`absolute inset-0 z-20 pointer-events-none transition-opacity duration-200 motion-reduce:transition-none ${ready ? "opacity-0" : "opacity-100"}`}
                    style={{ background: mapBackgroundColor }}
                    role="status"
                    aria-live="polite"
                    aria-label={ready ? undefined : "Loading map"}
                    aria-hidden={ready}
                >
                    <MapSkeleton />
                </div>
            )}
            {/* Names the gap rather than filling it. pointer-events-none on
                purpose: on phones this sits behind the booking sheets, and the
                map failing must never intercept a tap meant for the panel. The
                trip itself is unaffected, and the copy says so — every screen
                that shows a map states the same facts in text beside it. */}
            {loadFailed && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 px-6 text-center pointer-events-none" style={{ background: mapBackgroundColor }}>
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

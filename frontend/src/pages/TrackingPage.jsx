import Button from "../components/ui/Button";
import GoogleMap, { MAP_LAND_COLOR } from "../components/ui/GoogleMap";
import { MAP_CLASSES, showRouteView, clearRouteView, setDriverPosition, clearDriverMarker } from "../components/ui/mapOverlays";
import { useIsMobile } from "../hooks/useIsMobile";
import { useData } from "../hooks/useData";
import { useApi } from "../hooks/useApi";
import { useState, useEffect, useRef } from "react";
import { useLocation, useParams } from "react-router-dom";
import ErrorMark from "../components/illustrations/ErrorMark";
import SuccessCheck from "../components/illustrations/SuccessCheck";
import { useViewNavigate } from "../hooks/useViewNavigate";
import PriceIllustration from "../components/illustrations/RadarScanIllustration";
import SafetyIllustration from "../components/illustrations/DriverEnRouteIllustration";
import WhatsAppIllustration from "../components/illustrations/WhatsAppIllustration";
import Icon from '@mdi/react';
import { mdiAccountOutline, mdiClose, mdiKeyboardBackspace, mdiMapMarkerRadius, mdiPhone, mdiShareVariant } from '@mdi/js';
import waLogo from '../assets/whatsapp-logo.webp';
import { openSupportWhatsApp } from "../constants/support";
import ErrorPanel from "../components/ui/ErrorPanel";
import EmptyState from "../components/ui/EmptyState";
import FailureState from "../components/ui/FailureState";
import { useRefreshNotice } from "../hooks/useRefreshNotice";
import BackgroundPanel from "../components/ui/BackgroundPanel";
import NoticePill from "../components/ui/NoticePill";
import pfpPlaceholder from "../assets/pfp-placeholder.webp"
import RideDetails from "../components/RideDetails";
import Skeleton from "../components/ui/Skeleton";
import { SAFE_ROUTE_SURCHARGE, isDistancePriced } from "../constants/fares";
import { labelOf } from "../constants/vehicles";
import { LIVE_STATUSES, minsLabel, formatPlate } from "../lib/trip";
import { useExitAnim } from "../hooks/useExitAnim";

// ---- Shared layout + type scale -------------------------------------------
// The desktop content column is 377px — OnBoarding's effective control width
// (290px base × its 1.3 scale) — reached with a real width instead of a
// transform, so spacing and type sizes stay honest at both breakpoints.
const COL = "w-[min(86vw,100%)] sm:w-[377px]";
const TITLE = "font-bold text-3xl sm:text-5xl leading-tight";
const SUBTITLE = "text-lg sm:text-2xl font-normal leading-snug text-[var(--text-muted)]";
const META = "text-base sm:text-xl";
// Vertical rhythm: 8px inside a pair, 12–16px within a group, 32/48 between.
const STACK = "gap-6 sm:gap-8";
const GROUP = "gap-2 sm:gap-3";
const PAIR = "gap-0.5 sm:gap-1";

const TrackingPage = () => {
    const phone = useData(state => state.phone)
    const scheduledTime = useData(state => state.scheduledTime)
    const activeBooking = useData(state => state.activeBooking)
    const dropLocation = useData(state => state.dropLocation)
    const pickupLocation = useData(state => state.pickupLocation)
    const pickupCoords = useData(state => state.pickupCoords)
    const dropCoords = useData(state => state.dropCoords)
    const routePolyline = useData(state => state.routePolyline)
    // Booked-route metrics, persisted with the rest of the ride form.
    const distanceKm = useData(state => state.distanceKm)
    const durationMin = useData(state => state.durationMin)
    const setCancellationCharge = useData(state => state.setCancellationCharge)
    const fareSource = useData(state => state.fareSource)
    const fare = useData(state => state.fare)
    const safeRoute = useData(state => state.safeRoute)
    const vehicleClass = useData(state => state.vehicleClass);
    const setVehicleClass = useData(state => state.setVehicleClass);
    const sharing = useData(state => state.sharing);
    const setSharing = useData(state => state.setSharing);
    const storeBookingId = useData(state => state.bookingId);
    const setBookingId = useData(state => state.setBookingId);
    // /booking/:id. The URL wins: bookingId is not persisted, so a reload or a
    // link opened from ride history arrives with an empty store and the param is
    // the only thing that says which ride this is. The /dev previews render this
    // page without a param and keep driving it from the store.
    const { id: routeBookingId } = useParams();
    const bookingId = routeBookingId ?? storeBookingId;
    const bookingCode = useData(state => state.bookingCode);
    const setBookingCode = useData(state => state.setBookingCode);
    const status = useData(state => state.status);
    const setStatus = useData(state => state.setStatus);
    const cancelledBy = useData(state => state.cancelledBy);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    // Only set when the FIRST status fetch fails with nothing already on screen —
    // that's the one case this page genuinely cannot render. Later poll failures
    // leave the previous status up and go to the ambient notice instead.
    const [statusError, setStatusError] = useState(null);
    // Bumped by the retry button to restart the poll effect immediately rather
    // than waiting out the 5s tick.
    const [retryTick, setRetryTick] = useState(0);
    const notifyRefreshFailed = useRefreshNotice(state => state.notifyRefreshFailed);
    const clearRefreshNotice = useRefreshNotice(state => state.clearRefreshNotice);
    // Raise the stale notice once per outage, not once per 5s tick — otherwise
    // an offline rider gets a pill whose dismiss timer restarts forever.
    const staleNotifiedRef = useRef(false);
    const [panelState, setPanelState] = useState("");  // "confirm" | "error"
    const [step, setStep] = useState("searching"); // "vehicleType" | "searching"
    const [detialsVisibility, setDetialsVisibility] = useState(false)
    const [msgIndex, setMsgIndex] = useState(0);
    const [illusIndex, setIllusIndex] = useState(0);
    const navigate = useViewNavigate();
    const api = useApi();
    const location = useLocation();
    // Start on the skeleton whenever a status fetch is coming — the fetch effect
    // runs after first paint, so starting false flashes a stale panel.
    //
    // Arriving straight from the booking flow is the exception: VehicleSelect
    // stores the status from the same response it navigates on, so there is
    // nothing stale to guard against and the skeleton only flashes a panel past
    // on the way to the real one. Held in a ref and cleared from history below —
    // the browser keeps history state across a reload, and a reload has no such
    // freshness guarantee.
    const arrivedFresh = useRef(!!location.state?.freshStatus);
    const [bookingLoading, setBookingLoading] = useState(!!bookingId && !arrivedFresh.current);

    useEffect(() => {
        if (arrivedFresh.current) window.history.replaceState({}, "");
    }, []);

    // Copy the URL's id into the store, which is where everything outside this
    // component reads it from — the cancel call in RideDetails, and the navbar's
    // current-trip card. Without this a ride opened by link would poll correctly
    // here and still be uncancellable.
    useEffect(() => {
        if (routeBookingId && routeBookingId !== storeBookingId) setBookingId(routeBookingId);
    }, [routeBookingId, storeBookingId]);
    const isMobile = useIsMobile();
    // { name, phone, vehicleNumber, vehicleModel, photoUrl, latitude, longitude,
    // bearing } from the status endpoint — the whole driver card, plus the coords
    // that drive the map marker. null until the first poll lands, and null for
    // good on a ride nobody has been assigned to.
    //
    // Dev-only seed: the /dev/tracking previews set no bookingId, so nothing polls
    // and every one of them would render a driverless screen. Any preview gets the
    // card's fields; ?driver=1 additionally gives him a position, which is what
    // puts a puck on the map. A real /booking/:id carries no query string, so it
    // still starts null even in dev.
    const devParams = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null;
    const [driver, setDriver] = useState(() => {
        if (!devParams?.get("status") && !devParams?.get("driver")) return null;
        return {
            name: "Ramesh Kumar",
            phone: "+919876543210",
            vehicleNumber: "UP16AB1234",
            vehicleModel: "Maruti Swift Dzire",
            ...(devParams.get("driver") ? { latitude: 28.6042, longitude: 77.2712 } : {}),
        };
    });
    const [navigationEtaMinutes, setNavigationEtaMinutes] = useState(null);
    const [mapApi, setMapApi] = useState(null);

    useEffect(() => {
        if (status === "cancelled" && cancelledBy === "driver") setError("Driver canceled the ride");
    }, [status, cancelledBy]);

    // Fetch live status on mount (skeleton until it resolves), then keep
    // polling while the ride is live so the driver marker moves and status
    // transitions land. No bookingId (demo route) → keep the store status.
    useEffect(() => {
        if (!bookingId) return;
        let cancelled = false;
        let timer = null;

        async function poll(isFirst) {
            if (isFirst && !arrivedFresh.current) setBookingLoading(true);
            // request() only turns HTTP errors into { error } — a network failure
            // rejects, which used to escape this effect entirely.
            let data;
            try {
                data = await api.getBookingStatus(bookingId);
            } catch {
                data = { error: "Couldn't reach the server" };
            }
            if (cancelled) return;
            if (data?.error) {
                // Nothing on screen yet → the page can't render an honest status,
                // so it hands over to FailureState. Otherwise the last known
                // status stays put and is only marked stale.
                if (isFirst && !status) {
                    setStatusError(data.error);
                } else if (!staleNotifiedRef.current) {
                    staleNotifiedRef.current = true;
                    notifyRefreshFailed("Couldn't refresh your ride. Showing the last update we got.");
                }
            } else {
                staleNotifiedRef.current = false;
                setStatusError(null);
                clearRefreshNotice();
                if (data.status) setStatus(data.status);
                setDriver(data.driver ?? null);
                setNavigationEtaMinutes(data.navigationEtaMinutes ?? null);
                // Server-computed, so the cancel warning and the actual charge
                // are always the same number.
                setCancellationCharge(data.cancellationCharge);
            }
            if (isFirst) setBookingLoading(false);
            // The freshness only covers the status we arrived with; if bookingId
            // ever changes while mounted, that fetch gets the skeleton.
            arrivedFresh.current = false;
            // schedule the next tick from the response, not an interval, so a
            // slow request can never stack up overlapping polls
            if (!cancelled && (!data?.status || LIVE_STATUSES.includes(data.status))) {
                timer = setTimeout(() => poll(false), 5000);
            }
        }
        poll(true);

        // clearRefreshNotice on the way out: the stale pill belongs to this
        // ride's poll, and shouldn't follow the rider to another page.
        return () => { cancelled = true; clearTimeout(timer); clearRefreshNotice(); };
    }, [bookingId, retryTick]);

    const pickupPoint = pickupCoords;
    const dropPoint = dropCoords;
    const driverPoint = driver?.latitude != null && driver?.longitude != null
        ? { lat: driver.latitude, lng: driver.longitude }
        : null;

    // No map on the completed/cancelled screens (the ride is over); everything
    // else maps the booked route. The coords are persisted, so this no longer
    // waits on the status fetch — the map is one more thing that can be on
    // screen while the driver fields are still resolving.
    const mapVisible = status !== "completed" && status !== "cancelled"
        && !!pickupPoint && !!dropPoint;

    // Route overlays live on the shared singleton map, so this owns drawing
    // AND clearing them for this page.
    useEffect(() => {
        if (!mapApi || !mapVisible) return;
        showRouteView(mapApi, { pickupPoint, dropPoint, routePolyline });
        return clearRouteView;
    }, [mapApi, mapVisible, isMobile, routePolyline, pickupPoint?.lat, pickupPoint?.lng, dropPoint?.lat, dropPoint?.lng]);

    // Driver puck follows each poll; separate from the route overlays so
    // position updates don't redraw (or get cleared with) the route.
    //
    // NO CLEANUP HERE, and that is the fix rather than an omission. Returning
    // clearDriverMarker ran it before every re-run, so each poll destroyed the
    // marker and built a new one at the new coordinates — which is why the puck
    // teleported, and why it could not be interpolated: a marker created at its
    // destination has nowhere to glide from. Removal is a separate concern with
    // a separate lifetime, below.
    useEffect(() => {
        if (!mapApi || !mapVisible || !driverPoint) return;
        setDriverPosition(mapApi, driverPoint);
    }, [mapApi, mapVisible, driverPoint?.lat, driverPoint?.lng]);

    // Leaving the page takes the puck with it. Empty deps, so this is the only
    // thing that ever removes it.
    useEffect(() => clearDriverMarker, []);

    // Supplied by the server from a traffic-aware Google navigation route. It is
    // deliberately not reconstructed from straight-line distance in the browser.
    const pickupTime = minsLabel(navigationEtaMinutes);
    // Same split as Ride details: the stored fare is the total, so the safer-route
    // add-on is backed out of it rather than added to it.
    const baseFare = fare != null ? fare - (safeRoute ? SAFE_ROUTE_SURCHARGE : 0) : null;

    const dropTime = status === "started" ? minsLabel(navigationEtaMinutes) : minsLabel(durationMin);

    // The time is what a waiting rider actually wants, so the ETA takes the
    // headline and the status/place drops to the line beneath it.
    const liveHeadline = status === "en_route"
        ? { title: <>Arriving in <br />{pickupTime}</>, detail: `Meet at ${pickupLocation?.split(",")[0]}` }
        : status === "reached"
            ? { title: "Arrived", detail: `Waiting at ${pickupLocation?.split(",")[0]}` }
            : status === "assigned"
                ? { title: "Assigned", detail: "Heading your way" }
                // "Reaching in", not "Driver arriving in": on the pickup leg the
                // headline is about the driver reaching you, here it is about
                // reaching the destination — which the detail line below names.
                : { title: <>Reaching in <br />{dropTime}</>, detail: `Driving towards ${dropLocation?.split(",")[0]}` };

    // Mobile: floats over the map just above the sheet, mirroring the Share pill
    // on the opposite edge — same -top-12, same muted fill and shadow, and a
    // matching pill shape: h-9 is the height Button's py-2 gives Share around its
    // text-sm row, and my-1 copies the 4px offset Button adds, so the two line up
    // exactly. -top-12 leaves 8px between the pill and the panel: at -top-14 the
    // pair read as floating loose over the map rather than belonging to it. Must be a direct child of BackgroundPanel: the panel
    // is the positioned ancestor, and anchoring to the content column instead
    // would drift with the content. Desktop is unchanged, a bare glyph fixed to
    // the top-left corner.
    const backArrow = (
        <div onClick={() => navigate('/')} className="max-sm:absolute max-sm:z-20 max-sm:-top-12 max-sm:left-4 max-sm:h-9 max-sm:my-1 max-sm:px-3 max-sm:rounded-full max-sm:border max-sm:border-[var(--foreground)]/30 max-sm:bg-[var(--background-muted)] max-sm:shadow-[0_4px_20px_2px_rgba(0,0,0,0.5)] flex items-center justify-center cursor-pointer sm:opacity-[0.8] transition-opacity duration-300 hover:opacity-[1] text-[var(--text)] sm:fixed sm:left-6 sm:top-6">
            <Icon path={mdiKeyboardBackspace} size={1.2} />
        </div>
    );

    // The completed screen fills the viewport — there is no map above its sheet
    // for an arrow to float over — so it keeps the in-panel placement.
    const backArrowInPanel = (
        <div onClick={() => navigate('/')} className="absolute left-5 top-0 sm:fixed sm:left-6 sm:top-6 flex items-center justify-center cursor-pointer opacity-[0.8] transition-opacity duration-300 hover:opacity-[1] text-[var(--text)]">
            <Icon path={mdiKeyboardBackspace} size={1.2} />
        </div>
    );

    // Only shown once a driver exists — before that there's nobody to dispute
    // a fare with.
    const extraFareNotice = (
        <NoticePill>
            Driver asking extra?{" "}
            <button
                type="button"
                onClick={() => openSupportWhatsApp(`Hi, the driver assigned to my booking${bookingId ? ` (ID: ${bookingId})` : ""} is asking for extra money over the fixed fare of ₹${fare}.`)}
                className="rounded-sm underline underline-offset-2 text-[var(--text)] cursor-pointer transition-opacity duration-300 hover:opacity-70 active:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
                Contact support
            </button>
        </NoticePill>
    );

    // Per-km (formula) pricing covers the drive only; zone and fixed-table
    // destinations are quoted all-in.
    const tollNotice = isDistancePriced(fareSource) && (
        <NoticePill>Tolls payable to driver separately</NoticePill>
    );

    // Puts the call in the OS dialer rather than dialling anything itself, the
    // same way callSupport does. Guarded because the button stays on screen (and
    // disabled) on a ride with nobody to call, so its layout doesn't move.
    const callDriver = () => {
        if (driver?.phone) window.location.href = `tel:${driver.phone}`;
    };

    // "Follow my ride". Asks the server for the link — the same one every time
    // while it is live, so a rider who shares with two people has one thing to
    // revoke — then hands it to the OS share sheet, which is where a person
    // chooses WhatsApp or a contact.
    //
    // navigator.share needs a user gesture and a secure context, and desktop
    // browsers largely do not have it, so the clipboard is the fallback and the
    // pill says so. Both paths are inside the same click, because Safari
    // invalidates the gesture across an await it did not start with — hence the
    // fetch first and the share immediately after, never in a .then chain.
    const [shareBusy, setShareBusy] = useState(false);
    const [shareNote, setShareNote] = useState("");
    const [shareSheetOpen, setShareSheetOpen] = useState(false);
    // Same mount-through-exit treatment as the booking flow's Ride options
    // sheet, so the scrim and panel leave as one surface instead of vanishing.
    const { mounted: shareSheetMounted, closing: shareSheetClosing } = useExitAnim(shareSheetOpen, 420);

    const shareDriverDetails = async () => {
        if (!driver || shareBusy) return;
        setShareBusy(true);
        setShareNote("");
        const details = [
            `Driver: ${driver.name}`,
            driver.phone && `Phone: ${driver.phone}`,
            driver.vehicleModel && `Vehicle: ${driver.vehicleModel}`,
            driver.vehicleNumber && `Registration: ${formatPlate(driver.vehicleNumber)}`,
        ].filter(Boolean).join("\n");
        try {
            if (navigator.share) {
                try {
                    await navigator.share({ title: "My RCS Travels driver", text: details });
                    setShareSheetOpen(false);
                    return;
                } catch (err) {
                    if (err?.name === "AbortError") return;
                }
            }
            await navigator.clipboard.writeText(details);
            setShareNote("Details copied");
            setShareSheetOpen(false);
        } catch {
            setShareNote("Couldn't share details");
        } finally {
            setShareBusy(false);
        }
    };

    const shareTrip = async () => {
        if (shareBusy || !bookingId) return;
        setShareBusy(true);
        setShareNote("");
        try {
            const data = await api.shareBooking(bookingId);
            if (data?.error) {
                setShareNote(data.error);
                return;
            }
            const text = `Follow my RCS Travels ride: ${data.url}`;
            if (navigator.share) {
                // A cancelled share sheet rejects with AbortError. That is the
                // rider changing their mind, not a failure, so it says nothing.
                try {
                    await navigator.share({ title: "My RCS Travels ride", text, url: data.url });
                    setShareSheetOpen(false);
                    return;
                } catch (err) {
                    if (err?.name === "AbortError") return;
                }
            }
            await navigator.clipboard.writeText(data.url);
            setShareNote("Link copied");
            setShareSheetOpen(false);
        } catch {
            setShareNote("Couldn't create a link");
        } finally {
            setShareBusy(false);
        }
    };

    useEffect(() => {
        if (!shareNote) return;
        const t = setTimeout(() => setShareNote(""), 3000);
        return () => clearTimeout(t);
    }, [shareNote]);

    // One driver card for every state that shows one, so its type scale and
    // padding can't drift between the scheduled / live / completed screens.
    //
    // The driver is the one thing here that only the status fetch can supply, so
    // the card keeps its border, fill and size throughout and swaps just the
    // photo and the three text lines for placeholders. Sized to the live lines
    // so nothing reflows when they land.
    //
    // Every field is read through `driver?.` even though the callers only render
    // this once a driver exists: the JSX is built on every render regardless of
    // whether it is used, so a bare `driver.name` here throws on the driverless
    // states rather than being skipped by them.
    //
    // photoUrl is signed and expires in fifteen minutes. The poll mints a fresh
    // one every five seconds, and the key remounts the <img> when it rotates so
    // the browser actually refetches; onError catches the case the poll can't —
    // a completed ride, where polling has stopped and the rider sits on the
    // screen long enough for the URL to die — and falls back to the placeholder,
    // which is also where a captain with no approved photo (null) lands.
    const driverCard = (
        <Button
            className={`w-full ${bookingLoading ? "pointer-events-none" : ""}`}
            prop={{ variant: "input", width: "100%", bg: "var(--background-muted)", innerClassName: "flex justify-between items-center w-full px-4 py-3 gap-3" }}
        >
            {bookingLoading ? (
                <Skeleton rounded="rounded-full" className="w-16 h-16 sm:w-20 sm:h-20 shrink-0" />
            ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden shrink-0">
                    <img
                        key={driver?.photoUrl ?? "placeholder"}
                        src={driver?.photoUrl || pfpPlaceholder}
                        onError={(e) => { e.currentTarget.src = pfpPlaceholder; }}
                        alt={driver?.name ? `${driver.name}, your driver` : ""}
                        className="w-full h-full object-cover"
                    />
                </div>
            )}
            {bookingLoading ? (
                <div className="flex flex-col items-end justify-center gap-1">
                    <Skeleton className="h-[17px] sm:h-[20px] w-24" />
                    <Skeleton className="h-[22px] sm:h-[30px] w-32" />
                    <Skeleton className="h-[17px] sm:h-[20px] w-20" />
                </div>
            ) : (
                <div className="flex flex-col text-right justify-center gap-0.5">
                    <h4 className="text-sm sm:text-base text-[var(--text-muted)] leading-tight">{driver?.name}</h4>
                    <h3 className="text-lg sm:text-2xl font-medium leading-tight">{formatPlate(driver?.vehicleNumber)}</h3>
                    {/* The model is what a rider picks a car out of traffic with,
                        so it leads. Naming a car is required of a captain now, so
                        the class below is a fallback for old data only — a ride
                        booked before the model was snapshotted, or a car added
                        before the name was asked for — and it still says which
                        size of car to look for. */}
                    <h4 className="text-sm sm:text-base text-[var(--text-muted)] leading-tight">{driver?.vehicleModel ?? labelOf(vehicleClass)}</h4>
                </div>
            )}
        </Button>
    );

    // Rendered in two slots on the completed screen — left column on desktop,
    // after the receipt on mobile — so it is defined once here rather than
    // duplicated in both branches. Confirming payment is the only action here;
    // the extra-fare notice below already carries the route to support, so a
    // second support button would compete with the primary one.
    const completedActions = (
        <Button onClick={() => navigate("/")}
            className="w-full"
            prop={{ variant: "", width: "100%", innerClassName: "flex gap-2 items-center justify-center text-base sm:text-lg" }}
        >
            Paid to driver
        </Button>
    );

    // Compact variant for the completed receipt, where the driver sits inside the
    // card rather than beside it: the ride is over, so the plate is a record of who
    // drove rather than something to identify at the kerb. No border of its own —
    // the receipt card already provides one.
    //
    // Plate and model are BOTH snapshotted onto the booking when a driver claims
    // it, so the pair still names one car however many times the captain swaps
    // his since. Naming a car is required of him now, so on any ride taken from
    // here on both halves are there; the class covers the older rows the model
    // never reached, and unlike a live read it cannot become wrong.
    const driverRow = driver && (
        <div className="flex items-center gap-3 w-full">
            <div className="w-10 h-10 rounded-full overflow-hidden shrink-0">
                <img
                    key={driver.photoUrl ?? "placeholder"}
                    src={driver.photoUrl || pfpPlaceholder}
                    onError={(e) => { e.currentTarget.src = pfpPlaceholder; }}
                    alt=""
                    className="w-full h-full object-cover"
                />
            </div>
            <div className="flex flex-col min-w-0 text-left">
                <h4 className="text-base sm:text-lg font-medium leading-tight">{formatPlate(driver.vehicleNumber)}</h4>
                <p className="text-xs sm:text-sm text-[var(--text-muted)] leading-tight truncate">
                    {[driver.name, driver.vehicleModel ?? (vehicleClass ? labelOf(vehicleClass) : null)]
                        .filter(Boolean).join(" · ")}
                </p>
            </div>
        </div>
    );

    // One pill for every "Ride details" affordance on this page, so the live,
    // scheduled and completed screens can't drift apart. Content-sized with a nowrap
    // label; a fixed width wraps it once the type scales up on desktop.
    const rideDetailsPill = (
        <Button
            onClick={() => setDetialsVisibility(true)}
            prop={{ variant: "input", bg: "var(--background-muted)", rounded: "999px" }}
            className="cursor-pointer px-3 shrink-0"
        >
            <p className="text-sm sm:text-base text-[var(--text)] whitespace-nowrap">Ride details</p>
        </Button>
    );

    // "Drop to:" is a fixed label and stays put — only the address can be
    // missing, and only on a cold load before the store has hydrated.
    const dropSummary = (
        <div className="flex w-full justify-between items-center gap-2.5 sm:gap-3">
            <p className="text-left text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed">Drop to: <br />
                {dropLocation
                    ? <span className="text-sm sm:text-lg text-[var(--text)]">{dropLocation.slice(0, 20) + '...'}</span>
                    : <Skeleton className="mt-1 h-[21px] sm:h-[27px] w-28" />}
            </p>
            {rideDetailsPill}
        </div>
    );

    // Both of the states below take the whole page, so they share the shell the
    // main return uses rather than rendering inside the panel chain.
    const SHELL = "relative overflow-hidden bg-transparent text-center flex flex-col justify-center items-center w-[100vw] h-[100dvh]";
    const FULL_PANEL = "py-6 h-[100dvh] rounded-t-none flex justify-center items-center sm:px-[9%] md:px-[5%] xl:px-[13%]";

    // LoginPage's arrow, copied exactly: these two screens fill the viewport with
    // no map behind them, so neither of this page's other arrows fits. `backArrow`
    // is a pill that floats above the sheet over the map, and backArrowInPanel
    // expects the completed screen's inner `relative w-full h-full` wrapper for
    // its offset, which is why it sat flush against the top edge here.
    const stateBackArrow = (
        <div
            onClick={() => navigate('/')}
            className="flex cursor-pointer justify-center items-center gap-2 sm:gap-3 absolute left-3 top-3 text-[var(--text)] sm:opacity-80 hover:opacity-100 transition-opacity duration-300"
        >
            <Icon path={mdiKeyboardBackspace} size={1.2} />
        </div>
    );

    // Nothing to track. Reached by a direct link, a reload after the store was
    // cleared, or a ride that ended. Without this the page fell through to the
    // live panel and showed a placeholder driver, an OTP card and a "Call driver"
    // button to someone with no ride at all. `status` is checked too: the dev
    // preview route drives this page from the store with no bookingId.
    if (!bookingId && !status) {
        return (
            <div className={SHELL}>
                <BackgroundPanel className={FULL_PANEL}>
                    {stateBackArrow}
                    <EmptyState
                        tone="dark"
                        title="No ride to track"
                        message="Once you book, this is where you'll watch your driver arrive and follow the trip."
                        action={{ label: "Book a ride", onClick: () => navigate('/') }}
                    />
                </BackgroundPanel>
            </div>
        );
    }

    // First status fetch failed with nothing to fall back on. The poll is still
    // running underneath, so this clears itself if the connection returns; the
    // button just skips the wait.
    if (statusError) {
        return (
            <div className={SHELL}>
                <BackgroundPanel className={FULL_PANEL}>
                    {stateBackArrow}
                    <FailureState
                        tone="dark"
                        title="Couldn't load your ride"
                        detail={statusError}
                        onRetry={() => { setStatusError(null); setRetryTick(t => t + 1); }}
                        retrying={bookingLoading}
                        secondaryAction={{
                            label: "Message support",
                            onClick: () => openSupportWhatsApp(
                                `Hi, I can't open my ride's tracking page${bookingId ? ` (ID: ${bookingId})` : ""}.`
                            ),
                        }}
                    />
                </BackgroundPanel>
            </div>
        );
    }

    // overflow-hidden clips the panels while they sit off-screen at
    // translateX(100%) — without it a viewport-wide panel parked to the right
    // would double the page width and let the whole screen scroll sideways.
    return (
        <div className={SHELL}>
            <ErrorPanel prop={{ error: error, setError: setError }} />

            {/* Mobile: land-coloured backdrop + persistent page-background map,
                with the opaque bottom-sheet panels riding over it. */}
            {isMobile && mapVisible && (
                <>
                    <div className="absolute inset-0 z-0" style={{ background: MAP_LAND_COLOR }} />
                    <GoogleMap center={pickupPoint} zoom={12} onMapReady={setMapApi} className="absolute inset-0 z-0" />
                </>
            )}

            {/* No whole-page skeleton: the panel chrome, the actions and every
                value the store already holds render immediately, and only the
                fields still waiting on the status fetch shimmer in place. With
                no status at all this falls through to the live panel, which is
                the shell those per-field skeletons hang on. */}
            {(scheduledTime ?? activeBooking?.scheduledAt) != null && (status === "confirmed" || status === "assigned")
                    // contentKey: this panel drops the driver card before a driver
                    // exists, so its height changes with the status — and the sheet
                    // is sized to that height. bookingLoading is in the key for the
                    // same reason: the card is skeleton-then-real, and a booking
                    // that loads without a driver loses it entirely.
                    ? <BackgroundPanel
                        sheet={mapVisible}
                        initialSnap="half"
                        duration={420}
                        contentKey={`${status}-${bookingLoading}`}
                        className={"py-6 max-sm:pb-0 sm:overflow-hidden justify-center items-center text-left sm:px-[9%] md:px-[5%] xl:px-[13%] flex flex-col sm:flex-row sm:justify-center lg:justify-between"}
                    >
                        {backArrow}
                        {/* Scheduled ride: zoomed-out full route, no driver yet */}
                        {!isMobile && mapVisible && (
                            <GoogleMap center={pickupPoint} zoom={12} onMapReady={setMapApi} className={MAP_CLASSES} />
                        )}
                        {/* Bounds the column to the sheet's height on phones so the
                            scroll region inside it has something to be flex-1 of;
                            sm:contents removes it from layout entirely from sm up,
                            leaving the desktop side panel exactly as it was. */}
                        <div className="w-full flex-1 min-h-0 flex flex-col items-center sm:contents">
                        {/* no pt-6: that reserved room for the arrow when it sat
                            inside the column, and it now floats above the sheet */}
                        {/* gap-4 on phones rather than STACK's gap-6: the heading
                            block is the only thing a collapsed sheet shows, and 24px
                            under it pushed the driver card off the half stop. */}
                        <div className={`relative z-10 sm:order-1 flex flex-col justify-end sm:justify-center items-center sm:items-start w-full sm:w-auto flex-1 min-h-0 sm:flex-initial sm:h-full gap-4 sm:gap-8`}>
                            <div className={`flex flex-col justify-center items-center sm:items-start ${PAIR} ${COL}`}>
                                <h2 className={`text-center sm:text-left w-full ${TITLE}`}>{status === "assigned" ? "Driver has been assigned" : "Driver has not been assigned"}</h2>
                                <h3 className={`text-center sm:text-left w-full ${SUBTITLE}`}>{status === "assigned" ? "Give the driver a call to confirm" : "Assigned closer to your pickup time"}</h3>
                            </div>

                            {/* The scroll region, phones only: everything below the
                                heading. The heading itself stays put — it is the
                                whole of the collapsed sheet, and it says what the
                                screen is. sm:contents drops this on desktop, where
                                the side panel is short enough not to scroll. */}
                            <div
                                data-sheet-scroll
                                className="w-full min-h-0 flex-1 flex flex-col items-center gap-6 overscroll-contain sm:contents"
                            >
                            <div className={`flex flex-col justify-center items-start gap-3 ${COL}`}>
                                {/* bookingLoading, not just driver: the store can
                                    already say "assigned" while the fetch that
                                    carries the driver is still in flight, and the
                                    card's own skeleton is what covers that gap. */}
                                {status === "assigned" && (bookingLoading || driver) && driverCard}

                                {/* Same row as the live screen: where you're going,
                                    with the details behind the pill. Route, fare
                                    and distance live in that panel — the ride
                                    hasn't started, so none of it is time-critical
                                    enough to sit on the surface. */}
                                {dropSummary}

                                {(tollNotice || driver) && (
                                    <div className="w-full flex flex-col gap-2">
                                        {tollNotice}
                                        {driver && extraFareNotice}
                                    </div>
                                )}
                            </div>

                            {/* max-sm:pb-6 on the last child, not on the scroller:
                                padding on the scroll box shortens the scroll instead
                                of padding it, which clipped the last button. */}
                            <div className={`flex flex-col justify-center gap-2 items-center max-sm:pb-6 ${COL}`}>
                                <Button
                                    onClick={() => openSupportWhatsApp("Hi, I need help with my ride.")}
                                    prop={{ variant: "input", width: "100%", bg: "var(--background-muted)" }}
                                >
                                    <span className="flex items-center justify-center gap-2 text-base sm:text-lg">
                                        <img src={waLogo} alt="WhatsApp" className="w-6 h-6" />
                                        Talk to Support
                                    </span>
                                </Button>
                                {/* Shown for the whole of `assigned` and merely
                                    disabled until the phone number lands, so the
                                    column doesn't reflow under the rider's thumb
                                    the moment a poll returns. */}
                                <Button
                                    onClick={callDriver}
                                    className={`${status === 'assigned' ? "block" : "hidden"} w-full`}
                                    prop={{ variant: "", width: "100%", disabled: !driver?.phone, innerClassName: "flex gap-2 items-center justify-center text-base sm:text-lg" }}
                                >
                                    <Icon path={mdiPhone} size={0.8} />
                                    Call driver
                                </Button>
                            </div>
                            </div>
                        </div>
                        </div>
                    </BackgroundPanel>
                    : status === "completed"
                        ?
                        <BackgroundPanel className={"py-6 h-[100dvh] rounded-t-none flex justify-center items-center sm:px-[9%] md:px-[5%] xl:px-[13%]"}>
                            {/* Desktop: one wide card split down the middle —
                               outcome on the left, receipt and actions on the
                               right. Mobile drops the card and stacks the two
                               halves in reading order. */}
                            <div className="relative w-full h-full flex justify-center items-center">
                                {backArrowInPanel}
                                <div className={`w-full flex flex-col items-center ${STACK} sm:w-[820px] sm:flex-row sm:items-stretch sm:gap-0`}>
                                <div className="flex flex-col justify-center items-center sm:items-start gap-3 max-sm:w-[min(86vw,100%)] sm:w-1/2 sm:px-8 sm:py-10">
                                    {/* -mb-2 pulls the outcome copy up under the
                                        badge: the container gap alone left more
                                        air here than between any other pair in
                                        the column. */}
                                    { panelState === "noDriver"
                                        ? <ErrorMark className="-mt-2 -mb-2" size={isMobile ? 120 : 140} />
                                        : <SuccessCheck className="-mt-2 -mb-2" size={isMobile ? 120 : 140} /> }
                                    <div className="flex flex-col items-center sm:items-start gap-1">
                                        <h3 className={SUBTITLE}>Ride has been completed</h3>
                                        <h2 className={`text-center sm:text-left ${TITLE}`}>₹{fare}</h2>
                                    </div>
                                    {tollNotice}
                                    {/* Desktop keeps the actions with the outcome
                                        they settle; mobile has no left column, so
                                        the copy below renders them after the
                                        receipt instead. */}
                                    <div className="hidden sm:flex w-full flex-col gap-2 mt-2">{completedActions}</div>
                                </div>

                                <div className="flex flex-col justify-center items-start gap-3 max-sm:w-[min(86vw,100%)] sm:w-1/2 sm:px-8 sm:py-10 sm:border-l sm:border-[var(--foreground)]/10">
                                    {/* One receipt card: what it cost, broken down
                                        the same way Ride details breaks it down,
                                        and who drove. No route — the ride is over,
                                        and the addresses are still a tap away. */}
                                    <div className="w-full rounded-xl border border-[var(--foreground)]/30 bg-[var(--background-muted)] px-4 py-4 text-left flex flex-col gap-2">
                                        {distanceKm != null && (
                                            <div className="flex items-center justify-between w-full">
                                                <h3 className={`${META} text-[var(--text-muted)]`}>Distance</h3>
                                                <h3 className={META}>{Math.round(distanceKm * 10) / 10} km</h3>
                                            </div>
                                        )}
                                        {durationMin != null && (
                                            <div className="flex items-center justify-between w-full">
                                                <h3 className={`${META} text-[var(--text-muted)]`}>Ride time</h3>
                                                <h3 className={META}>{durationMin} min</h3>
                                            </div>
                                        )}

                                        <div className="w-full h-px bg-[var(--foreground)]/10 my-1" />

                                        <div className="flex items-center justify-between w-full">
                                            <h3 className={`${META} text-[var(--text-muted)]`}>Base fare</h3>
                                            <h3 className={META}>₹{baseFare}</h3>
                                        </div>
                                        {safeRoute && (
                                            <div className="flex items-center justify-between w-full">
                                                <h3 className={`${META} text-[var(--text-muted)]`}>Safer route</h3>
                                                <h3 className={META}>₹{SAFE_ROUTE_SURCHARGE}</h3>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between w-full">
                                            <h3 className={`${META} font-semibold`}>Total</h3>
                                            <h3 className={`${META} font-semibold`}>₹{fare}</h3>
                                        </div>

                                        {/* Rule and row together: with no driver
                                            on the booking the rule would be a
                                            divider under the last line, dividing
                                            the total from nothing. */}
                                        {driverRow && (
                                            <>
                                                <div className="w-full h-px bg-[var(--foreground)]/10 my-1" />
                                                {driverRow}
                                            </>
                                        )}
                                    </div>

                                    {/* flex-wrap, not a plain row: the notice pill
                                        is whitespace-nowrap, so at 290px the two
                                        drop onto separate lines rather than
                                        overflowing the column. */}
                                    <div className="w-full flex flex-wrap items-center gap-2">
                                        {rideDetailsPill}
                                        {driver && extraFareNotice}
                                    </div>

                                    <div className="flex sm:hidden w-full flex-col gap-2 mt-2">{completedActions}</div>
                                </div>
                                </div>
                            </div>
                        </BackgroundPanel>

                        : <BackgroundPanel
                            sheet={mapVisible}
                            initialSnap="half"
                            duration={420}
                            // The OTP row appears at en_route and the headline
                            // grows a line with it, so the sheet's own height moves
                            // with the status.
                            contentKey={`${status}-${bookingLoading}`}
                            className={"py-6 max-sm:pb-0 sm:overflow-hidden justify-center items-center flex flex-col sm:flex-row sm:justify-center lg:justify-between text-left sm:px-[9%] md:px-[5%] xl:px-[13%]"}
                        >
                            {/* Live ride: route + the driver's current position */}
                            {!isMobile && mapVisible && (
                                <GoogleMap center={pickupPoint} zoom={12} onMapReady={setMapApi} className={MAP_CLASSES} />
                            )}
                            {/* Floats over the map, a fixed gap above the sheet's
                                top edge. Anchored to the panel, not the content
                                column — the column is vertically centred on
                                mobile, so its top moves with the content. */}
                            {backArrow}
                            <Button
                                onClick={() => setShareSheetOpen(true)}
                                prop={{ variant: "input", bg: "var(--background-muted)", rounded: "999px", disabled: shareBusy || !bookingId }}
                                className='absolute z-20 -top-12 right-4 px-3 sm:hidden block shadow-[0_4px_20px_2px_rgba(0,0,0,0.5)]'
                            >
                                <div className="flex gap-1.5 items-center justify-center">
                                    <Icon path={mdiShareVariant} size={0.7} />
                                    {/* The pill carries its own result — "Link
                                        copied" where there is no OS share sheet.
                                        whitespace-nowrap so the wider label grows
                                        the pill instead of wrapping inside it. */}
                                    <h4 className="text-sm whitespace-nowrap">{shareNote || "Share"}</h4>
                                </div>
                            </Button>
                            {/* Bounds the column to the sheet's height on phones so
                                the scroll region inside it has something to be
                                flex-1 of; sm:contents removes it from layout from
                                sm up, leaving the desktop side panel untouched. */}
                            <div className="w-full flex-1 min-h-0 flex flex-col items-center sm:contents">
                            {/* gap-4 on phones rather than STACK's gap-6: the ETA
                                headline is the whole of the collapsed sheet, and
                                24px under it cost the OTP row its place at half. */}
                            <div className={`relative z-10 sm:order-1 flex flex-col justify-end sm:justify-center items-center sm:items-start w-full sm:w-auto flex-1 min-h-0 sm:flex-initial sm:h-auto gap-4 sm:gap-8`}>
                                <div className={`flex flex-col justify-center items-center sm:items-start ${PAIR} ${COL}`}>
                                    {/* The headline reads off status and the driver's
                                        ETA, so it is the one block here that can't be
                                        drawn from the store alone. Two bars for TITLE's
                                        two lines, one for SUBTITLE. */}
                                    {bookingLoading ? (
                                        <>
                                            <Skeleton className="h-[30px] sm:h-[48px] w-[75%]" />
                                            <Skeleton className="h-[30px] sm:h-[48px] w-[45%]" />
                                            <Skeleton className="mt-2 h-[22px] sm:h-[30px] w-[65%]" />
                                        </>
                                    ) : (
                                        <>
                                            <h2 className={`text-center sm:text-left w-full ${TITLE}`}>{liveHeadline.title}</h2>
                                            <h3 className={`text-center sm:text-left w-full ${SUBTITLE}`}>{liveHeadline.detail}</h3>
                                        </>
                                    )}
                                    <Button
                                        onClick={() => setShareSheetOpen(true)}
                                        prop={{ variant: "input", bg: "var(--background-muted)", rounded: "999px", disabled: shareBusy || !bookingId }}
                                        className="mt-2 px-3 hidden sm:block"
                                    >
                                        <div className="flex gap-1.5 items-center justify-center">
                                            <Icon path={mdiShareVariant} className="text-[var(--text-muted)]" size={0.6} />
                                            <p className="text-sm sm:text-base whitespace-nowrap">{shareNote || "Share"}</p>
                                        </div>
                                    </Button>
                                </div>

                                {/* The scroll region, phones only: everything under
                                    the headline. The headline stays put — it is the
                                    ETA, the one thing worth reading at a glance, and
                                    the whole of the collapsed sheet. sm:contents
                                    drops this on desktop, which doesn't scroll.

                                    max-sm:pb-6 on the child, not here: padding on a
                                    scroll box shortens the scroll instead of padding
                                    it, which clipped the call buttons. */}
                                <div
                                    data-sheet-scroll
                                    className="w-full min-h-0 flex-1 flex flex-col items-center overscroll-contain sm:contents"
                                >
                                <div className={`flex flex-col justify-center items-start gap-3 max-sm:pb-6 ${COL}`}>
                                    {/* OTP leads once there is one: from en_route on
                                        it is the thing the rider has to act on, and
                                        it reads out before the plate is checked.
                                        Before that (assigned) the driver card leads
                                        instead.

                                        No card around the pair — the digits carry
                                        their own boxes, one each, which is how a
                                        code meant to be read aloud a character at a
                                        time wants to be set. The label sits bare on
                                        the sheet beside them. */}
                                    {(status === "en_route" || status === "reached") && (
                                        // max-sm:mt-2 only: on phones this row is the
                                        // first thing under the ETA headline and the
                                        // container's gap-4 alone read as cramped.
                                        // From sm up the column is gap-8 already.
                                        <div className="flex items-center justify-between w-full gap-2.5 sm:gap-3 max-sm:mt-2 text-left">
                                            <h3 className={`${META} text-[var(--text-muted)]`}>OTP</h3>
                                            {/* Boxed even while empty: the row is the
                                                same shape loaded or not, so nothing
                                                shifts under the rider's thumb when the
                                                code lands. */}
                                            <div className="flex gap-2">
                                                {(bookingCode ? String(bookingCode).split("") : [null, null, null, null]).map((digit, i) => (
                                                    <div
                                                        key={i}
                                                        className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-lg border border-[var(--foreground)]/30 bg-[var(--background-muted)] flex items-center justify-center"
                                                    >
                                                        {digit
                                                            ? <span className="text-base sm:text-xl font-semibold leading-none">{digit}</span>
                                                            : <Skeleton className="h-[16px] sm:h-[20px] w-3 sm:w-3.5" />}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* This branch is the fallthrough for every
                                        status the two above don't claim, which
                                        includes the driverless ones — pending, and
                                        a search that ended in no_driver. Showing
                                        the card there put a driver who does not
                                        exist, with a plate to match a car against,
                                        in front of a rider who has nobody coming. */}
                                    {(bookingLoading || driver) && driverCard}

                                    {/* where you're going sits straight on the sheet */}
                                    {dropSummary}

                                    {/* extra top margin: with the drop row now on
                                        the bare sheet, the container gap alone
                                        let the notices crowd it */}
                                    {(tollNotice || driver) && (
                                        <div className="w-full flex flex-col gap-2 mt-4">
                                            {tollNotice}
                                            {driver && extraFareNotice}
                                        </div>
                                    )}

                                    <div className="flex justify-between w-full gap-2 items-center mt-1">
                                        <Button
                                            onClick={() => openSupportWhatsApp("Hi, I need help with my ride.")}
                                            prop={{ variant: "input", width: "100%", bg: "var(--background-muted)" }}
                                            className="flex-1"
                                        >
                                            <span className="flex items-center justify-center gap-2 text-base sm:text-lg">
                                                <img src={waLogo} alt="WhatsApp" className="w-6 h-6" />
                                                Message
                                            </span>
                                        </Button>
                                        <Button
                                            onClick={callDriver}
                                            className="flex-1"
                                            prop={{ variant: "", width: "100%", disabled: !driver?.phone, innerClassName: "flex gap-2 items-center justify-center text-base sm:text-lg" }}
                                        >
                                            <Icon path={mdiPhone} size={0.8} />
                                            Call driver
                                        </Button>
                                    </div>
                                </div>
                                </div>

                            </div>
                            </div>
                        </BackgroundPanel>
            }
            {/* ride details */}
            <BackgroundPanel show={detialsVisibility === true} className={`z-3 sm:z-2 py-6 sm:overflow-hidden text-left flex flex-col sm:flex-row justify-center items-center sm:justify-center lg:justify-between sm:px-[9%] md:px-[5%] xl:px-[13%]`}>
                {!isMobile && detialsVisibility && pickupPoint && dropPoint && (
                    <GoogleMap center={pickupPoint} zoom={12} onMapReady={setMapApi} className={MAP_CLASSES} />
                )}
                <RideDetails prop={{bookingId, setLoading, setError, setDetialsVisibility }} />
            </BackgroundPanel>
            {shareSheetMounted && (
                <>
                    <div
                        onClick={() => setShareSheetOpen(false)}
                        className={`absolute inset-0 z-40 bg-black/50 backdrop-blur-[2px] ${shareSheetClosing ? "animate-panel-fade-out" : "animate-backdrop"} motion-reduce:animate-none`}
                    />
                    <BackgroundPanel
                        sheet
                        dismissible
                        onDismiss={() => setShareSheetOpen(false)}
                        initialSnap="expanded"
                        show={shareSheetOpen}
                        duration={420}
                        contentKey={`${!!driver}-${shareBusy}`}
                        className="z-50 sm:!h-auto sm:!rounded-t-4xl flex flex-col gap-4 px-[7vw] sm:px-8 pt-1 sm:pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-8 text-left"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex flex-col gap-0.5">
                                <h3 className="text-lg sm:text-xl font-medium leading-tight text-[var(--text)]">Share ride</h3>
                                <p className="text-sm sm:text-base leading-snug text-[var(--text-muted)]">Choose what you want to send.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShareSheetOpen(false)}
                                aria-label="Close share options"
                                className="shrink-0 cursor-pointer rounded-full p-1 opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]/70"
                            >
                                <Icon path={mdiClose} size={0.9} aria-hidden="true" />
                            </button>
                        </div>
                        <div className="flex flex-col divide-y divide-[var(--foreground)]/10">
                            <button
                                type="button"
                                onClick={shareDriverDetails}
                                disabled={shareBusy || !driver}
                                className="group flex w-full items-center gap-4 rounded-lg py-3.5 text-left outline-none transition-opacity duration-300 cursor-pointer active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]/70 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                                <Icon path={mdiAccountOutline} size={1} className="shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
                                <span className="flex flex-col">
                                    <span className="text-base sm:text-lg font-medium text-[var(--text)]">Share driver details</span>
                                    <span className="text-sm text-[var(--text-muted)]">Name, phone number and vehicle details</span>
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={shareTrip}
                                disabled={shareBusy || !bookingId}
                                className="group flex w-full items-center gap-4 rounded-lg py-3.5 text-left outline-none transition-opacity duration-300 cursor-pointer active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]/70 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                                <Icon path={mdiMapMarkerRadius} size={1} className="shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
                                <span className="flex flex-col">
                                    <span className="text-base sm:text-lg font-medium text-[var(--text)]">Share live location</span>
                                    <span className="text-sm text-[var(--text-muted)]">Send a link to follow this ride</span>
                                </span>
                            </button>
                        </div>
                    </BackgroundPanel>
                </>
            )}
        </div>
    )
}

export default TrackingPage

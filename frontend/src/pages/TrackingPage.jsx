import Button from "../components/ui/Button";
import GoogleMap, { MAP_LAND_COLOR } from "../components/ui/GoogleMap";
import { MAP_CLASSES, showRouteView, clearRouteView, setDriverPosition, clearDriverMarker } from "../components/ui/mapOverlays";
import { useIsMobile } from "../hooks/useIsMobile";
import { useData } from "../hooks/useData";
import { useApi } from "../hooks/useApi";
import { useState, useEffect } from "react";
import ErrorMark from "../components/illustrations/ErrorMark";
import SuccessCheck from "../components/illustrations/SuccessCheck";
import { useViewNavigate } from "../hooks/useViewNavigate";
import PriceIllustration from "../components/illustrations/RadarScanIllustration";
import SafetyIllustration from "../components/illustrations/DriverEnRouteIllustration";
import WhatsAppIllustration from "../components/illustrations/WhatsAppIllustration";
import Icon from '@mdi/react';
import { mdiKeyboardBackspace, mdiPhone, mdiShareVariant } from '@mdi/js';
import waLogo from '../assets/whatsapp-logo.webp';
import { openSupportWhatsApp } from "../constants/support";
import ErrorPanel from "../components/ui/ErrorPanel";
import BackgroundPanel from "../components/ui/BackgroundPanel";
import NoticePill from "../components/ui/NoticePill";
import pfpPlaceholder from "../assets/pfp-placeholder.webp"
import RideDetails from "../components/RideDetails";
import TrackingSkeleton from "../components/TrackingSkeleton";
import RoutePanel from "../components/ui/RoutePanel";

// Statuses where a driver exists and may be moving — the only ones that poll.
const LIVE_STATUSES = ["assigned", "en_route", "reached", "started"];

// ETAs are derived from the driver's last known position rather than a Routes
// call: at one request per 5-second poll that would be both expensive and
// pointless, since the answer changes by seconds. Straight-line distance over a
// city average is honest enough for "how far away is my cab" and costs nothing.
// Swap in a real duration if the driver app ever reports one.
const AVG_SPEED_KMH = 25;

function haversineKm(from, to) {
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(to.lat - from.lat);
    const dLng = toRad(to.lng - from.lng);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(a));
}

// null whenever either end is unknown, so callers render a dash instead of a
// confident lie. Never rounds below 1 — "0 mins away" reads as broken.
const etaMinutes = (from, to) =>
    from && to ? Math.max(1, Math.round((haversineKm(from, to) / AVG_SPEED_KMH) * 60)) : null;

const minsLabel = (n) => (n == null ? "—" : `${n} min${n === 1 ? "" : "s"}`);

// ---- Shared layout + type scale -------------------------------------------
// The desktop content column is 377px — OnBoarding's effective control width
// (290px base × its 1.3 scale) — reached with a real width instead of a
// transform, so spacing and type sizes stay honest at both breakpoints.
const COL = "w-[290px] sm:w-[377px]";
const TITLE = "font-bold text-3xl sm:text-5xl leading-tight";
const SUBTITLE = "text-lg sm:text-2xl font-normal leading-snug text-[var(--text-muted)]";
const SECTION = "font-bold text-2xl sm:text-3xl leading-tight";
const META = "text-base sm:text-xl";
// Vertical rhythm: 8px inside a pair, 12–16px within a group, 32/48 between.
const STACK = "gap-6 sm:gap-8";
const GROUP = "gap-2 sm:gap-3";
const PAIR = "gap-0.5 sm:gap-1";

const TrackingPage = () => {
    const phone = useData(state => state.phone)
    const scheduledTime = useData(state => state.scheduledTime)
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
    const vehicleType = useData(state => state.vehicleType);
    const setvehicleType = useData(state => state.setvehicleType);
    const sharing = useData(state => state.sharing);
    const setSharing = useData(state => state.setSharing);
    const bookingId = useData(state => state.bookingId);
    const setBookingId = useData(state => state.setBookingId);
    const bookingCode = useData(state => state.bookingCode);
    const setBookingCode = useData(state => state.setBookingCode);
    const status = useData(state => state.status);
    const setStatus = useData(state => state.setStatus);
    const cancelledBy = useData(state => state.cancelledBy);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [panelState, setPanelState] = useState("");  // "confirm" | "error"
    const [step, setStep] = useState("searching"); // "vehicleType" | "searching"
    const [detialsVisibility, setDetialsVisibility] = useState(false)
    const [msgIndex, setMsgIndex] = useState(0);
    const [illusIndex, setIllusIndex] = useState(0);
    const navigate = useViewNavigate();
    const api = useApi();
    // Start on the skeleton whenever a status fetch is coming — the fetch
    // effect runs after first paint, so starting false flashes a stale panel.
    const [bookingLoading, setBookingLoading] = useState(!!bookingId);
    const isMobile = useIsMobile();
    // { name, phone, vehicleNumber, latitude, longitude, bearing } from the
    // status endpoint; its coords drive the driver marker. Dev-only:
    // /dev/tracking?driver=1 seeds a mock puck (no backend, no driver app).
    const devParams = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null;
    const [driver, setDriver] = useState(() => devParams?.get("driver")
        ? { name: "Dev Driver", latitude: 28.6042, longitude: 77.2712 }
        : null);
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
            if (isFirst) setBookingLoading(true);
            const data = await api.getBookingStatus(bookingId);
            if (cancelled) return;
            if (!data?.error) {
                if (data.status) setStatus(data.status);
                setDriver(data.driver ?? null);
                // Server-computed, so the cancel warning and the actual charge
                // are always the same number.
                setCancellationCharge(data.cancellationCharge);
            }
            if (isFirst) setBookingLoading(false);
            // schedule the next tick from the response, not an interval, so a
            // slow request can never stack up overlapping polls
            if (!cancelled && (!data?.status || LIVE_STATUSES.includes(data.status))) {
                timer = setTimeout(() => poll(false), 5000);
            }
        }
        poll(true);

        return () => { cancelled = true; clearTimeout(timer); };
    }, [bookingId]);

    const pickupPoint = pickupCoords;
    const dropPoint = dropCoords;
    const driverPoint = driver?.latitude != null && driver?.longitude != null
        ? { lat: driver.latitude, lng: driver.longitude }
        : null;

    // No map on the completed/cancelled screens (the ride is over) or while
    // the skeleton shows; everything else maps the booked route.
    const mapVisible = !bookingLoading && status !== "completed" && status !== "cancelled"
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
    useEffect(() => {
        if (!mapApi || !mapVisible || !driverPoint) return;
        setDriverPosition(mapApi, driverPoint);
        return clearDriverMarker;
    }, [mapApi, mapVisible, driverPoint?.lat, driverPoint?.lng]);

    // Driver -> pickup while they're coming to you; driver -> drop once the ride
    // is underway, so the number counts down instead of restating the trip length.
    // Before a driver exists, fall back to the booked route's duration.
    const pickupTime = minsLabel(etaMinutes(driverPoint, pickupPoint));
    const dropTime = status === "started"
        ? minsLabel(etaMinutes(driverPoint, dropPoint) ?? durationMin)
        : minsLabel(durationMin);

    // The time is what a waiting rider actually wants, so the ETA takes the
    // headline and the status/place drops to the line beneath it.
    const liveHeadline = status === "en_route"
        ? { title: <>Driver arriving in <br />{pickupTime}</>, detail: `Meet at ${pickupLocation?.split(",")[0]}` }
        : status === "reached"
            ? { title: "Driver has arrived", detail: `Waiting at ${pickupLocation?.split(",")[0]}` }
            : status === "assigned"
                ? { title: "Driver has been assigned", detail: "Heading your way" }
                : { title: <>Arriving in <br />{dropTime}</>, detail: `Driving towards ${dropLocation?.split(",")[0]}` };

    const backArrow = (
        <div onClick={() => navigate('/')} className="flex gap-2 sm:gap-2 items-center justify-center cursor-pointer opacity-[0.8] transition-opacity duration-300 hover:opacity-[1] absolute left-5 top-0 sm:fixed sm:left-6 sm:top-6 text-[var(--text)]">
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
    const tollNotice = fareSource === "formula" && (
        <NoticePill>Tolls payable to driver separately</NoticePill>
    );

    // One driver card for every state that shows one, so its type scale and
    // padding can't drift between the scheduled / live / completed screens.
    const driverCard = (
        <Button
            className="w-full"
            prop={{ variant: "input", width: "100%", bg: "var(--background-muted)", innerClassName: "flex justify-between items-center w-full px-4 py-3 gap-3" }}
        >
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden shrink-0">
                <img src={pfpPlaceholder} alt="placeholder" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col text-right justify-center gap-0.5">
                <h4 className="text-sm sm:text-base text-[var(--text-muted)] leading-tight">Driver name</h4>
                <h3 className="text-lg sm:text-2xl font-medium leading-tight">UP 16 AB 1234</h3>
                <h4 className="text-sm sm:text-base text-[var(--text-muted)] leading-tight">Car name</h4>
            </div>
        </Button>
    );

    const dropSummary = (
        <div className="flex w-full justify-between items-center gap-2.5 sm:gap-3">
            <p className="text-left text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed">Drop to: <br /> <span className="text-sm sm:text-lg text-[var(--text)]">{dropLocation?.slice(0, 20) + '...'}</span></p>
            <Button onClick={() => setDetialsVisibility(true)} prop={{ variant: "input", width: "110px", bg: "var(--background-muted)" }} className="cursor-pointer" >
                <p className="text-sm sm:text-base text-[var(--text)]">Ride details </p>
            </Button>
        </div>
    );

    return (
        <div className="relative bg-transparent text-center flex flex-col justify-center items-center w-[100vw] h-[100vh]">
            <ErrorPanel prop={{ error: error, setError: setError }} />

            {/* Mobile: land-coloured backdrop + persistent page-background map,
                with the opaque bottom-sheet panels riding over it. */}
            {isMobile && mapVisible && (
                <>
                    <div className="absolute inset-0 z-0" style={{ background: MAP_LAND_COLOR }} />
                    <GoogleMap center={pickupPoint} zoom={12} onMapReady={setMapApi} className="absolute inset-0 z-0" />
                </>
            )}

            {bookingLoading
                ? <TrackingSkeleton />
                : scheduledTime !== null && (status === "confirmed" || status === "assigned")
                    ? <BackgroundPanel className={"py-6 sm:overflow-hidden justify-center items-center text-left sm:px-[9%] md:px-[5%] xl:px-[13%] flex flex-col sm:flex-row sm:justify-center lg:justify-between"}>
                        {/* Scheduled ride: zoomed-out full route, no driver yet */}
                        {!isMobile && mapVisible && (
                            <GoogleMap center={pickupPoint} zoom={12} onMapReady={setMapApi} className={MAP_CLASSES} />
                        )}
                        <div className={`relative z-10 sm:order-1 flex flex-col justify-center items-center sm:items-start pt-6 w-full sm:w-auto sm:h-full ${STACK}`}>
                            {backArrow}
                            <div className={`flex flex-col justify-center items-center sm:items-start ${PAIR} ${COL}`}>
                                <h2 className={`text-center sm:text-left w-full ${TITLE}`}>{status === "assigned" ? "Driver has been assigned" : "Driver has not been assigned"}</h2>
                                <h3 className={`text-center sm:text-left w-full ${SUBTITLE}`}>{status === "assigned" ? "Give the driver a call to confirm" : "Assigned closer to your pickup time"}</h3>
                            </div>

                            <div className={`flex flex-col justify-center items-start gap-3 ${COL}`}>
                                <h2 className={SECTION}>Ride Details</h2>
                                {/* route and money in one card — RoutePanel's
                                    children slot puts them under a hairline */}
                                <RoutePanel size="sm" pickup={pickupLocation} drop={dropLocation}>
                                    <div className="flex items-center justify-between w-full">
                                        <h3 className={`${META} text-[var(--text-muted)]`}>Fare</h3>
                                        <h3 className={`${META} font-semibold`}>₹{fare}</h3>
                                    </div>
                                    <div className="flex items-center justify-between w-full">
                                        <h3 className={`${META} text-[var(--text-muted)]`}>Distance</h3>
                                        <h3 className={META}>{distanceKm != null ? `${Math.round(distanceKm * 10) / 10} km` : "—"}</h3>
                                    </div>
                                </RoutePanel>

                                {(tollNotice || status === "assigned") && (
                                    <div className="w-full flex flex-col gap-2">
                                        {status === "assigned" && driverCard}
                                        {tollNotice}
                                        {status === "assigned" && extraFareNotice}
                                    </div>
                                )}
                            </div>

                            <div className={`flex flex-col justify-center gap-2 items-center ${COL}`}>
                                <Button
                                    onClick={() => openSupportWhatsApp("Hi, I need help with my ride.")}
                                    prop={{ variant: "input", width: "100%", bg: "var(--background-muted)" }}
                                >
                                    <span className="flex items-center justify-center gap-2 text-base sm:text-lg">
                                        <img src={waLogo} alt="WhatsApp" className="w-6 h-6" />
                                        Talk to Support
                                    </span>
                                </Button>
                                <Button
                                    className={`${status === 'assigned' ? "block" : "hidden"} w-full`}
                                    prop={{ variant: "", width: "100%", innerClassName: "flex gap-2 items-center justify-center text-base sm:text-lg" }}
                                >
                                    <Icon path={mdiPhone} size={0.8} />
                                    Call driver
                                </Button>
                            </div>
                        </div>
                    </BackgroundPanel>
                    : status === "completed"
                        ?
                        <BackgroundPanel className={"py-6 h-[100vh] rounded-t-none flex justify-center items-center sm:px-[9%] md:px-[5%] xl:px-[13%]"}>
                            {/* Desktop: one wide card split down the middle —
                               outcome on the left, receipt and actions on the
                               right. Mobile drops the card and stacks the two
                               halves in reading order. */}
                            <div className="relative w-full h-full flex justify-center items-center">
                                {backArrow}
                                <div className={`w-full flex flex-col items-center ${STACK} sm:w-[820px] sm:flex-row sm:items-stretch sm:gap-0`}>
                                <div className="flex flex-col justify-center items-center sm:items-start gap-3 w-[290px] sm:w-1/2 sm:px-8 sm:py-10">
                                    { panelState === "noDriver"
                                        ? <ErrorMark className="-mt-2" size={140} />
                                        : <SuccessCheck className="-mt-2" size={140} /> }
                                    <div className="flex flex-col items-center sm:items-start gap-1">
                                        <h3 className={SUBTITLE}>Ride has been completed</h3>
                                        <h2 className={`text-center sm:text-left ${TITLE}`}>₹{fare}</h2>
                                    </div>
                                    {tollNotice}
                                </div>

                                <div className="flex flex-col justify-center items-start gap-3 w-[290px] sm:w-1/2 sm:px-8 sm:py-10 sm:border-l sm:border-[var(--foreground)]/10">
                                    {/* receipt: where you went, then what it cost */}
                                    <RoutePanel size="sm" pickup={pickupLocation} drop={dropLocation}>
                                        <div className="flex items-center justify-between w-full">
                                            <h3 className={`${META} text-[var(--text-muted)]`}>Fare</h3>
                                            <h3 className={`${META} font-semibold`}>₹{fare}</h3>
                                        </div>
                                        <div className="flex items-center justify-between w-full">
                                            <h3 className={`${META} text-[var(--text-muted)]`}>Distance</h3>
                                            <h3 className={META}>{distanceKm != null ? `${Math.round(distanceKm * 10) / 10} km` : "—"}</h3>
                                        </div>
                                    </RoutePanel>

                                    {driverCard}

                                    {/* pill hugs its label like the Share pill — a
                                        fixed 110px wraps "Ride details" at 16px */}
                                    <Button onClick={() => setDetialsVisibility(true)} prop={{ variant: "input", bg: "var(--background-muted)", rounded: "999px" }} className="cursor-pointer px-3">
                                        <p className="text-sm sm:text-base text-[var(--text)] whitespace-nowrap">Ride details</p>
                                    </Button>

                                    <div className="w-full flex flex-col gap-2 mt-2">
                                        {/* payment happens here, so the dispute
                                            route sits right above the button */}
                                        {extraFareNotice}
                                        <Button onClick={() => navigate("/")}
                                            className="w-full"
                                            prop={{ variant: "", width: "100%", innerClassName: "flex gap-2 items-center justify-center text-base sm:text-lg" }}
                                        >
                                            Paid to driver
                                        </Button>
                                        <Button
                                            onClick={() => openSupportWhatsApp("Hi, I need help with my ride.")}
                                            prop={{ variant: "input", width: "100%", bg: "var(--background-muted)" }}
                                        >
                                            <span className="flex items-center justify-center gap-2 text-base sm:text-lg">
                                                <img src={waLogo} alt="WhatsApp" className="w-6 h-6" />
                                                Talk to Support
                                            </span>
                                        </Button>
                                    </div>
                                </div>
                                </div>
                            </div>
                        </BackgroundPanel>

                        : <BackgroundPanel className={"py-6 sm:overflow-hidden justify-center items-center flex flex-col sm:flex-row sm:justify-center lg:justify-between text-left sm:px-[9%] md:px-[5%] xl:px-[13%]"}>
                            {/* Live ride: route + the driver's current position */}
                            {!isMobile && mapVisible && (
                                <GoogleMap center={pickupPoint} zoom={12} onMapReady={setMapApi} className={MAP_CLASSES} />
                            )}
                            {/* Floats over the map, a fixed gap above the sheet's
                                top edge. Anchored to the panel, not the content
                                column — the column is vertically centred on
                                mobile, so its top moves with the content. */}
                            <Button prop={{ variant: "input", bg: "var(--background-muted)", rounded: "999px" }} className='absolute z-20 -top-14 right-4 px-3 sm:hidden block shadow-[0_4px_20px_2px_rgba(0,0,0,0.5)]'>
                                <div className="flex gap-1.5 items-center justify-center">
                                    <Icon path={mdiShareVariant} size={0.7} />
                                    <h4 className="text-sm">Share</h4>
                                </div>
                            </Button>
                            <div className={`relative z-10 sm:order-1 flex flex-col justify-center items-center sm:items-start w-full sm:w-auto ${STACK}`}>
                                {backArrow}
                                <div className={`flex flex-col justify-center items-center sm:items-start ${PAIR} ${COL}`}>
                                    <h2 className={`text-center sm:text-left w-full ${TITLE}`}>{liveHeadline.title}</h2>
                                    <h3 className={`text-center sm:text-left w-full ${SUBTITLE}`}>{liveHeadline.detail}</h3>
                                    <Button prop={{ variant: "input", bg: "var(--background-muted)", rounded: "999px" }} className="mt-2 px-3 hidden sm:block">
                                        <div className="flex gap-1.5 items-center justify-center">
                                            <Icon path={mdiShareVariant} className="text-[var(--text-muted)]" size={0.6} />
                                            <p className="text-sm sm:text-base">Share</p>
                                        </div>
                                    </Button>
                                </div>

                                <div className={`flex flex-col justify-center items-start gap-3 ${COL}`}>
                                    {/* the driver is the most useful thing on this
                                        screen, so it leads the body */}
                                    {driverCard}

                                    {/* Only the OTP earns a card — it's the one
                                        thing the rider reads out loud. Rendered
                                        conditionally so the border never shows
                                        around an empty box. */}
                                    {(status === "en_route" || status === "reached") && (
                                        <div className="w-full rounded-xl border border-[var(--foreground)]/30 bg-[var(--background-muted)] px-3.5 sm:px-4 text-left">
                                            <div className="flex items-center justify-between w-full py-3">
                                                <h3 className={`${META} text-[var(--text-muted)]`}>OTP</h3>
                                                <h3 className="text-xl sm:text-3xl font-semibold tracking-[0.25em] -mr-[0.25em]">{bookingCode}</h3>
                                            </div>
                                        </div>
                                    )}

                                    {/* where you're going sits straight on the sheet */}
                                    {dropSummary}

                                    {/* extra top margin: with the drop row now on
                                        the bare sheet, the container gap alone
                                        let the notices crowd it */}
                                    <div className="w-full flex flex-col gap-2 mt-4">
                                        {tollNotice}
                                        {extraFareNotice}
                                    </div>

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
                                            className="flex-1"
                                            prop={{ variant: "", width: "100%", innerClassName: "flex gap-2 items-center justify-center text-base sm:text-lg" }}
                                        >
                                            <Icon path={mdiPhone} size={0.8} />
                                            Call driver
                                        </Button>
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
        </div>
    )
}

export default TrackingPage

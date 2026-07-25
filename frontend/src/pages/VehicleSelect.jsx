import Button from "../components/ui/Button";
import GoogleMap, { MAP_LAND_COLOR } from "../components/ui/GoogleMap";
import { MAP_CLASSES, CenterPin, showRouteView, clearRouteView } from "../components/ui/mapOverlays";
import { useIsMobile } from "../hooks/useIsMobile";
import { useData } from "../hooks/useData";
import { useApi } from "../hooks/useApi";
import { useState, useEffect, useRef } from "react";
import ErrorMark from "../components/illustrations/ErrorMark";
import SuccessCheck from "../components/illustrations/SuccessCheck";
import { useViewNavigate } from "../hooks/useViewNavigate";
import PriceIllustration from "../components/illustrations/RadarScanIllustration";
import SafetyIllustration from "../components/illustrations/DriverEnRouteIllustration";
import WhatsAppIllustration from "../components/illustrations/WhatsAppIllustration";
import Icon from '@mdi/react';
import { mdiKeyboardBackspace } from '@mdi/js';
import ErrorPanel from "../components/ui/ErrorPanel";
import BackgroundPanel from "../components/ui/BackgroundPanel";
import NoticePill from "../components/ui/NoticePill";
import RideDetails from "../components/RideDetails";

// Placeholder fares, also the card prices — booking charges what the card
// showed. "Book any" (1) bills the lower bound.
const FARES = {
    4: { solo: 400, sharing: 300 },
    6: { solo: 600, sharing: 500 },
    1: { solo: 400, sharing: 300 },
};

// Flat add-on for routing via the highway; the detour is longer, and the
// backend applies the same number to its own estimate.
const SAFE_ROUTE_SURCHARGE = 150;

// Pickup ETA per vehicle type. Placeholder until the driver-availability
// endpoint returns a real nearest-driver time — same shape, so swapping the
// source is a one-line change.
const ETA_MIN = { 4: 3, 6: 5, 1: 3 };

// A driver exists from here on — the searching panel's exit condition.
const LIVE_STATUSES = ["assigned", "en_route", "reached", "started"];

// Dev fallbacks (seed anchors) for hand-typed addresses with no Places coords.
const PICKUP_FALLBACK = { lat: 28.6315, lng: 77.2167 };
const DROP_FALLBACK = { lat: 28.4951, lng: 77.0890 };

// ---- Shared layout + type scale -------------------------------------------
// The desktop content column is 377px — OnBoarding's effective control width
// (290px base × its 1.3 scale) — reached with a real width instead of a
// transform, so spacing and type sizes stay honest at both breakpoints.
const COL = "w-[290px] sm:w-[377px]";
const TITLE = "font-bold text-3xl sm:text-5xl leading-tight";
const SUBTITLE = "text-lg sm:text-2xl font-normal leading-snug text-[var(--text-muted)]";
// Vertical rhythm: 8px inside a pair, 12–16px within a group, 32/48 between.
const STACK = "gap-6 sm:gap-8";
const GROUP = "gap-2 sm:gap-3";
const PAIR = "gap-0.5 sm:gap-1";

const VehicleSelect = ()=>{
    const phone=useData(state=>state.phone)
    const scheduledTime= useData(state=>state.scheduledTime)
    const dropLocation= useData(state=>state.dropLocation)
    const setDrop= useData(state=>state.setDrop)
    const pickupLocation= useData(state=>state.pickupLocation)
    const setPickup= useData(state=>state.setPickup)
    const pickupCoords= useData(state=>state.pickupCoords)
    const setPickupCoords= useData(state=>state.setPickupCoords)
    const dropCoords= useData(state=>state.dropCoords)
    const setDropCoords= useData(state=>state.setDropCoords)
    const distanceKm = useData(state => state.distanceKm);
    const setDistanceKm = useData(state => state.setDistanceKm);
    const durationMin = useData(state => state.durationMin);
    const setDurationMin = useData(state => state.setDurationMin);
    const routePolyline = useData(state => state.routePolyline);
    const setRoutePolyline = useData(state => state.setRoutePolyline);
    const fareSource = useData(state => state.fareSource);
    const setFareSource = useData(state => state.setFareSource);
    const setFare = useData(state => state.setFare);
    const vehicleType = useData(state=>state.vehicleType);
    const setvehicleType = useData(state => state.setvehicleType);
    const sharing = useData(state=>state.sharing);
    const setSharing = useData(state => state.setSharing);
    const safeRoute = useData(state=>state.safeRoute);
    const setSafeRoute = useData(state => state.setSafeRoute);
    const bookingId = useData(state=>state.bookingId);
    const setBookingId = useData(state => state.setBookingId);
    const bookingCode = useData(state=>state.bookingCode);
    const setBookingCode = useData(state => state.setBookingCode);
    const status = useData(state=>state.status);
    const setStatus = useData(state => state.setStatus);
    const setActiveBooking = useData(state => state.setActiveBooking);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    // Dev-only: /dev/vehicle?step=|?panel= force internal states for previews.
    const devParams = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null;
    const [panelState, setPanelState]= useState(devParams?.get("panel") ?? "");  // "confirm" | "error"
    const [step, setStep] = useState(() => {
        const devStep = devParams?.get("step");
        return devStep === "searching" || devStep === "confirmLocation" ? devStep : "vehicleType";
    }); // "vehicleType" | "confirmLocation" | "searching"
    // Which endpoint the confirm-location screen is adjusting, and whether
    // confirming should create the booking (Book ride path) or just return
    // to vehicle select (marker-click adjust path).
    const [confirmTarget, setConfirmTarget] = useState("pickup"); // "pickup" | "drop"
    const [bookAfterConfirm, setBookAfterConfirm] = useState(false);
    const [detialsVisibility, setDetialsVisibility] = useState(false)
    const [msgIndex, setMsgIndex] = useState(0);
    const [illusIndex, setIllusIndex] = useState(0);
    const navigate = useViewNavigate();
    const api=useApi();
    const isMobile = useIsMobile();
    // The raw Map instance of the mobile page-background map, for reframing on
    // step changes (desktop mounts a fresh <GoogleMap> per panel instead).
    const [mapApi, setMapApi] = useState(null);

    const searchMessages = [
        "Finding drivers near you...",
        "Notifying nearby drivers...",
        "Connecting you with a driver...",
        "Checking driver availability...",
        "Looking a little further...",
        "Reaching out to more drivers...",
        "Almost there...",
        "Hang tight...",
    ];

    // Route metrics (distance/time/polyline) for display + booking payload,
    // preferring pin-adjusted coords over the typed addresses. Vehicle type
    // only affects the fare, so any valid type works. Returns the fresh data
    // so callers that can't wait for a re-render (confirmBooking) can use it.
    async function fetchEstimate() {
        if (!pickupLocation?.trim() || !dropLocation?.trim()) return null;
        const data = await api.estimateFare(pickupLocation, dropLocation, vehicleType ?? 4, pickupCoords, dropCoords, safeRoute);
        if (data?.error) return null;
        setDistanceKm(data.distanceKm ?? null);
        setDurationMin(data.durationMin ?? null);
        setRoutePolyline(data.polyline ?? null);
        // ?fare= wins over the server's answer — previews force a pricing
        // source the real route wouldn't produce. null in prod.
        setFareSource(devParams?.get("fare") ?? data.fareSource ?? null);
        return data;
    }

    useEffect(() => {
        // wipe the previous route's metrics first — the map draws from the
        // store immediately, and a stale polyline would show the old booking's
        // path until the new estimate lands
        setDistanceKm(null);
        setDurationMin(null);
        setRoutePolyline(null);
        // ?fare= survives the wipe so previews can force a pricing source
        // without the backend; null in prod, where devParams is null.
        setFareSource(devParams?.get("fare") ?? null);
        fetchEstimate();
    }, []);

    // The safer route runs through a forced waypoint, so the road path, distance
    // and duration all change with it — the map would otherwise keep drawing the
    // shortcut. Compares values rather than using a one-shot flag, so StrictMode's
    // throwaway run can't consume it (same pattern as OnBoarding's address hook).
    const safeRouteRef = useRef(safeRoute);
    useEffect(() => {
        if (safeRouteRef.current === safeRoute) return;
        safeRouteRef.current = safeRoute;
        fetchEstimate();
    }, [safeRoute]);

    useEffect(() => {
        if (step !== "searching") return;
        const t = setInterval(() => setIllusIndex(i => (i + 1) % 3), 5000);
        return () => clearInterval(t);
    }, [step]);

    useEffect(() => {
        if (step !== "searching") return;
        // durations (ms) each message stays before advancing — last 2 stay 3× longer
        const durations = [30000, 30000, 30000, 30000, 30000, 30000, 210000, 210000];
        const timeouts = [];
        let elapsed = 0;
        durations.slice(0, -1).forEach((dur, i) => {
            elapsed += dur;
            timeouts.push(setTimeout(() => setMsgIndex(i + 1), elapsed));
        });
        return () => timeouts.forEach(clearTimeout);
    }, [step]);

    // Driver assignment runs detached on the server, so this panel is driven by
    // polling: a driver landing moves us to tracking, an exhausted search to the
    // no-drivers panel. Same self-scheduling shape as TrackingPage — the next
    // tick is set from the response, so a slow request can't stack polls.
    useEffect(() => {
        if (step !== "searching" || !bookingId) return;
        let cancelled = false;
        let timer = null;

        async function poll() {
            const data = await api.getBookingStatus(bookingId);
            if (cancelled) return;
            if (!data?.error && data.status) {
                setStatus(data.status);
                if (data.status === "no_driver") {
                    // the ride never happened — drop the optimistic trip card so
                    // OnBoarding doesn't offer a dead booking
                    setActiveBooking(null);
                    setBookingId(null);
                    setPanelState("noDriver");
                    return;
                }
                if (LIVE_STATUSES.includes(data.status)) {
                    navigate(`/booking/test`);
                    return;
                }
            }
            timer = setTimeout(poll, 5000);
        }

        // the create response is fresh, so wait a tick before the first check
        timer = setTimeout(poll, 5000);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [step, bookingId]);

    const pickupPoint = pickupCoords ?? PICKUP_FALLBACK;
    const dropPoint = dropCoords ?? DROP_FALLBACK;

    // Marker click on the full-route view → zoom into that endpoint and let
    // the user drag the map under the fixed pin to move it.
    function openLocationAdjust(target) {
        setConfirmTarget(target);
        setBookAfterConfirm(false);
        setStep("confirmLocation");
    }

    // Map settled on the confirm screen → its center IS the adjusted point,
    // and the address text follows it via reverse geocode. The mount/re-center
    // settle (center ≈ stored coords, or no stored coords yet) keeps the
    // user's own address text — only a real pan rewrites it. The seq counter
    // drops responses that arrive after a newer settle.
    const geocodeSeqRef = useRef(0);
    async function handleMapSettled(center) {
        const target = confirmTarget;
        const prev = target === "pickup" ? pickupCoords : dropCoords;
        if (target === "pickup") setPickupCoords(center);
        else setDropCoords(center);

        const moved = prev && (Math.abs(prev.lat - center.lat) > 1e-4 || Math.abs(prev.lng - center.lng) > 1e-4);
        if (!moved) return;

        const seq = ++geocodeSeqRef.current;
        const data = await api.reverseGeocode(center.lat, center.lng);
        if (seq !== geocodeSeqRef.current || data?.error || !data?.formattedAddress) return;
        if (target === "pickup") setPickup(data.formattedAddress);
        else setDrop(data.formattedAddress);
    }

    async function handleConfirmLocation() {
        if (bookAfterConfirm) {
            // fresh route metrics for the adjusted pin go straight into the
            // booking payload — store updates can't reach this closure in time
            setLoading(true);
            const fresh = await fetchEstimate();
            await confirmBooking(fresh);
        } else {
            setStep("vehicleType");
            fetchEstimate(); // background refresh; the map redraws when it lands
        }
    }

    // Single owner of the map's framing + overlays, re-run on step change,
    // breakpoint hand-off, and — crucially — when the road polyline arrives
    // from the fare estimate (it resolves after the first draw, which would
    // otherwise leave the straight-line fallback on screen).
    useEffect(() => {
        if (!mapApi) return;
        if (step === "confirmLocation") {
            clearRouteView();
            mapApi.setCenter(confirmTarget === "pickup" ? pickupPoint : dropPoint);
            mapApi.setZoom(17);
        } else {
            showRouteView(mapApi, {
                pickupPoint, dropPoint, routePolyline,
                onPickupClick: () => openLocationAdjust("pickup"),
                onDropClick: () => openLocationAdjust("drop"),
            });
        }
        // leaving /book (or a StrictMode remount) must not strand overlays on
        // the shared map
        return clearRouteView;
    }, [mapApi, isMobile, step, confirmTarget, routePolyline]);

    // "Book ride" leads to the pickup pin-confirm; the booking is only
    // created from there (confirmBooking).
    function handleSubmit(e) {
        e.preventDefault();

        if (!vehicleType) {
            setError("Select a vehicle type");
            return;
        }

        setConfirmTarget("pickup");
        setBookAfterConfirm(true);
        setStep("confirmLocation");
    }

    // The cards quote the base fare; the safer route is an add-on called out
    // under its toggle, so it lands here rather than in the card prices.
    const fareFor = (type) =>
        FARES[type][sharing ? "sharing" : "solo"] + (safeRoute ? SAFE_ROUTE_SURCHARGE : 0);

    async function confirmBooking(freshMetrics) {
        const rideFare = fareFor(vehicleType);

        try {
            setError(null);
            setLoading(true);
            setFare(rideFare);

            // Coords come from the Places selection; seed anchors remain as a
            // dev fallback so hand-typed bookings still find seeded drivers.
            const data = await api.createBooking({
                pickupAddress:  pickupLocation,
                pickupLat:      pickupCoords?.lat ?? PICKUP_FALLBACK.lat,
                pickupLng:      pickupCoords?.lng ?? PICKUP_FALLBACK.lng,
                dropAddress:    dropLocation,
                dropLat:        dropCoords?.lat ?? DROP_FALLBACK.lat,
                dropLng:        dropCoords?.lng ?? DROP_FALLBACK.lng,
                vehicleType:    vehicleType,   // 4 | 6 | 1
                fare:           rideFare,
                distanceKm:     freshMetrics?.distanceKm ?? distanceKm,
                sharing:       sharing,
                preferSafeRoute: safeRoute,
                scheduledAt: scheduledTime,
                isOutstation:  false,
            });

            if (data?.error) {
                if (data.error === "No drivers available. Please try again shortly."){
                    setPanelState("noDriver")
                    return
                }
                // Surface the server's conflict message as-is.
                if (data.error.startsWith("You already have")) {
                    setError(data.error);
                    return;
                }
                setError("Can't create booking, try again");
                return;
            }
            if (data.bookingId) setBookingId(data.bookingId)
            if (data.bookingCode) setBookingCode(data.bookingCode)
            if (data.status) setStatus(data.status)

            // Optimistic: OnBoarding's cards show immediately; its next mount
            // reconciles with the server.
            setActiveBooking({
                id: data.bookingId,
                code: data.bookingCode,
                status: data.status,
                pickupAddress: pickupLocation,
                dropAddress: dropLocation,
                fare: rideFare,
                scheduledAt: scheduledTime,
            });

            if(scheduledTime) setPanelState("confirmed")
            else if (data.status === "assigned") {
                // navigate(`/booking/${data.bookingId}`)
                navigate(`/booking/test`)
                return
            }
            else setStep("searching")
        } catch (err) {
            console.error(err);
            
            setError("Something went wrong");
        } finally {
            setLoading(false);
        }
    }

    let sliderColor = sharing ? "bg-green-500" : "bg-gray-500"
    let sliderPosition = sharing ? "-left-2" : "left-5"
    // Selected pricing mode carries the emphasis; the other drops to fine print.
    let solo = sharing ? "text-xs sm:text-sm text-[var(--text-muted)]" : "font-semibold text-lg sm:text-2xl text-[var(--text)]"
    let share = sharing ? "font-semibold text-lg sm:text-2xl text-[var(--text)]" : "text-xs sm:text-sm text-[var(--text-muted)]"
    let soloVisiblity = sharing? "block" : "hidden"
    let shareVisiblity = sharing? "hidden" : "block"
    let safeSliderColor = safeRoute ? "bg-green-500" : "bg-gray-500"
    let safeSliderPosition = safeRoute ? "-left-2" : "left-5"

    // Any panel state (noDriver / confirmed) supersedes the search.
    const searchingVisible = step === "searching" && !panelState

    // Zone and fixed-table destinations are quoted all-in; only the per-km
    // formula prices the drive alone, leaving tolls to settle with the driver.
    const tollNotice = fareSource === "formula" && (
        <NoticePill>Tolls payable to driver separately</NoticePill>
    );

    // One card per vehicle type — same block for all three, so the type scale
    // and internal spacing can't drift between them.
    const vehicleCard = (type, name, seats, priceSolo, priceSharing) => (
        <Button
            onClick={() => setvehicleType(type)}
            prop={{
                variant: "input",
                width: "100%",
                bg: "var(--background-muted)",
            }}
            className={`${vehicleType === type ? "outline-2" : "outline-0"} px-3 sm:px-4 outline-primary focus:outline-2`}
        >
            {/* tighter inset at 290px so "Book any" keeps its name, seats and
                price range on one line each, like the other two cards */}
            <div className="flex justify-between items-center w-full gap-2 sm:gap-3">
                <div className="text-left flex flex-col justify-center items-start gap-0.5">
                    <h4 className="text-lg sm:text-xl font-medium text-[var(--text)] leading-tight">{name}</h4>
                    <p className="text-sm sm:text-base text-[var(--text-muted)] leading-tight">{seats} · {ETA_MIN[type]} min away</p>
                </div>
                <div key={sharing ? "share" : "solo"} className="animate-fade-swap text-right flex flex-col justify-center items-end gap-0.5">
                    <span className={`flex gap-1 leading-tight ${solo}`}> <span className={`${soloVisiblity}`}>Solo: </span>{priceSolo}</span>
                    <span className={`flex gap-1 leading-tight ${share}`}> <span className={`${shareVisiblity}`}>Sharing: </span>{priceSharing}</span>
                </div>
            </div>
        </Button>
    );

    return (
        <div className="relative bg-transparent text-center flex flex-col justify-center items-center w-[100vw] h-[100vh]">
                <>
                    <ErrorPanel prop={{error: error, setError: setError}} />

                    {/* Mobile: land-colored backdrop behind the map so seams
                        (e.g. the confirm step's shortened map) and tile-load
                        flashes read as more map instead of page background */}
                    {isMobile && (
                        <div className="absolute inset-0 z-0" style={{ background: MAP_LAND_COLOR }} />
                    )}

                    {/* Mobile: persistent page-background map — the opaque
                        bottom-sheet panels sit over it (OnBoarding layering) */}
                    {isMobile && (
                        <GoogleMap
                            center={pickupPoint}
                            zoom={12}
                            onMapReady={setMapApi}
                            onIdle={step === "confirmLocation" ? handleMapSettled : undefined}
                            // on the confirm step the map ends above the bottom
                            // sheet, so its center (pin + getCenter) is the
                            // center of the VISIBLE area, not the viewport
                            className={`absolute inset-x-0 top-0 z-0 ${step === "confirmLocation" ? "bottom-[270px]" : "bottom-0"}`}
                        >
                            {step === "confirmLocation" && <CenterPin target={confirmTarget} />}
                        </GoogleMap>
                    )}
                    <BackgroundPanel show={panelState === "noDriver" || (panelState === "confirmed" && scheduledTime)} className={`z-4 sm:z-3 bottom-0 gap-3 sm:gap-5 py-6 text-center flex flex-col justify-center items-center`}>
                        { panelState === "noDriver"
                            ? <ErrorMark className="-mt-2" size={140} />
                            : <SuccessCheck className="-mt-2" size={140} /> }
                        <h2 className={TITLE}> { panelState === "noDriver" ? "No drivers nearby." :  "You're all set." } </h2>
                        <p className="text-base sm:text-lg leading-relaxed"> { panelState === "noDriver" ? "Try again in a few minutes." :  <>We'll WhatsApp you <br /> when a driver is assigned.</> } </p>
                        <Button 
                            onClick={() => navigate('/')}
                            prop={{
                                type: "submit",
                                width: "100%",
                            }}
                            className={`mt-4 ${COL}`}
                        >
                            <span className="text-base sm:text-lg">{loading? "Loading..." : "Go back"}</span>
                        </Button>
                    </BackgroundPanel>
                    
                    {/* Searching panel — illustrations */}
                    <BackgroundPanel show={searchingVisible && detialsVisibility === false} className={`z-3 sm:z-2 sm:overflow-hidden py-6 text-left sm:px-[9%] md:px-[5%] xl:px-[13%] flex flex-col sm:flex-row sm:justify-center lg:justify-between items-center`}>
                        {/* Back to the zoomed-out full-route view while searching */}
                        {!isMobile && searchingVisible && detialsVisibility === false && (
                            <GoogleMap center={pickupPoint} zoom={12} onMapReady={setMapApi} className={MAP_CLASSES} />
                        )}

                        <div className={`relative z-10 sm:order-1 flex flex-col justify-end sm:justify-center items-center sm:items-start ${STACK} w-full sm:w-auto h-full sm:h-auto`}>
                            <h2 className={`w-full text-center sm:text-left ${TITLE}`}>Requesting a ride</h2>

                            <div className={`flex flex-col items-center sm:items-start justify-center gap-4 ${COL}`}>
                                {/* progress reads as one status block: bar, then
                                    the rotating message, then the way out */}
                                <div className="relative w-full rounded-full h-[6px] overflow-hidden">
                                    <div className="absolute z-1 inset-0 bg-primary animate-searching-bar h-full"/>
                                    <div className="absolute z-0 inset-0 bg-gray-500 w-full h-full"/>
                                </div>

                                <div className="w-full flex justify-between items-center gap-3">
                                    <p className="text-left text-base sm:text-lg text-[var(--text-muted)]">{searchMessages[msgIndex]}</p>
                                    <Button onClick={()=>setDetialsVisibility(true)} prop={{ variant: "input", width: "110px", bg: "var(--background-muted)" }} className="cursor-pointer shrink-0" >
                                        <p className="text-sm sm:text-base text-[var(--text)]">Ride details</p>
                                    </Button>
                                </div>
                            </div>

                            <div key={illusIndex} className={`animate-illus-fade w-full rounded-xl border border-[var(--foreground)]/30 bg-[var(--background-muted)] p-3 flex flex-col items-center sm:items-start justify-center gap-3 ${COL}`}>
                                {illusIndex === 0 && (
                                    <>
                                        <PriceIllustration />
                                        <div className="w-full text-left flex flex-col gap-1 px-1 pb-1">
                                            <h3 className="text-lg sm:text-xl font-medium text-[var(--text)] leading-tight">Lowest fares on campus.</h3>
                                            <p className="text-sm sm:text-base leading-relaxed text-[var(--text-muted)]">Save up to 40% over cabs, every ride.</p>
                                        </div>
                                    </>
                                )}
                                {illusIndex === 1 && (
                                    <>
                                        <SafetyIllustration />
                                        <div className="w-full text-left flex flex-col gap-1 px-1 pb-1">
                                            <h3 className="text-lg sm:text-xl font-medium text-[var(--text)] leading-tight">Every ride, verified safe.</h3>
                                            <p className="text-sm sm:text-base leading-relaxed text-[var(--text-muted)]">Background-checked drivers. Real-time GPS.</p>
                                        </div>
                                    </>
                                )}
                                {illusIndex === 2 && (
                                    <>
                                        <WhatsAppIllustration />
                                        <div className="w-full text-left flex flex-col gap-1 px-1 pb-1">
                                            <h3 className="text-lg sm:text-xl font-medium text-[var(--text)] leading-tight">Same WhatsApp. Zero effort.</h3>
                                            <p className="text-sm sm:text-base leading-relaxed text-[var(--text-muted)]">Book like you always have. We handle the rest.</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </BackgroundPanel>

                    {/* Searching panel — ride details */}
                    <BackgroundPanel show={searchingVisible && detialsVisibility === true} className={`z-3 sm:z-2 py-6 sm:overflow-hidden text-left flex flex-col sm:flex-row justify-center items-center sm:justify-center lg:justify-between sm:px-[9%] md:px-[5%] xl:px-[13%]`}>
                        {/* same split as every other desktop panel: content
                            left, the booked route on the right */}
                        {!isMobile && detialsVisibility && (
                            <GoogleMap center={pickupPoint} zoom={12} onMapReady={setMapApi} className={MAP_CLASSES} />
                        )}
                        <RideDetails prop={{setLoading,setError,setDetialsVisibility}}/>
                    </BackgroundPanel>
                    
                    <div className={`${panelState === "noDriver" || (panelState === "confirmed" && scheduledTime) || step === "searching" ? "block" : "hidden" } absolute z-2 sm:z-1 bottom-0 bg-black/40 w-[100vw] h-[100vh]`}/>
                    
                    {/* Confirm-location panel — zoomed into the target endpoint;
                        the map drags under a fixed pin, and each settle
                        reverse-geocodes the center into the address card. */}
                    <BackgroundPanel show={step === "confirmLocation"} className={`z-1 sm:z-0 sm:overflow-hidden py-6 text-left flex flex-col sm:flex-row sm:px-[9%] md:px-[5%] xl:px-[13%] sm:justify-center lg:justify-between items-center`}>
                        {!isMobile && step === "confirmLocation" && (
                            <GoogleMap
                                center={confirmTarget === "pickup" ? pickupPoint : dropPoint}
                                zoom={17}
                                onMapReady={setMapApi}
                                onIdle={handleMapSettled}
                                className={MAP_CLASSES}
                            >
                                <CenterPin target={confirmTarget} />
                            </GoogleMap>
                        )}

                        <div onClick={() => setStep("vehicleType")} className="flex gap-2 sm:gap-2 items-center justify-center cursor-pointer opacity-[0.8] transition-opacity duration-300 hover:opacity-[1] absolute z-10 left-5 top-6 text-[var(--text)]">
                            <Icon path={mdiKeyboardBackspace} size={1.2} />
                        </div>

                        <div className={`relative z-10 sm:order-1 flex flex-col justify-end sm:justify-center items-center sm:items-start ${STACK} w-full sm:w-auto h-full sm:h-auto py-2 sm:py-0`}>
                            <div className={`flex flex-col justify-center items-center sm:items-start ${PAIR} ${COL}`}>
                                <h2 className={`w-full text-center sm:text-left ${TITLE}`}>Confirm {confirmTarget} point</h2>
                                <h3 className={`hidden sm:block w-full text-center sm:text-left ${SUBTITLE}`}>{confirmTarget === "pickup" ? "Place the pin where you'll wait" : "Place the pin where you're headed"}</h3>
                            </div>

                            <div className={`flex flex-col justify-center items-center sm:items-start gap-3 ${COL}`}>
                                {/* address + the ride it belongs to sit in one
                                    card, split by a hairline */}
                                <div className="w-full rounded-xl border border-[var(--foreground)]/30 bg-[var(--background-muted)] px-4 text-left">
                                    <div className="flex flex-col gap-0.5 py-3">
                                        <p className="text-xs sm:text-sm text-[var(--text-muted)]">{confirmTarget === "pickup" ? "Pickup" : "Drop"}</p>
                                        <h4 className="truncate w-full text-base sm:text-xl font-medium text-[var(--text)]">{confirmTarget === "pickup" ? pickupLocation : dropLocation}</h4>
                                    </div>
                                    <div className="w-full h-px bg-[var(--foreground)]/10" />
                                    <div className="flex items-center justify-between w-full py-3 gap-3">
                                        <h4 className="text-sm sm:text-base text-[var(--text-muted)]">{vehicleType === 6 ? "Cab XL" : vehicleType === 1 ? "Book any" : "Cab Economy"}{sharing ? " · Sharing" : " · Solo"}{safeRoute ? " · Safer route" : ""}</h4>
                                        <h4 className="text-base sm:text-xl font-semibold">₹{vehicleType ? fareFor(vehicleType) : ""}</h4>
                                    </div>
                                </div>
                                <Button
                                    onClick={handleConfirmLocation}
                                    prop={{ type: "button", width: "100%", disabled: loading }}
                                    className="w-full"
                                >
                                    <span className="text-base sm:text-lg">{loading ? "Booking..." : bookAfterConfirm ? "Confirm pickup" : `Confirm ${confirmTarget} location`}</span>
                                </Button>
                                <p className="text-xs sm:text-sm leading-snug text-[var(--text-muted)]">Free cancellation until the driver arrives.</p>
                            </div>
                        </div>
                    </BackgroundPanel>

                    <BackgroundPanel show={step === "vehicleType"} className={`z-1 sm:z-0 sm:overflow-hidden py-6 text-left sm:px-[9%] md:px-[5%] xl:px-[13%] flex flex-col sm:flex-row sm:justify-center lg:justify-between items-center`}>
                        {/* Zoomed-out full-route view; markers are clickable to
                            adjust either endpoint. Guarded on `step` so the
                            singleton map moves out promptly on step change. */}
                        {!isMobile && step === "vehicleType" && (
                            <GoogleMap center={pickupPoint} zoom={12} onMapReady={setMapApi} className={MAP_CLASSES} />
                        )}

                        <div onClick={()=>navigate('/')} className="flex gap-2 sm:gap-2 items-center justify-center cursor-pointer opacity-[0.8] transition-opacity duration-300 hover:opacity-[1] absolute z-10 left-5 top-6 text-[var(--text)]">
                            <Icon path={mdiKeyboardBackspace} size={1.2} />
                        </div>
                        <div className={`relative z-10 sm:order-1 flex flex-col justify-end sm:justify-center items-center sm:items-start ${STACK} w-full sm:w-auto h-full sm:h-auto`}>
                            <div className={`flex flex-col justify-center items-center sm:items-start gap-2 ${COL}`}>
                                <h2 className={`w-full text-center sm:text-left ${TITLE}`}>Choose a ride</h2>
                                {distanceKm != null && (
                                    <div className="w-full flex justify-center sm:justify-start">
                                        <div className="rounded-full border border-[var(--foreground)]/20 px-3 py-1 text-sm sm:text-base whitespace-nowrap text-[var(--text-muted)]">
                                            {Math.round(distanceKm * 10) / 10} km{durationMin != null ? ` · ${durationMin} min` : ""}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <form className={`flex flex-col justify-center items-stretch gap-2 ${COL}`} noValidate onSubmit={handleSubmit}>
                                {vehicleCard(4, "Cab Economy", "4 Seater", `₹${FARES[4].solo}`, `₹${FARES[4].sharing}`)}
                                {vehicleCard(6, "Cab XL", "6 Seater", `₹${FARES[6].solo}`, `₹${FARES[6].sharing}`)}
                                {vehicleCard(1, "Book any", "4-6 Seater", `₹${FARES[4].solo}-${FARES[6].solo}`, `₹${FARES[4].sharing}-${FARES[6].sharing}`)}

                                {/* Both ride preferences live in one card with a
                                    hairline between them, so they read as a
                                    settings group rather than two loose rows. */}
                                <div className="mt-2 w-full rounded-xl border border-[var(--foreground)]/30 bg-[var(--background-muted)] px-4">
                                    <div className="flex justify-between items-center w-full py-3">
                                        <h4 className="text-base sm:text-lg font-medium text-[var(--text)]">Share a ride?</h4>
                                        <div onClick={()=>setSharing(!sharing)} className="relative w-[50px] h-[22px] scale-[0.9] sm:scale-[1] flex items-center justify-center ">
                                            <div className={`absolute inset-0 ${sliderPosition} border-b-2 border-[rgba(255,255,255,0.05)] bg-white scale-[1] hover:scale-[1.1] cursor-pointer [transition:all_300ms,transform_300ms_150ms] bg-[linear-gradient(to_top,transparent_50%,rgba(146,146,139,0.25)_100%)] shadow-[inset_0px_2px_2px_1px_rgba(255,255,255,0.4),0px_0px_10px_rgba(0,0,0,0.6)]  w-[40px] rounded-full h-[inherit]`}/>
                                            <div className={`${sliderColor} rounded-full w-[inherit] h-[14px]`}/>
                                        </div>
                                    </div>

                                    <div className="w-full h-px bg-[var(--foreground)]/10" />

                                    {/* Neutral label on purpose — the roadmap decision is
                                        that this is a preference anyone can want at night,
                                        not a gender rule. */}
                                    <div className="flex justify-between items-start w-full py-3 gap-3">
                                        <div className="flex flex-col gap-0.5 text-left">
                                            <h4 className="text-base sm:text-lg font-medium text-[var(--text)]">Safer route?</h4>
                                            <p className="text-xs sm:text-sm leading-snug text-[var(--text-muted)]">
                                                Lit highway instead of the shortcut. Adds ₹{SAFE_ROUTE_SURCHARGE}.
                                            </p>
                                        </div>
                                        <div onClick={()=>setSafeRoute(!safeRoute)} className="relative w-[50px] h-[22px] mt-1 shrink-0 scale-[0.9] sm:scale-[1] flex items-center justify-center ">
                                            <div className={`absolute inset-0 ${safeSliderPosition} border-b-2 border-[rgba(255,255,255,0.05)] bg-white scale-[1] hover:scale-[1.1] cursor-pointer [transition:all_300ms,transform_300ms_150ms] bg-[linear-gradient(to_top,transparent_50%,rgba(146,146,139,0.25)_100%)] shadow-[inset_0px_2px_2px_1px_rgba(255,255,255,0.4),0px_0px_10px_rgba(0,0,0,0.6)]  w-[40px] rounded-full h-[inherit]`}/>
                                            <div className={`${safeSliderColor} rounded-full w-[inherit] h-[14px]`}/>
                                        </div>
                                    </div>
                                </div>

                                {tollNotice && <div className="w-full mt-2">{tollNotice}</div>}

                                <div className="mt-3 w-full flex flex-col gap-2">
                                    <Button
                                        prop={{
                                            type: "submit",
                                            width: "100%",
                                            disabled: !vehicleType,
                                        }}
                                        >
                                        <span className="text-base sm:text-lg">{loading? "Booking..." : "Book ride"}</span>
                                    </Button>
                                    <p className="text-xs sm:text-sm leading-snug text-[var(--text-muted)]">Free cancellation until the driver arrives.</p>
                                    
                                    
                                </div>
                            </form>
                        </div>
                    </BackgroundPanel>
                </>
        </div>
    );
};

export default VehicleSelect

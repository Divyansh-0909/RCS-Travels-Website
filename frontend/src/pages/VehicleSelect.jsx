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
import { mdiKeyboardBackspace, mdiAccount } from '@mdi/js';
import ErrorPanel from "../components/ui/ErrorPanel";
import BackgroundPanel from "../components/ui/BackgroundPanel";
import NoticePill from "../components/ui/NoticePill";
import { openSupportWhatsApp } from "../constants/support";
import RideDetails from "../components/RideDetails";
import { CARRIER_CHARGE, CANCELLATION_CHARGE_PCT, isDistancePriced } from "../constants/fares";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import FailureState from "../components/ui/FailureState";
import { VEHICLE_CATEGORIES, VEHICLE_CLASS_NAMES, labelOf, seatsOf } from "../constants/vehicles";

// Every price on this screen comes from /api/fare/estimate, which resolves each
// seat type through zones -> the fixed fare table -> the per-km formula. There is
// deliberately no local fallback table: a placeholder here would silently charge
// the wrong fare for any destination the rate card actually prices.
const NO_PRICE = "₹—";

// Pickup ETA per vehicle class. Placeholder until the driver-availability
// endpoint returns a real nearest-driver time — same shape, so swapping the
// source is a one-line change. The premium SUV is the rarest car on the road,
// so it waits longest.
const ETA_MIN = { hatchback: 3, sedan: 4, suv: 5, suv_premium: 8, any: 3 };

// A driver exists from here on — the searching panel's exit condition.
const LIVE_STATUSES = ["assigned", "en_route", "reached", "started"];

// On phones the Book button is pinned below the sheet rather than nested in the
// form, so it submits by id instead of by DOM position.
const BOOK_FORM_ID = "vehicle-book-form";

// Dev fallbacks (seed anchors) for hand-typed addresses with no Places coords.
const PICKUP_FALLBACK = { lat: 28.6315, lng: 77.2167 };
const DROP_FALLBACK = { lat: 28.4951, lng: 77.0890 };

// ---- Shared layout + type scale -------------------------------------------
// The desktop content column is 377px — OnBoarding's effective control width
// (290px base × its 1.3 scale) — reached with a real width instead of a
// transform, so spacing and type sizes stay honest at both breakpoints.
const COL = "w-[min(86vw,100%)] sm:w-[377px]";
const TITLE = "font-bold text-3xl sm:text-5xl leading-tight";
const SUBTITLE = "text-lg sm:text-2xl font-normal leading-snug text-[var(--text-muted)]";
// Vertical rhythm: 8px inside a pair, 12–16px within a group, 32/48 between.
const STACK = "gap-6 sm:gap-8";
const GROUP = "gap-2 sm:gap-3";
const PAIR = "gap-0.5 sm:gap-1";

// The panel's switch: a white pill riding over a coloured bar. This markup was
// pasted inline three times before the pinned bar needed a fourth, which was two
// too many — the rendered output is unchanged.
const SliderToggle = ({ on, onClick, className = "" }) => (
    <div
        onClick={onClick}
        role="switch"
        aria-checked={on}
        className={`relative w-[50px] h-[22px] scale-[0.9] sm:scale-[1] flex items-center justify-center ${className}`}
    >
        <div className={`absolute inset-0 ${on ? "-left-2" : "left-5"} border-b-2 border-[rgba(255,255,255,0.05)] bg-white scale-[1] hover:scale-[1.1] cursor-pointer [transition:all_300ms,transform_300ms_150ms] bg-[linear-gradient(to_top,transparent_50%,rgba(146,146,139,0.25)_100%)] shadow-[inset_0px_2px_2px_1px_rgba(255,255,255,0.4),0px_0px_10px_rgba(0,0,0,0.6)] w-[40px] rounded-full h-[inherit]`} />
        <div className={`${on ? "bg-green-500" : "bg-gray-500"} rounded-full w-[inherit] h-[14px]`} />
    </div>
);

// One column of the pinned bar's options row: the question, what it does to the
// fare underneath, and the switch stacked below both.
// The switch sits under the label rather than beside it, so the text gets the
// column's full width instead of what's left once a 50px switch is paid for.
// nowrap on both lines so a narrower device clips rather than reflows: two rows
// of heading here would push the columns out of alignment with each other.
// The group is centred in the column it occupies, but everything inside it hangs
// off one left edge: the note reads as a caption under the label, and the
// switch lines up beneath both. origin-left so the switch's 0.9 scale shrinks
// towards that edge rather than away from it.
// `dense` is the three-column case — a 360px phone gives each column ~90px once
// the dividers are paid for, and "Roof carrier?" doesn't fit that at 16px.
const BarPref = ({ label, note, on, onClick, dense = false }) => (
    <div className="flex-1 min-w-0 flex justify-center">
        {/* Shrink-wrapped to the widest line, so items-start is the label's own
            left edge and not the column's — the column is flex-1 and wider. */}
        <div className="flex flex-col items-start gap-2.5 min-w-0">
            <div className="flex flex-col gap-0.5 text-left min-w-0">
                <h4 className={`${dense ? "text-sm" : "text-base"} font-medium leading-tight whitespace-nowrap text-[var(--text)]`}>{label}</h4>
                <p className={`${dense ? "text-xs" : "text-sm"} leading-snug whitespace-nowrap text-[var(--text-muted)]`}>{note}</p>
            </div>
            <SliderToggle on={on} onClick={onClick} className="origin-left" />
        </div>
    </div>
);

// The three searching illustrations are a fixed 290×200 canvas whose internals
// are positioned in px, so they can't reflow — on phones they're scaled as
// artwork instead. 290px is the full COL width, which would otherwise overflow
// the card's p-3 padding. The box reserves the scaled size so layout stays honest.
const Illustration = ({ children }) => (
    <div className="w-[261px] h-[180px] sm:w-[290px] sm:h-[200px]">
        <div className="w-[290px] origin-top-left scale-90 sm:scale-100">{children}</div>
    </div>
);

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
    const vehicleClass = useData(state=>state.vehicleClass);
    const setVehicleClass = useData(state => state.setVehicleClass);
    const sharing = useData(state=>state.sharing);
    const setSharing = useData(state => state.setSharing);
    const safeRoute = useData(state=>state.safeRoute);
    const setSafeRoute = useData(state => state.setSafeRoute);
    const needsCarrier = useData(state=>state.needsCarrier);
    const setNeedsCarrier = useData(state => state.setNeedsCarrier);
    const setFareToll = useData(state => state.setFareToll);
    const setFareCarrier = useData(state => state.setFareCarrier);
    const setFareAirport = useData(state => state.setFareAirport);
    const bookingId = useData(state=>state.bookingId);
    const setBookingId = useData(state => state.setBookingId);
    const bookingCode = useData(state=>state.bookingCode);
    const setBookingCode = useData(state => state.setBookingCode);
    const status = useData(state=>state.status);
    const setStatus = useData(state => state.setStatus);
    const setActiveBooking = useData(state => state.setActiveBooking);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    // { hatchback:{solo,sharing,source}, sedan:{...}, ... } from /api/fare/estimate.
    // Route-scoped and transient, so it stays local rather than going in the
    // store; the booked fare is what gets persisted.
    const [serverFares, setServerFares] = useState(null);
    // serverFares === null covers three different situations — estimate in
    // flight, estimate failed, and route not priceable — and only the first
    // should show skeletons. Seeded from the same guard fetchEstimate uses, so
    // the cards don't paint a "₹—" frame before the mount fetch starts.
    const [pricing, setPricing] = useState(() => Boolean(pickupLocation?.trim() && dropLocation?.trim()));
    // The estimate's own failure, kept separate from `error` (the ErrorPanel):
    // this one has to persist on the panel with a retry, where ErrorPanel's only
    // action is "Okay", which dismissed straight back onto unpriced cards.
    const [estimateError, setEstimateError] = useState(null);

    // The server's verdict on whether THIS trip has a safer route at all:
    // { available, applied, fee, extraKm, extraMin, waypoint }, or null before
    // the first estimate lands. Google's alternatives decide it, so it changes
    // with the route rather than with anything the rider set.
    const [safeRouteInfo, setSafeRouteInfo] = useState(null);
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
        setPricing(true);
        setEstimateError(null);
        // finally, not a clear on each exit: the error path returns early and
        // estimateFare can throw, and either leaving `pricing` stuck true would
        // strand the cards on skeletons forever.
        try {
            const data = await api.estimateFare(pickupLocation, dropLocation, vehicleClass ?? "hatchback", pickupCoords, dropCoords, safeRoute, needsCarrier);
            if (data?.error) {
                // These prices are what the booking is created with, so a failed
                // estimate has to surface — say so and leave the cards unpriced.
                setServerFares(null);
                setSafeRouteInfo(null);
                setEstimateError(data.error);
                return null;
            }
            setServerFares(data.fares ?? null);
            setDistanceKm(data.distanceKm ?? null);
            setDurationMin(data.durationMin ?? null);
            setRoutePolyline(data.polyline ?? null);
            setSafeRouteInfo(data.safeRoute ?? null);
            // ?fare= wins over the server's answer — previews force a pricing
            // source the real route wouldn't produce. null in prod.
            setFareSource(devParams?.get("fare") ?? data.fareSource ?? null);
            return data;
        } catch (err) {
            // request() only converts HTTP errors into { error } — a network
            // failure rejects, and both call sites used to let it escape
            // unhandled, leaving the cards on "₹—" with nothing said.
            console.error(err);
            setServerFares(null);
            setSafeRouteInfo(null);
            setEstimateError("Couldn't reach the server to price this route.");
            return null;
        } finally {
            setPricing(false);
        }
    }

    useEffect(() => {
        // wipe the previous route's metrics first — the map draws from the
        // store immediately, and a stale polyline would show the old booking's
        // path until the new estimate lands
        setDistanceKm(null);
        setDurationMin(null);
        setRoutePolyline(null);
        setServerFares(null);
        // Whether a safer route exists is a property of the route, so it goes
        // with the metrics — otherwise the toggle lingers from the last trip.
        setSafeRouteInfo(null);
        // the add-ons are part of the previous booking's total, so they go with
        // its metrics — otherwise ride details would itemise a toll this trip
        // never crosses
        setFareToll(0);
        setFareCarrier(0);
        setFareAirport(0);
        // ?fare= survives the wipe so previews can force a pricing source
        // without the backend; null in prod, where devParams is null.
        setFareSource(devParams?.get("fare") ?? null);
        fetchEstimate();
    }, []);

    // The safer route runs through a forced waypoint, so the road path, distance
    // and duration all change with it — the map would otherwise keep drawing the
    // shortcut. The carrier moves only the price, but that price is the server's
    // to decide (it is waived on the expensive routes), so it needs the same
    // round trip. Compares values rather than using a one-shot flag, so
    // StrictMode's throwaway run can't consume it (same pattern as OnBoarding's
    // address hook).
    const rideOptionsRef = useRef({ safeRoute, needsCarrier });
    useEffect(() => {
        const prev = rideOptionsRef.current;
        if (prev.safeRoute === safeRoute && prev.needsCarrier === needsCarrier) return;
        rideOptionsRef.current = { safeRoute, needsCarrier };
        fetchEstimate();
    }, [safeRoute, needsCarrier]);

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
                    // freshStatus: the store status was set a line ago from this same
                    // response, so TrackingPage can render it without a skeleton.
                    navigate(`/booking/test`, { state: { freshStatus: true } });
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

    // Declared up here, not with the other pricing flags below, because the map
    // overlay effect reads it — a const declared after that useEffect would be
    // in its TDZ when the dep array is evaluated during render.
    const hasRoute = Boolean(pickupLocation?.trim() && dropLocation?.trim());

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
        // With no addresses the endpoints are only the seed anchors, so drawing
        // them put a confident pickup→drop line on the map beside a panel
        // reading "No route set". The map stays (it is just context); the claim
        // about a route the rider has not set does not.
        if (!hasRoute) {
            clearRouteView();
            return;
        }
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
    }, [mapApi, isMobile, step, confirmTarget, routePolyline, hasRoute]);

    // "Book ride" leads to the pickup pin-confirm; the booking is only
    // created from there (confirmBooking).
    function handleSubmit(e) {
        e.preventDefault();

        if (!vehicleClass) {
            setError("Select a vehicle");
            return;
        }

        if (fareFor(vehicleClass) == null) {
            setError("Still pricing this route. One moment.");
            return;
        }

        setConfirmTarget("pickup");
        setBookAfterConfirm(true);
        setStep("confirmLocation");
    }

    // The cards quote the base fare; the safer route is an add-on called out
    // under its toggle, so it lands here rather than in the card prices.
    // Server fares already include the safer-route surcharge, so nothing is added
    // on top here. null means the estimate hasn't landed or the route can't be
    // priced for that class — every caller must treat that as "cannot book".
    const fareOf = (cls, mode) => serverFares?.[cls]?.[mode] ?? null;
    const fareFor = (cls) => fareOf(cls, sharing ? "sharing" : "solo");

    // Cards show both modes at once, so labels take the mode explicitly rather
    // than following the toggle.
    const label = (cls, mode) => {
        const v = fareOf(cls, mode);
        return v == null ? NO_PRICE : `₹${v}`;
    };
    // Whether this screen has anything bookable to offer, and if not, why —
    // three outcomes that all used to look identical: cards reading "₹—" with a
    // disabled button and no explanation.
    //   !hasRoute      → /book opened with no addresses (direct link, cleared store)
    //                    — declared above, next to the map points that consume it
    //   estimateError  → the estimate request itself failed
    //   routeUnpriced  → the estimate succeeded but priced nothing for this route
    const anyFare = VEHICLE_CLASS_NAMES.map(c => fareOf(c, "solo") ?? fareOf(c, "sharing")).find(v => v != null) ?? null;
    const routeUnpriced = hasRoute && !pricing && !estimateError && anyFare == null;

    async function confirmBooking(freshMetrics) {
        // freshMetrics carries the estimate that was just re-fetched for the
        // adjusted pin — its fares are newer than serverFares, which can't have
        // re-rendered yet. Falling back to state covers the unchanged-pin path.
        const fares = freshMetrics?.fares ?? serverFares;
        const rideFare = fares?.[vehicleClass]?.[sharing ? "sharing" : "solo"] ?? null;

        // Refuse rather than invent a number. Before the server priced this
        // screen a hardcoded table stood in here, which quietly charged ₹400 for
        // destinations the rate card prices at ₹1800.
        if (rideFare == null) {
            setError("Couldn't price this route. Check the addresses and try again.");
            setLoading(false);
            return;
        }

        try {
            setError(null);
            setLoading(true);
            setFare(rideFare);
            // Persist the source of the type actually booked, so tracking shows
            // the tolls notice for the right ride rather than for whichever type
            // the last estimate happened to ask about.
            setFareSource(devParams?.get("fare") ?? fares[vehicleClass].source ?? null);
            // Same reason, and from the same row: ride details itemises the
            // total, and the carrier it shows must be the amount actually
            // charged — 0 on the routes where the provider waives it.
            setFareToll(fares[vehicleClass].toll ?? 0);
            setFareCarrier(fares[vehicleClass].carrier ?? 0);
            setFareAirport(fares[vehicleClass].airport ?? 0);

            // Read off the estimate the fare above came from, so the road stored
            // on the booking is provably the one that was priced. `applied` is the
            // server's answer to "did a safer route exist AND was it taken" — the
            // toggle alone can be on for a trip that never had one.
            const safeRouteResolved = freshMetrics?.safeRoute ?? safeRouteInfo;
            const safeRouteApplied = safeRouteResolved?.applied === true;

            // Coords come from the Places selection; seed anchors remain as a
            // dev fallback so hand-typed bookings still find seeded drivers.
            const data = await api.createBooking({
                pickupAddress:  pickupLocation,
                pickupLat:      pickupCoords?.lat ?? PICKUP_FALLBACK.lat,
                pickupLng:      pickupCoords?.lng ?? PICKUP_FALLBACK.lng,
                dropAddress:    dropLocation,
                dropLat:        dropCoords?.lat ?? DROP_FALLBACK.lat,
                dropLng:        dropCoords?.lng ?? DROP_FALLBACK.lng,
                vehicleClass:   vehicleClass,   // hatchback | sedan | suv | suv_premium | any
                fare:           rideFare,
                distanceKm:     freshMetrics?.distanceKm ?? distanceKm,
                sharing:       sharing,
                preferSafeRoute: safeRouteApplied,
                // The point the driver's navigation has to be sent through. Without
                // it the fare reflects the safer road and the driver still takes
                // the shortcut, which is the whole failure this feature exists for.
                safeWaypoint:   safeRouteApplied ? safeRouteResolved.waypoint : null,
                needsCarrier:  needsCarrier,
                // Itemised so the server can take its commission off the driving
                // alone — a toll or a carrier is money passing through, not fare
                // earned. Sent from the same row the price came from.
                toll:          fares[vehicleClass].toll ?? 0,
                airport:       fares[vehicleClass].airport ?? 0,
                carrier:       fares[vehicleClass].carrier ?? 0,
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
                // freshStatus: the store status was set a line ago from this same
                // response, so TrackingPage can render it without a skeleton.
                navigate(`/booking/test`, { state: { freshStatus: true } })
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

    // Selected pricing mode carries the emphasis; the other drops to fine print.
    let solo = sharing ? "text-xs sm:text-sm text-[var(--text-muted)]" : "font-semibold text-lg sm:text-2xl text-[var(--text)]"
    let share = sharing ? "font-semibold text-lg sm:text-2xl text-[var(--text)]" : "text-xs sm:text-sm text-[var(--text-muted)]"
    let soloVisiblity = sharing? "block" : "hidden"
    let shareVisiblity = sharing? "hidden" : "block"

    // Any panel state (noDriver / confirmed) supersedes the search.
    const searchingVisible = step === "searching" && !panelState

    // Everything the quoted number does or doesn't cover, read off the card the
    // rider actually selected. Per seat type, not per request: a destination the
    // rate card prices for hatchbacks but not SUVs is 'zone' for Cab Economy and
    // 'formula' for Cab XL, so the tolls warning has to follow the selection. The
    // store's fareSource is only a fallback for the ?fare= dev override, which
    // has no serverFares behind it.
    //
    // Rate-card destinations are quoted all-in, and where the provider charges a
    // toll on top it is now inside the price — said out loud, because "₹1600 to
    // the airport" is worth more than ₹1600 with a surprise attached. The per-km
    // formula still prices the drive alone and leaves tolls with the driver.
    const selectedFare = serverFares?.[vehicleClass];
    const selectedSource = selectedFare?.source ?? fareSource;
    const fareNotices = [
        isDistancePriced(selectedSource) && "Tolls payable to driver separately",
        selectedFare?.toll > 0 && `Includes the ₹${selectedFare.toll} highway toll`,
        selectedFare?.airport > 0 && `Includes the ₹${selectedFare.airport} airport pickup charge`,
        selectedFare?.carrierWaived && "Roof carrier included free on this route",
    ].filter(Boolean);

    // The form only renders in the happy path; the three states before it are
    // an EmptyState or a FailureState with their own actions. The pinned CTA bar
    // belongs to the form, so it has to agree with that same condition.
    const showsBookForm = hasRoute && !estimateError && !routeUnpriced;

    // Phones only, and only on the step that has a form to submit.
    const pinBookBar = isMobile && step === "vehicleType" && showsBookForm;

    // Height of that bar, handed back to the sheet as its bottomInset so the
    // sheet rests on top of the bar rather than behind it. Measured rather than
    // hardcoded: it's one button and a line of text today, but that line wraps at
    // a large text size, and a stale number would put the sheet's bottom edge in
    // the wrong place. Declared after pinBookBar because the effect's dep array
    // is evaluated during render — a const declared later would be in its TDZ.
    const bookBarRef = useRef(null);
    const [bookBarHeight, setBookBarHeight] = useState(0);
    useEffect(() => {
        const el = bookBarRef.current;
        if (!el) {
            setBookBarHeight(0);
            return;
        }
        setBookBarHeight(el.offsetHeight);
        const observer = new ResizeObserver(([entry]) => {
            // borderBox, not contentRect: the bar draws its background over its
            // own padding, and the sheet has to clear all of it.
            setBookBarHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [pinBookBar]);

    // Three columns instead of two in the pinned bar, which is what makes the
    // type step down — see BarPref's `dense`.
    const barDense = !!safeRouteInfo?.available;

    // Rendered inside the form on desktop and in the pinned bar on phones, so
    // there is one definition of the CTA rather than two that can drift. The
    // `form` attribute is what lets the phone copy submit a form it isn't nested
    // in — see Button's pass-through.
    const bookAction = (
        <div className="w-full flex flex-col gap-2 sm:mt-3">
            {/* Phones only: every option that changes the fare, immediately
                above the button that commits to it. Desktop keeps these in the
                sheet's preferences card.

                The safer route is a third column only on the routes that have
                one — most destinations never cross a shady zone, and an empty
                column there would be an offer of nothing. */}
            {isMobile && (
                <div className="flex w-full items-center gap-2 pt-1 pb-3">
                    <BarPref
                        label="Share ride?"
                        note="Reduces fare"
                        on={sharing}
                        onClick={() => setSharing(!sharing)}
                        dense={barDense}
                    />
                    <div className="w-px self-stretch bg-[var(--foreground)]/20" />
                    <BarPref
                        label="Roof carrier?"
                        // Never promise a charge that isn't made: the provider
                        // throws the carrier in above a threshold, and the
                        // estimate is what knows whether this route is over it.
                        note={selectedFare?.carrierWaived ? "Free on this route." : `Adds ₹${CARRIER_CHARGE}.`}
                        on={needsCarrier}
                        onClick={() => setNeedsCarrier(!needsCarrier)}
                        dense={barDense}
                    />
                    {barDense && (
                        <>
                            <div className="w-px self-stretch bg-[var(--foreground)]/20" />
                            <BarPref
                                label="Safer route?"
                                // The fee is the server's, not a constant here:
                                // it's priced per route from the detour it
                                // actually needs.
                                note={`Adds ₹${safeRouteInfo.fee}.`}
                                on={safeRoute}
                                onClick={() => setSafeRoute(!safeRoute)}
                                dense
                            />
                        </>
                    )}
                </div>
            )}

            <Button
                prop={{
                    type: "submit",
                    form: BOOK_FORM_ID,
                    width: "100%",
                    // no price yet = nothing legitimate to charge
                    disabled: !vehicleClass || fareFor(vehicleClass) == null,
                }}
            >
                <span className="text-base sm:text-lg">{loading ? "Booking..." : "Book ride"}</span>
            </Button>
            {/* Names the exact point the fee starts — "until the driver arrives"
                was ambiguous about en_route, which is still free. */}
            <p className="text-xs sm:text-sm leading-snug text-center sm:text-left text-[var(--text-muted)]">
                Free cancellation until the driver reaches your pickup. After that it's {CANCELLATION_CHARGE_PCT}% of the fare.
            </p>
        </div>
    );

    // One card per vehicle — same block for every class, so the type scale and
    // internal spacing can't drift between them.
    const vehicleCard = (cls, name, seats, priceSolo, priceSharing) => (
        <Button
            key={cls}
            onClick={() => setVehicleClass(cls)}
            prop={{
                variant: "input",
                width: "100%",
                bg: "var(--background-muted)",
            }}
            className={`${vehicleClass === cls ? "outline-2" : "outline-0"} px-3 sm:px-4 outline-primary focus:outline-2`}
        >
            {/* tighter inset at 290px so the longest name ("Premium SUV") keeps
                its name and price on one line each, like every other card */}
            <div className="flex justify-between items-center w-full gap-2 sm:gap-3">
                <div className="text-left flex flex-col justify-center items-start gap-1.5">
                    {/* Name alone on the first line; seats and ETA share the
                        muted second line. The seat count is a person glyph and a
                        number rather than the word "Seater" — it reads at a
                        glance and costs less width than the label it replaces. */}
                    <h4 className="text-lg sm:text-xl font-medium text-[var(--text)] leading-tight">{name}</h4>
                    <p className="flex items-center text-sm sm:text-base text-[var(--text-muted)] leading-tight">
                        {seats && (
                            <span className="flex items-center gap-0.5 mr-1">
                                {/* sized in CSS, not the size prop, so the glyph
                                    tracks the two type steps of this line */}
                                <Icon path={mdiAccount} className="w-[16px] h-[16px] sm:w-[18px] sm:h-[18px]" />
                                {seats} ·
                            </span>
                        )}
                        {ETA_MIN[cls]} min away
                    </p>
                </div>
                {/* Only the price is pending — the name, seats and ETA are known
                    up front, so the skeleton stands in for the two price lines
                    rather than blanking the whole card. Gated on !serverFares so
                    a background re-price doesn't flash over prices already on
                    screen; the bar heights mirror the two type sizes, and which
                    line is emphasised follows the sharing toggle. */}
                {pricing && !serverFares ? (
                    <div className="flex flex-col justify-center items-end gap-1.5 shrink-0">
                        <Skeleton className={sharing ? "h-[15px] sm:h-[17.5px] w-14 sm:w-16" : "h-[22.5px] sm:h-[30px] w-16 sm:w-20"} />
                        <Skeleton className={sharing ? "h-[22.5px] sm:h-[30px] w-16 sm:w-20" : "h-[15px] sm:h-[17.5px] w-14 sm:w-16"} />
                    </div>
                ) : (
                    <div key={sharing ? "share" : "solo"} className="animate-fade-swap text-right flex flex-col justify-center items-end gap-1.5">
                        <span className={`flex gap-1 leading-tight ${solo}`}> <span className={`${soloVisiblity}`}>Solo: </span>{priceSolo}</span>
                        <span className={`flex gap-1 leading-tight ${share}`}> <span className={`${shareVisiblity}`}>Sharing: </span>{priceSharing}</span>
                    </div>
                )}
            </div>
        </Button>
    );

    // overflow-hidden clips the panels while they sit off-screen at
    // translateX(100%) — without it a viewport-wide panel parked to the right
    // would double the page width and let the whole screen scroll sideways.
    return (
        <div className="relative overflow-hidden bg-transparent text-center flex flex-col justify-center items-center w-[100vw] h-[100dvh]">
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
                    <BackgroundPanel show={panelState === "noDriver" || (panelState === "confirmed" && scheduledTime)} className={`z-4 sm:z-3 bottom-0 gap-1.5 sm:gap-2 py-6 text-center flex flex-col justify-center items-center`}>
                        { panelState === "noDriver"
                            ? <ErrorMark className="-mt-2" size={isMobile ? 120 : 140} />
                            : <SuccessCheck className="-mt-2" size={isMobile ? 120 : 140} /> }
                        <h2 className={TITLE}> { panelState === "noDriver" ? "No drivers nearby." :  "You're all set." } </h2>
                        {/* leading-snug, not -relaxed: at 1.625 the line box added
                            5.6px of dead space above and below, which read as
                            gap and swamped the container's own spacing */}
                        <p className="text-base sm:text-lg leading-snug"> { panelState === "noDriver" ? "Try again in a few minutes." :  <>We'll WhatsApp you <br /> when a driver is assigned.</> } </p>
                        {/* COL goes on a wrapper, not on the Button: prop.width
                            is an inline style and would beat the class at every
                            breakpoint, stretching the button to the full sheet */}
                        <div className={`mt-1 ${COL}`}>
                            <Button
                                onClick={() => navigate('/')}
                                prop={{
                                    type: "submit",
                                    width: "100%",
                                }}
                            >
                                <span className="text-base sm:text-lg">{loading? "Loading..." : "Go back"}</span>
                            </Button>
                        </div>
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
                                    {/* same pill as TrackingPage's — content-sized
                                        and fully rounded, not a fixed 110px box */}
                                    <Button onClick={()=>setDetialsVisibility(true)} prop={{ variant: "input", bg: "var(--background-muted)", rounded: "999px" }} className="cursor-pointer px-3 shrink-0" >
                                        <p className="text-sm sm:text-base text-[var(--text)] whitespace-nowrap">Ride details</p>
                                    </Button>
                                </div>
                            </div>

                            {/* no w-full — it beats COL's w-[290px] at the base
                                breakpoint and the card goes full-bleed on mobile */}
                            {/* artwork and its caption stay centred at both
                                breakpoints — this card is a promo, not a control */}
                            <div key={illusIndex} className={`animate-illus-fade rounded-xl border border-[var(--foreground)]/30 bg-[var(--background-muted)] p-3 flex flex-col items-center justify-center gap-3 ${COL}`}>
                                {illusIndex === 0 && (
                                    <>
                                        <Illustration><PriceIllustration /></Illustration>
                                        <div className="w-full text-center flex flex-col gap-1 px-1 pb-1">
                                            <h3 className="text-lg sm:text-xl font-medium text-[var(--text)] leading-tight">Lowest fares on campus.</h3>
                                            <p className="text-sm sm:text-base leading-relaxed text-[var(--text-muted)]">Save up to 40% over cabs, every ride.</p>
                                        </div>
                                    </>
                                )}
                                {illusIndex === 1 && (
                                    <>
                                        <Illustration><SafetyIllustration /></Illustration>
                                        <div className="w-full text-center flex flex-col gap-1 px-1 pb-1">
                                            <h3 className="text-lg sm:text-xl font-medium text-[var(--text)] leading-tight">Every ride, verified safe.</h3>
                                            <p className="text-sm sm:text-base leading-relaxed text-[var(--text-muted)]">Background-checked drivers. Real-time GPS.</p>
                                        </div>
                                    </>
                                )}
                                {illusIndex === 2 && (
                                    <>
                                        <Illustration><WhatsAppIllustration /></Illustration>
                                        <div className="w-full text-center flex flex-col gap-1 px-1 pb-1">
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
                    
                    <div className={`${panelState === "noDriver" || (panelState === "confirmed" && scheduledTime) || step === "searching" ? "block" : "hidden" } absolute z-2 sm:z-1 bottom-0 bg-black/40 w-[100vw] h-[100dvh]`}/>
                    
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

                        <div onClick={() => setStep("vehicleType")} className="max-sm:-top-12 max-sm:left-4 max-sm:h-9 max-sm:my-1 max-sm:px-3 max-sm:rounded-full max-sm:border max-sm:border-[var(--foreground)]/30 max-sm:bg-[var(--background-muted)] max-sm:shadow-[0_4px_20px_2px_rgba(0,0,0,0.5)] flex items-center justify-center cursor-pointer sm:opacity-[0.8] transition-opacity duration-300 hover:opacity-[1] absolute z-20 sm:left-5 sm:top-6 text-[var(--text)]">
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
                                    {/* Only when a ride is actually selected. This
                                        screen is also reached by clicking a map
                                        marker from "Choose a ride" (see
                                        openLocationAdjust), where nothing has been
                                        picked yet — the row then had no fare to
                                        show and its "Cab Economy" fallback named a
                                        vehicle the rider had not chosen. */}
                                    {vehicleClass && (
                                        <>
                                            <div className="w-full h-px bg-[var(--foreground)]/10" />
                                            <div className="flex items-center justify-between w-full py-3 gap-3">
                                                {/* The car, not the category: at the
                                                    point of paying, "Sedan" is what
                                                    was chosen and priced, and the
                                                    category alone couldn't say which
                                                    of its two cars is coming. */}
                                                <h4 className="text-sm sm:text-base text-[var(--text-muted)]">{labelOf(vehicleClass)}{sharing ? " · Sharing" : " · Solo"}{safeRoute && safeRouteInfo?.available ? " · Safer route" : ""}{needsCarrier ? " · Carrier" : ""}</h4>
                                                {/* re-priced on every pin adjust, so it
                                                    skeletons rather than flashing ₹— */}
                                                {pricing && fareFor(vehicleClass) == null
                                                    ? <Skeleton className="h-5 sm:h-6 w-16 sm:w-20" />
                                                    : <h4 className="text-base sm:text-xl font-semibold">{label(vehicleClass, sharing ? "sharing" : "solo")}</h4>}
                                            </div>
                                        </>
                                    )}
                                </div>
                                <Button
                                    onClick={handleConfirmLocation}
                                    prop={{ type: "button", width: "100%", disabled: loading }}
                                    className="w-full"
                                >
                                    <span className="text-base sm:text-lg">{loading ? "Booking..." : bookAfterConfirm ? "Confirm pickup" : `Confirm ${confirmTarget} location`}</span>
                                </Button>
                                {/* Same wording as the booking step — this is the
                                    last screen before the ride is created, so it
                                    must not state softer terms than the one before. */}
                                <p className="text-xs sm:text-sm leading-snug text-[var(--text-muted)]">
                                    Free cancellation until the driver reaches your pickup. After that it's {CANCELLATION_CHARGE_PCT}% of the fare.
                                </p>
                            </div>
                        </div>
                    </BackgroundPanel>

                    {/* The one panel that becomes a draggable sheet on phones:
                        it sits over a full-bleed map and its content is taller
                        than a phone, so collapsed/half/expanded is a real
                        choice. `duration` covers the exit spring, which takes
                        longer to settle than the 250ms wipe it replaces.

                        Opens at half, not collapsed: the fare cards are the
                        whole point of this step, and collapsed shows only the
                        heading and the distance chip — a screen that asks you
                        to drag before it tells you anything.

                        Deliberately NOT applied to the confirmLocation panel
                        below-  its map is clipped to `bottom-[270px]` so the
                        map's centre is the centre of the VISIBLE area, and that
                        centre is the coordinate the pin confirms. A sheet
                        floating over a full-bleed map there would move the
                        pin.

                        max-sm:pb-0: as a sheet, this panel's bottom edge is
                        already the Book bar's top edge, and the scroll region is
                        flex-1 of the padding box — 24px there doesn't pad the
                        scroll, it shortens it, so the last card was clipped with
                        a dead band beneath it. Desktop keeps py-6; it isn't a
                        scroller. */}
                    <BackgroundPanel
                        sheet
                        initialSnap="half"
                        duration={420}
                        bottomInset={pinBookBar ? bookBarHeight : 0}
                        show={step === "vehicleType"}
                        className={`z-1 sm:z-0 sm:overflow-hidden py-6 max-sm:pb-0 text-left sm:px-[9%] md:px-[5%] xl:px-[13%] flex flex-col sm:flex-row sm:justify-center lg:justify-between items-center`}
                    >
                        {/* Zoomed-out full-route view; markers are clickable to
                            adjust either endpoint. Guarded on `step` so the
                            singleton map moves out promptly on step change. */}
                        {!isMobile && step === "vehicleType" && (
                            <GoogleMap center={pickupPoint} zoom={12} onMapReady={setMapApi} className={MAP_CLASSES} />
                        )}

                        <div onClick={()=>navigate('/')} className="max-sm:-top-12 max-sm:left-4 max-sm:h-9 max-sm:my-1 max-sm:px-3 max-sm:rounded-full max-sm:border max-sm:border-[var(--foreground)]/30 max-sm:bg-[var(--background-muted)] max-sm:shadow-[0_4px_20px_2px_rgba(0,0,0,0.5)] flex items-center justify-center cursor-pointer sm:opacity-[0.8] transition-opacity duration-300 hover:opacity-[1] absolute z-20 sm:left-5 sm:top-6 text-[var(--text)]">
                            <Icon path={mdiKeyboardBackspace} size={1.2} />
                        </div>
                        {/* Bounds the column to the sheet's height on phones, so the
                            scroll area inside it has something to be `flex-1` of.
                            sm:contents removes it from layout entirely from the sm
                            breakpoint up, so the desktop side panel is laid out
                            exactly as it was before the sheet existed. */}
                        <div className="w-full flex-1 min-h-0 flex flex-col items-center sm:contents">
                        {/* flex-1, not h-full: the grabber is a sibling above this,
                            so a percentage height would overflow the panel by the
                            grabber's own height and push the last of the content
                            below the sheet's bottom edge. Claiming the remaining
                            space instead leaves the title block its size and gives
                            everything else to the scroll area. */}
                        {/* gap-3 on phones rather than STACK's gap-6: the title and
                            the chip are a header, and 24px under them pushed the
                            first fare card most of the way down the collapsed
                            sheet. Desktop keeps the full rhythm. */}
                        <div className={`relative z-10 sm:order-1 flex flex-col justify-end sm:justify-center items-center sm:items-start gap-3 sm:gap-8 w-full sm:w-auto flex-1 min-h-0 sm:flex-initial sm:h-auto`}>
                            <div className={`flex flex-col justify-center items-center sm:items-start gap-1 sm:gap-2 ${COL}`}>
                                <h2 className={`w-full text-center sm:text-left ${TITLE}`}>Choose a ride</h2>
                                {/* Route metrics land with the estimate, so the chip
                                    holds its place while that is in flight rather
                                    than popping in and pushing the cards down.
                                    Only while pricing — a route that resolves
                                    without metrics shows nothing, as before. */}
                                {(pricing && distanceKm == null) ? (
                                    <div className="w-full flex justify-center sm:justify-start">
                                        {/* sized to the real chip (py-1 + hairline
                                            + line box) so nothing shifts when the
                                            metrics land */}
                                        <Skeleton rounded="rounded-full" className="h-[30px] sm:h-[34px] w-[130px] sm:w-[145px]" />
                                    </div>
                                ) : distanceKm != null && (
                                    <div className="w-full flex justify-center sm:justify-start">
                                        <div className="rounded-full border border-[var(--foreground)]/20 px-3 py-1 text-sm sm:text-base whitespace-nowrap text-[var(--text-muted)]">
                                            {Math.round(distanceKm * 10) / 10} km{durationMin != null ? ` · ${durationMin} min` : ""}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* The scroll region, phones only: everything from the
                                vehicle groups down. The title and the distance chip
                                sit above it and stay put — they say what the screen
                                is and what it's pricing, which is exactly what you
                                don't want scrolling away while you compare fares.

                                sm:contents drops this element on desktop, where the
                                side panel is short enough not to need it. */}
                            <div
                                data-sheet-scroll
                                className="w-full min-h-0 flex-1 flex flex-col items-center overscroll-contain sm:contents"
                            >
                            {!hasRoute ? (
                                <div className={COL}>
                                    <EmptyState
                                        tone="dark"
                                        align="sm-left"
                                        title="No route set"
                                        message="Tell us where you're starting from and where you're headed, and we'll price it."
                                        action={{ label: "Set your route", onClick: () => navigate('/') }}
                                    />
                                </div>
                            ) : estimateError ? (
                                <div className={COL}>
                                    <FailureState
                                        tone="dark"
                                        align="sm-left"
                                        title="Couldn't price this route"
                                        detail={estimateError}
                                        onRetry={() => fetchEstimate()}
                                        retrying={pricing}
                                        secondaryAction={{ label: "Change your route", onClick: () => navigate('/') }}
                                    />
                                </div>
                            ) : routeUnpriced ? (
                                <div className={COL}>
                                    {/* Deliberately not a fallback price. A placeholder
                                        here is what once charged ₹400 for a trip the
                                        rate card prices at ₹1800 — so an unpriced
                                        route asks a human instead of guessing. */}
                                    <EmptyState
                                        tone="dark"
                                        align="sm-left"
                                        title="We don't price this route yet"
                                        message="This drop-off isn't on our rate card. Message us and we'll quote it by hand."
                                        action={{
                                            label: "Ask us for a fare",
                                            onClick: () => openSupportWhatsApp(
                                                `Hi, I'd like a fare for ${pickupLocation} to ${dropLocation}.`
                                            ),
                                        }}
                                        secondaryAction={{ label: "Change your route", onClick: () => navigate('/') }}
                                    />
                                </div>
                            ) : (
                            <form id={BOOK_FORM_ID} className={`flex flex-col justify-center items-stretch gap-2 ${COL}`} noValidate onSubmit={handleSubmit}>
                                {/* Two cars per category, under a heading that
                                    names it. The category is what the rider
                                    recognises ("Cab XL"); the class under it is
                                    the actual car and the thing that gets priced,
                                    matched to a driver and stored on the booking.
                                    The list comes from constants/vehicles.js, so
                                    a new car appears here by editing that map. */}
                                {/* Phones show what the fare already covers at the
                                    top of the scroll area, so it's read before the
                                    prices it explains rather than after them.
                                    Desktop keeps them under the preferences card,
                                    where the whole form is visible at once. */}
                                {isMobile && fareNotices.length > 0 && (
                                    // Set off on both sides, on top of the form's own
                                    // gap-2: the pill is a note about the whole list,
                                    // so it needs more air than the list's own
                                    // headings have — tight underneath and it reads
                                    // as a label for Cab Economy, tight above and it
                                    // crowds the distance chip in the pinned header.
                                    <div className="w-full mt-1 mb-3 flex flex-col items-start gap-1.5">
                                        {fareNotices.map(text => <NoticePill key={text}>{text}</NoticePill>)}
                                    </div>
                                )}

                                <div className="flex flex-col items-stretch gap-4">
                                    {VEHICLE_CATEGORIES.map(group => (
                                        <div key={group.category} className="flex flex-col items-stretch gap-2">
                                            <h3 className="px-1 text-xs sm:text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                                                {group.category}
                                            </h3>
                                            {group.classes.map(cls => vehicleCard(
                                                cls, labelOf(cls), seatsOf(cls),
                                                label(cls, "solo"), label(cls, "sharing"),
                                            ))}
                                        </div>
                                    ))}
                                </div>

                                {/* The ride preferences live in one card with a
                                    hairline between them, so they read as a
                                    settings group rather than loose rows.

                                    Desktop only: every one of these three is now a
                                    column of the pinned bar on phones, and two
                                    controls for one setting on one screen is a way
                                    to make a rider doubt which one took. */}
                                {!isMobile && (
                                <div className="mt-2 w-full rounded-xl border border-[var(--foreground)]/30 bg-[var(--background-muted)] px-4">
                                    <div className="flex justify-between items-center w-full py-3">
                                        <h4 className="text-base sm:text-lg font-medium text-[var(--text)]">Share a ride?</h4>
                                        <SliderToggle on={sharing} onClick={()=>setSharing(!sharing)} />
                                    </div>

                                    {/* Shown ONLY when this trip's default route actually
                                        crosses a shady zone and the server found a way
                                        round it. Most destinations never do, and offering
                                        a paid detour around a road the ride doesn't use
                                        would be selling nothing. The divider belongs to
                                        the row so hiding it can't leave a double hairline.

                                        Neutral label on purpose — the roadmap decision is
                                        that this is a preference anyone can want at night,
                                        not a gender rule. */}
                                    {safeRouteInfo?.available && (
                                        <>
                                            <div className="w-full h-px bg-[var(--foreground)]/10" />

                                            <div className="flex justify-between items-start w-full py-3 gap-3">
                                                <div className="flex flex-col gap-0.5 text-left">
                                                    <h4 className="text-base sm:text-lg font-medium text-[var(--text)]">Safer route?</h4>
                                                    <p className="text-xs sm:text-sm leading-snug text-[var(--text-muted)]">
                                                        {!safeRoute
                                                            ? `Avoids the unlit stretch this route would take. Adds ₹${safeRouteInfo.fee}.`
                                                            : `₹${safeRouteInfo.fee}${safeRouteInfo.extraKm > 0 ? ` and about ${safeRouteInfo.extraKm} km extra` : ""}, already in the prices above.`}
                                                    </p>
                                                </div>
                                                <SliderToggle on={safeRoute} onClick={()=>setSafeRoute(!safeRoute)} className="mt-1 shrink-0" />
                                            </div>
                                        </>
                                    )}

                                    <div className="w-full h-px bg-[var(--foreground)]/10" />

                                    {/* The cards re-price on toggle, so the charge
                                        lands in the fares themselves rather than
                                        being promised here — hence "from": on the
                                        expensive runs the provider throws it in,
                                        and the pill below says so. */}
                                    <div className="flex justify-between items-start w-full py-3 gap-3">
                                        <div className="flex flex-col gap-0.5 text-left">
                                            <h4 className="text-base sm:text-lg font-medium text-[var(--text)]">Roof carrier?</h4>
                                            <p className="text-xs sm:text-sm leading-snug text-[var(--text-muted)]">
                                                {!needsCarrier
                                                    ? `For luggage that won't fit in the boot. Adds ₹${CARRIER_CHARGE}.`
                                                    : selectedFare?.carrierWaived
                                                        ? "Included free on this route — no extra charge."
                                                        : `₹${selectedFare?.carrier ?? CARRIER_CHARGE} extra fare, already in the prices above.`}
                                            </p>
                                        </div>
                                        <SliderToggle on={needsCarrier} onClick={()=>setNeedsCarrier(!needsCarrier)} className="mt-1 shrink-0" />
                                    </div>
                                </div>
                                )}

                                {/* Phones show these in the pinned bar instead. */}
                                {!isMobile && fareNotices.length > 0 && (
                                    <div className="w-full mt-2 flex flex-col gap-2">
                                        {fareNotices.map(text => <NoticePill key={text}>{text}</NoticePill>)}
                                    </div>
                                )}

                                {/* On phones the CTA is rendered outside this form,
                                    pinned below the sheet — see bookAction. */}
                                {!isMobile && bookAction}
                            </form>
                            )}
                            </div>
                        </div>
                        </div>
                    </BackgroundPanel>

                    {/* The Book bar, phones only. Pinned to the bottom of the
                        viewport with the sheet resting on top of it, so the CTA
                        is reachable at every snap point instead of only once the
                        rider has dragged the sheet up far enough to find it.

                        Same background as the panel and no top rounding, so the
                        two read as one surface with a fixed footer rather than as
                        a bar floating under a card. Its height is measured and
                        handed back as the sheet's bottomInset — nothing here
                        assumes a number. */}
                    {pinBookBar && (
                        <div
                            ref={bookBarRef}
                            className="absolute inset-x-0 bottom-0 z-2 flex justify-center border-t border-[var(--foreground)]/10 bg-panel-gradient px-[7vw] pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
                        >
                            <div className={COL}>{bookAction}</div>
                        </div>
                    )}
                </>
        </div>
    );
};

export default VehicleSelect

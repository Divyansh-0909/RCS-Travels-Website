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

const TrackingPage = () => {
    const phone = useData(state => state.phone)
    const scheduledTime = useData(state => state.scheduledTime)
    const dropLocation = useData(state => state.dropLocation)
    const pickupLocation = useData(state => state.pickupLocation)
    const pickupCoords = useData(state => state.pickupCoords)
    const dropCoords = useData(state => state.dropCoords)
    const routePolyline = useData(state => state.routePolyline)
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
    const pickupTime = "5 mins"
    const dropTime = "30 mins"

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

    const backArrow = (
        <div onClick={() => navigate('/')} className="flex gap-2 sm:gap-3 items-center justify-center cursor-pointer opacity-[0.8] transition-opacity duration-300 hover:opacity-[1] absolute left-5 top-0 sm:fixed sm:left-6 sm:top-6 text-[var(--text)]">
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
                    ? <BackgroundPanel className={"py-6 sm:overflow-hidden justify-center items-center sm:text-left sm:px-[9%] md:px-[5%] xl:px-[13%] flex flex-col sm:flex-row sm:justify-center lg:justify-between"}>
                        {/* Scheduled ride: zoomed-out full route, no driver yet */}
                        {!isMobile && mapVisible && (
                            <GoogleMap center={pickupPoint} zoom={12} onMapReady={setMapApi} className={MAP_CLASSES} />
                        )}
                        <div className="relative z-10 sm:order-1 flex flex-col justify-around items-center sm:items-start pt-6 w-full sm:w-auto sm:h-full gap-6 sm:gap-12">
                            {backArrow}
                            <div className="flex flex-col justify-center items-center sm:items-start gap-1 sm:gap-2 w-[290px]">
                                <h2 className="text-center sm:text-left w-full font-bold">{status === "assigned" ? "Driver has been assigned" : "Driver has not been assigned"}</h2>
                                <h3 className="text-[var(--text-muted)]">{status === "assigned" ? "We suggest contacting the driver" : "Drivers are assigned closer to your pickup time. Check back shortly."}</h3>
                            </div>

                            <div className="flex flex-col justify-center items-start w-[290px] gap-3 sm:gap-4 ">
                                <div className="flex flex-col gap-3 sm:gap-4 justify-center items-start w-full">
                                    <h2 className="font-bold">Ride Details</h2>
                                    <RoutePanel pickup={pickupLocation} drop={dropLocation} />

                                    <div className="w-full flex flex-col gap-1 sm:gap-2 mt-3">
                                        <div className="flex items-center justify-between w-full">
                                            <h3 className="text-[var(--text-muted)]">Fare</h3>
                                            <h3>₹{fare}</h3>
                                        </div>
                                        <div className="flex items-center justify-between w-full">
                                            <h3 className="text-[var(--text-muted)]">Distance</h3>
                                            <h3>30 KM</h3>
                                        </div>
                                        {tollNotice && <div className="mt-2">{tollNotice}</div>}
                                    </div>
                                </div>

                                <Button
                                    className={`${status === "assigned" ? "block" : "hidden"} flex justify-between items-center w-full`}
                                    prop={{ variant: "input", bg: "var(--background-muted)", border: false, innerClassName: "flex justify-between items-center w-full px-4 py-3" }}
                                >
                                    <div className="flex flex-col text-left items-left gap-2 sm:gap-3">
                                        <div className="w-17 h-17 rounded-full overflow-hidden">
                                            <img src={pfpPlaceholder} alt="placeholder" className="w-full h-full object-cover" />
                                        </div>
                                    </div>
                                    <div className="flex flex-col text-right items-right justify-center">
                                        <h4>Driver name</h4>
                                        <h3> UP 16 AB 1234</h3>
                                        <h4 className="text-[var(--text-muted)]">Car name</h4>
                                    </div>
                                </Button>
                                {status === "assigned" && extraFareNotice}
                            </div>

                            <div className="flex flex-col justify-center gap-1 sm:gap-2 w-[290px] items-center">
                                <Button
                                    onClick={() => openSupportWhatsApp("Hi, I need help with my ride.")}
                                    prop={{ variant: "input", width: "290px", bg: "var(--background-muted)", border: false }}
                                >
                                    <span className="flex items-center justify-center gap-2">
                                        <img src={waLogo} alt="WhatsApp" className="w-6 h-6" />
                                        Talk to Support
                                    </span>
                                </Button>
                                <Button
                                    className={`${status === 'assigned' ? "block" : "hidden"} flex gap-1 sm:gap-2 items-center justify-center`}
                                    prop={{ variant: "", width: "290px", innerClassName: "flex gap-2 items-center justify-center" }}
                                >
                                    <Icon path={mdiPhone} size={0.7} />
                                    Call driver
                                </Button>
                            </div>
                        </div>
                    </BackgroundPanel>
                    : status === "completed"
                        ?
                        <BackgroundPanel className={"py-6 h-[100vh] rounded-t-none flex justify-center items-center"}>
                            <div className="relative flex flex-col justify-around items-center w-full h-full sm:h-[70%] gap-6 sm:gap-12">
                                {backArrow}
                                <div className="flex flex-col justify-center items-center gap-1 sm:gap-2 w-[290px]">
                                    { panelState === "noDriver"
                                        ? <ErrorMark className="-mt-2" size={140} />
                                        : <SuccessCheck className="-mt-2" size={140} /> }
                                    <h3 className="text-[var(--text-muted)]">Ride has been completed</h3>
                                    <h2 className="text-center text-2xl font-bold">Fare: ₹{fare}</h2>
                                    {tollNotice && <div className="mt-2 w-full">{tollNotice}</div>}
                                </div>

                                <div className="flex flex-col justify-center items-start w-[290px] gap-3 sm:gap-4 ">
                                    <div className="w-full flex flex-col gap-3 sm:gap-4">
                                        <div className="flex w-full justify-between items-center">
                                            <p className="text-left text-xs">Drop to: <br /> <span className="text-sm text-[var(--text)]">{dropLocation?.slice(0, 20) + '...'}</span></p>
                                            <Button onClick={() => setDetialsVisibility(true)} prop={{ variant: "input", width: "110px", bg: "var(--background-muted)", border: false }} className="cursor-pointer" >
                                                <p>Ride details </p>
                                            </Button>
                                        </div>
                                        <Button
                                            className="flex justify-between items-center w-full"
                                            prop={{ variant: "input", bg: "var(--background-muted)", border: false, innerClassName: "flex justify-between items-center w-full px-4 py-3" }}
                                        >
                                            <div className="flex flex-col text-left items-left gap-2 sm:gap-3">
                                                <div className="w-17 h-17 rounded-full overflow-hidden">
                                                    <img src={pfpPlaceholder} alt="placeholder" className="w-full h-full object-cover" />
                                                </div>
                                            </div>
                                            <div className="flex flex-col text-right items-right justify-center">
                                                <h4>Driver name</h4>
                                                <h3> UP 16 AB 1234</h3>
                                                <h4 className="text-[var(--text-muted)]">Car name</h4>
                                            </div>
                                        </Button>

                                    </div>
                                </div>

                                <div className="flex flex-col justify-center gap-1 sm:gap-2 w-[290px] items-center">
                                    {/* payment happens here, so the dispute
                                        route sits right above the button */}
                                    <div className="mb-2 w-full">{extraFareNotice}</div>
                                    <Button onClick={() => navigate("/")}
                                        className="flex gap-1 sm:gap-2 items-center justify-center"
                                        prop={{ variant: "", width: "290px", innerClassName: "flex gap-2 items-center justify-center" }}
                                    >
                                        Paid to driver
                                    </Button>
                                    <Button
                                        onClick={() => openSupportWhatsApp("Hi, I need help with my ride.")}
                                        prop={{ variant: "input", width: "290px", bg: "var(--background-muted)", border: false }}
                                    >
                                        <span className="flex items-center justify-center gap-2">
                                            <img src={waLogo} alt="WhatsApp" className="w-6 h-6" />
                                            Talk to Support
                                        </span>
                                    </Button>
                                </div>
                            </div>
                        </BackgroundPanel>

                        : <BackgroundPanel className={"py-6 sm:overflow-hidden justify-center items-center flex flex-col sm:flex-row sm:justify-center lg:justify-between sm:text-left sm:px-[9%] md:px-[5%] xl:px-[13%]"}>
                            {/* Live ride: route + the driver's current position */}
                            {!isMobile && mapVisible && (
                                <GoogleMap center={pickupPoint} zoom={12} onMapReady={setMapApi} className={MAP_CLASSES} />
                            )}
                            <div className="relative z-10 sm:order-1 flex flex-col justify-center items-center sm:items-start w-full sm:w-auto gap-6 sm:gap-12">
                                {backArrow}
                                <Button prop={{ variant: "input", bg: "var(--background-muted)", border: false }} className='absolute -top-18 right-3 px-3 sm:hidden block'>
                                    <div className="flex gap-1 flex gap-1 items-center justify-center">
                                        <Icon path={mdiShareVariant} size={0.7} />
                                        <h4>Share</h4>
                                    </div>
                                </Button>
                                <div className="flex flex-col justify-center items-center sm:items-start gap-1 sm:gap-2 w-[290px]">
                                    <h2 className="text-center sm:text-left w-[90%] sm:w-full font-bold">{status === "assigned" ? `Driver has been assigned` : status === "en_route" ? `Driver arriving at ${pickupLocation?.split(",")[0]}` : status === "reached" ? `Meet driver at ${pickupLocation?.split(',')[0]}` : `Driving towards ${dropLocation?.split(',')[0]}`} </h2>
                                    <h3 className="text-[var(--text-muted)] w-[80%] sm:w-full">{status === "assigned" ? `Heading your way` : status === "en_route" ? `Pick up in ${pickupTime}` : status === "reached" ? `Driver has arrived` : `Reaching destination in ${dropTime}`}</h3>
                                </div>

                                <div className="flex flex-col justify-center items-start w-[290px] gap-3 sm:gap-4 ">
                                    <div className="w-full flex flex-col gap-1 sm:gap-2">
                                        <div className={`${status === "en_route" || status === "reached" ? "block" : "hidden"} flex items-center justify-between w-full`}>
                                            <h3 className="text-[var(--text-muted)] text-xl">OTP:</h3>
                                            <h3 className="text-2xl tracking-[0.25em] -mr-[0.25em]">{bookingCode}</h3>
                                        </div>
                                        <div className={`flex flex-col gap-1 sm:gap-2 justify-center items-start w-full ${status === "en_route" || status === "reached" ? "mt-5" : ""}`}>
                                            <Button prop={{ variant: "input", bg: "var(--background-muted)", border: false }} className={`px-3 sm:block hidden`}>
                                                <div className="flex gap-1 items-center justify-center">
                                                    <Icon path={mdiShareVariant} className="text-[var(--text-muted)]" size={0.6} />
                                                    <p>Share</p>
                                                </div>
                                            </Button>
                                            <div className="flex w-full justify-between items-center">
                                                <p className="text-left text-xs">Drop to: <br /> <span className="text-sm text-[var(--text)]">{dropLocation?.slice(0, 20) + '...'}</span></p>
                                                <Button onClick={() => setDetialsVisibility(true)} prop={{ variant: "input", width: "110px", bg: "var(--background-muted)", border: false }} className="cursor-pointer" >
                                                    <p>Ride details </p>
                                                </Button>
                                            </div>


                                        </div>
                                    </div>

                                    <Button
                                        className="flex justify-between items-center w-full"
                                        prop={{ variant: "input", bg: "var(--background-muted)", border: false, innerClassName: "flex justify-between items-center w-full px-4 py-3" }}
                                    >
                                        <div className="flex flex-col text-left items-left gap-2 sm:gap-3">
                                            <div className="w-17 h-17 rounded-full overflow-hidden">
                                                <img src={pfpPlaceholder} alt="placeholder" className="w-20.5 h-20.5 -mt-1 object-cover" />
                                            </div>
                                        </div>
                                        <div className="flex flex-col text-right items-right justify-center">
                                            <h4>Driver name</h4>
                                            <h3> UP 16 AB 1234</h3>
                                            <h4 className="text-[var(--text-muted)]">Car name</h4>
                                        </div>
                                    </Button>
                                    <div className="w-full flex flex-col gap-2">
                                        {tollNotice}
                                        {extraFareNotice}
                                    </div>
                                    <div className="flex justify-between w-[290px] items-center">
                                        <Button
                                            onClick={() => openSupportWhatsApp("Hi, I need help with my ride.")}
                                            prop={{ variant: "input", width: "140px", bg: "var(--background-muted)", border: false }}
                                        >
                                            <span className="flex items-center justify-center gap-2">
                                                <img src={waLogo} alt="WhatsApp" className="w-6 h-6" />
                                                Message
                                            </span>
                                        </Button>
                                        <Button
                                            className="flex gap-1 sm:gap-2 items-center justify-center"
                                            prop={{ variant: "", width: "140px", innerClassName: "flex gap-2 items-center justify-center" }}
                                        >
                                            <Icon path={mdiPhone} size={0.7} />
                                            Call driver
                                        </Button>
                                    </div>
                                </div>

                            </div>
                        </BackgroundPanel>
            }
            {/* ride details */}
            <BackgroundPanel show={detialsVisibility === true} className={`z-3 sm:z-2 gap-6 sm:gap-12 py-6 text-center sm:text-left flex flex-col justify-center items-center`}>
                <RideDetails prop={{bookingId, setLoading, setError, setDetialsVisibility }} />
            </BackgroundPanel>
        </div>
    )
}

export default TrackingPage
import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import GoogleMap, { MAP_LAND_COLOR } from "../components/ui/GoogleMap";
import { MAP_CLASSES, showRouteView, clearRouteView, setDriverPosition, clearDriverMarker } from "../components/ui/mapOverlays";
import BackgroundPanel from "../components/ui/BackgroundPanel";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import FailureState from "../components/ui/FailureState";
import { useIsMobile } from "../hooks/useIsMobile";
import { useRefreshNotice } from "../hooks/useRefreshNotice";
import { getSharedTrip } from "../api/api";
import { LIVE_STATUSES, etaMinutes, minsLabel, formatPlate, placeName } from "../lib/trip";
import { openSupportWhatsApp } from "../constants/support";
import pfpPlaceholder from "../assets/pfp-placeholder.webp";
import waLogo from "../assets/whatsapp-logo.webp";

/* The page a share link opens. Someone who is NOT the rider and has no account
   watching a trip in progress, because the rider asked them to.

   It is deliberately read-only and deliberately thin. Everything here comes from
   GET /api/share/:token, which returns a narrower payload than the rider's own
   status endpoint — no phone numbers, no OTP, no fare, no booking id. There is
   nothing on this screen to press except "message support", because a watcher
   has no authority over someone else's ride and offering them a button that
   looks like it does would be a lie.

   Layout follows TrackingPage, which follows OnBoarding: a map with an opaque
   sheet over it on phones, map beside a 377px column from sm up. */

const COL = "w-[min(86vw,100%)] sm:w-[377px]";
const TITLE = "font-bold text-3xl sm:text-5xl leading-tight";
const SUBTITLE = "text-lg sm:text-2xl font-normal leading-snug text-[var(--text-muted)]";
const PAIR = "gap-0.5 sm:gap-1";

const SHELL = "relative overflow-hidden bg-transparent text-center flex flex-col justify-center items-center w-[100vw] h-[100dvh]";
const FULL_PANEL = "py-6 h-[100dvh] rounded-t-none flex justify-center items-center sm:px-[9%] md:px-[5%] xl:px-[13%]";

// Someone's name in the possessive, without the apostrophe pile-up on names that
// already end in s. Falls back to a neutral phrasing rather than "'s ride" when
// the rider never set a name.
const possessive = (name) => (name ? `${name}${name.endsWith("s") ? "'" : "'s"} ride` : "this ride");

const SharedTrip = () => {
    const { token } = useParams();
    const isMobile = useIsMobile();
    const [trip, setTrip] = useState(null);
    const [loading, setLoading] = useState(true);
    // Set only when there is nothing on screen to fall back to. `gone` is the
    // expired case, which is a different page rather than an error.
    const [error, setError] = useState(null);
    const [gone, setGone] = useState(false);
    const [retryTick, setRetryTick] = useState(0);
    const [mapApi, setMapApi] = useState(null);
    const notifyRefreshFailed = useRefreshNotice(state => state.notifyRefreshFailed);
    const clearRefreshNotice = useRefreshNotice(state => state.clearRefreshNotice);
    // Once per outage, not once per tick — otherwise a watcher on a bad train
    // connection gets a pill whose dismiss timer restarts forever.
    const staleNotifiedRef = useRef(false);

    // Same shape as TrackingPage's poll: scheduled from the response rather than
    // on an interval, so a slow request can never stack up overlapping polls, and
    // it stops entirely once the ride reaches a status that cannot change.
    useEffect(() => {
        let cancelled = false;
        let timer = null;

        async function poll(isFirst) {
            let data;
            try {
                data = await getSharedTrip(token);
            } catch {
                data = { error: "Couldn't reach the server" };
            }
            if (cancelled) return;

            if (data?.error) {
                // A lapsed link is a final answer, not a hiccup — stop polling and
                // say so. 410 is the server distinguishing "this expired" from
                // "this was never a link".
                if (data.code === "SHARE_EXPIRED" || data.status === 410) {
                    setGone(true);
                    setLoading(false);
                    return;
                }
                if (isFirst) setError(data.error);
                else if (!staleNotifiedRef.current) {
                    staleNotifiedRef.current = true;
                    notifyRefreshFailed("Couldn't refresh this trip. Showing the last update we got.");
                }
            } else {
                staleNotifiedRef.current = false;
                setError(null);
                clearRefreshNotice();
                setTrip(data);
            }
            if (isFirst) setLoading(false);

            const status = data?.status;
            if (!cancelled && (!status || LIVE_STATUSES.includes(status) || status === "confirmed")) {
                timer = setTimeout(() => poll(false), 5000);
            }
        }
        poll(true);

        return () => { cancelled = true; clearTimeout(timer); clearRefreshNotice(); };
    }, [token, retryTick]);

    const pickupPoint = trip?.pickup ?? null;
    const dropPoint = trip?.drop ?? null;
    const driverPoint = trip?.driver?.latitude != null && trip?.driver?.longitude != null
        ? { lat: trip.driver.latitude, lng: trip.driver.longitude }
        : null;

    // No map once the trip is over — there is no longer anything moving on it,
    // and a static route to a finished journey is just decoration.
    const mapVisible = !!trip && !trip.ended && !!pickupPoint && !!dropPoint;

    useEffect(() => {
        if (!mapApi || !mapVisible) return;
        showRouteView(mapApi, { pickupPoint, dropPoint });
        return clearRouteView;
    }, [mapApi, mapVisible, isMobile, pickupPoint?.lat, pickupPoint?.lng, dropPoint?.lat, dropPoint?.lng]);

    useEffect(() => {
        if (!mapApi || !mapVisible || !driverPoint) return;
        setDriverPosition(mapApi, driverPoint);
        return clearDriverMarker;
    }, [mapApi, mapVisible, driverPoint?.lat, driverPoint?.lng]);

    const who = trip?.riderName;
    const pickupTime = minsLabel(etaMinutes(driverPoint, pickupPoint));
    const dropTime = minsLabel(etaMinutes(driverPoint, dropPoint));

    // Written for someone who is NOT in the car. The rider's screen says "your
    // driver"; this one names the person being followed, because that is the
    // thing the watcher actually came to check on.
    const headline = (() => {
        switch (trip?.status) {
            case "confirmed":
                return { title: "Driver not assigned yet", detail: "Assigned closer to the pickup time" };
            case "assigned":
                return { title: "Driver assigned", detail: `On the way to ${placeName(trip.pickupAddress)}` };
            case "en_route":
                return { title: <>Driver arriving in <br />{pickupTime}</>, detail: `Meeting ${who ?? "them"} at ${placeName(trip.pickupAddress)}` };
            case "reached":
                return { title: "Driver has arrived", detail: `Waiting at ${placeName(trip.pickupAddress)}` };
            case "started":
                return { title: <>Reaching in <br />{dropTime}</>, detail: `On the way to ${placeName(trip.dropAddress)}` };
            case "completed":
                return { title: "Trip completed", detail: `${who ?? "They"} reached ${placeName(trip.dropAddress)}` };
            case "cancelled":
                return { title: "Ride cancelled", detail: "This trip didn't go ahead" };
            default:
                return { title: "No driver found", detail: "This trip didn't go ahead" };
        }
    })();

    const supportButton = (
        <Button
            onClick={() => openSupportWhatsApp("Hi, I'm following someone's ride on a shared link and need help.")}
            prop={{ variant: "input", width: "100%", bg: "var(--background-muted)" }}
        >
            <span className="flex items-center justify-center gap-2 text-base sm:text-lg">
                <img src={waLogo} alt="WhatsApp" className="w-6 h-6" />
                Message support
            </span>
        </Button>
    );

    if (gone) {
        return (
            <div className={SHELL}>
                <BackgroundPanel className={FULL_PANEL}>
                    <EmptyState
                        tone="dark"
                        title="This link has expired"
                        message="Shared trips stop working after a while. Ask them to send you a fresh link."
                    />
                </BackgroundPanel>
            </div>
        );
    }

    // A bad token and a dead server land here together on purpose: to someone
    // holding a link, "we couldn't open this" is the whole of the useful truth,
    // and the retry costs nothing if it was the second one.
    if (error && !trip) {
        return (
            <div className={SHELL}>
                <BackgroundPanel className={FULL_PANEL}>
                    <FailureState
                        tone="dark"
                        title="Couldn't open this trip"
                        detail={error}
                        onRetry={() => { setError(null); setLoading(true); setRetryTick(t => t + 1); }}
                        retrying={loading}
                        secondaryAction={{
                            label: "Message support",
                            onClick: () => openSupportWhatsApp("Hi, a shared trip link isn't opening for me."),
                        }}
                    />
                </BackgroundPanel>
            </div>
        );
    }

    return (
        <div className={SHELL}>
            {isMobile && mapVisible && (
                <>
                    <div className="absolute inset-0 z-0" style={{ background: MAP_LAND_COLOR }} />
                    <GoogleMap center={pickupPoint} zoom={12} onMapReady={setMapApi} className="absolute inset-0 z-0" />
                </>
            )}

            <BackgroundPanel
                sheet={mapVisible}
                initialSnap="half"
                duration={420}
                contentKey={`${trip?.status}-${loading}`}
                className={"py-6 max-sm:pb-0 sm:overflow-hidden justify-center items-center flex flex-col sm:flex-row sm:justify-center lg:justify-between text-left sm:px-[9%] md:px-[5%] xl:px-[13%]"}
            >
                {!isMobile && mapVisible && (
                    <GoogleMap center={pickupPoint} zoom={12} onMapReady={setMapApi} className={MAP_CLASSES} />
                )}

                <div className="w-full flex-1 min-h-0 flex flex-col items-center sm:contents">
                    <div className="relative z-10 sm:order-1 flex flex-col justify-end sm:justify-center items-center sm:items-start w-full sm:w-auto flex-1 min-h-0 sm:flex-initial sm:h-auto gap-4 sm:gap-8">
                        <div className={`flex flex-col justify-center items-center sm:items-start ${PAIR} ${COL}`}>
                            {/* Whose trip this is, above the headline and small —
                                it is context for everything below rather than the
                                news itself. */}
                            {loading
                                ? <Skeleton className="h-[18px] sm:h-[22px] w-32 mb-1" />
                                : <p className="w-full text-center sm:text-left text-sm sm:text-base text-[var(--text-muted)] mb-1">
                                    You're following {possessive(who)}
                                  </p>}

                            {loading ? (
                                <>
                                    <Skeleton className="h-[30px] sm:h-[48px] w-[75%]" />
                                    <Skeleton className="h-[30px] sm:h-[48px] w-[45%]" />
                                    <Skeleton className="mt-2 h-[22px] sm:h-[30px] w-[65%]" />
                                </>
                            ) : (
                                <>
                                    <h2 className={`text-center sm:text-left w-full ${TITLE}`}>{headline.title}</h2>
                                    <h3 className={`text-center sm:text-left w-full ${SUBTITLE}`}>{headline.detail}</h3>
                                </>
                            )}
                        </div>

                        <div
                            data-sheet-scroll
                            className="w-full min-h-0 flex-1 flex flex-col items-center overscroll-contain sm:contents"
                        >
                            <div className={`flex flex-col justify-center items-start gap-3 max-sm:pb-6 ${COL}`}>
                                {/* The driver card, same shape as the rider's own.
                                    No call button on it: this watcher was given a
                                    link, not the captain's phone number. */}
                                {(loading || trip?.driver) && (
                                    <Button
                                        className={`w-full ${loading ? "pointer-events-none" : ""}`}
                                        prop={{ variant: "input", width: "100%", bg: "var(--background-muted)", innerClassName: "flex justify-between items-center w-full px-4 py-3 gap-3" }}
                                    >
                                        {loading ? (
                                            <Skeleton rounded="rounded-full" className="w-16 h-16 sm:w-20 sm:h-20 shrink-0" />
                                        ) : (
                                            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden shrink-0">
                                                <img
                                                    key={trip.driver.photoUrl ?? "placeholder"}
                                                    src={trip.driver.photoUrl || pfpPlaceholder}
                                                    onError={(e) => { e.currentTarget.src = pfpPlaceholder; }}
                                                    alt=""
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        )}
                                        {loading ? (
                                            <div className="flex flex-col items-end justify-center gap-1">
                                                <Skeleton className="h-[17px] sm:h-[20px] w-24" />
                                                <Skeleton className="h-[22px] sm:h-[30px] w-32" />
                                                <Skeleton className="h-[17px] sm:h-[20px] w-20" />
                                            </div>
                                        ) : (
                                            <div className="flex flex-col text-right justify-center gap-0.5">
                                                <h4 className="text-sm sm:text-base text-[var(--text-muted)] leading-tight">{trip.driver.name}</h4>
                                                <h3 className="text-lg sm:text-2xl font-medium leading-tight">{formatPlate(trip.driver.vehicleNumber)}</h3>
                                                <h4 className="text-sm sm:text-base text-[var(--text-muted)] leading-tight">{trip.driver.vehicleModel}</h4>
                                            </div>
                                        )}
                                    </Button>
                                )}

                                {/* Where they're going. Full addresses rather than
                                    the rider screen's truncation — a watcher has
                                    no other way to see them, and no Ride details
                                    panel to open. */}
                                {!loading && (
                                    <div className="w-full rounded-xl border border-[var(--foreground)]/30 bg-[var(--background-muted)] px-4 py-3 text-left flex flex-col gap-2.5">
                                        <div>
                                            <p className="text-xs sm:text-sm text-[var(--text-muted)] leading-tight">Pickup</p>
                                            <p className="text-sm sm:text-base leading-snug">{trip.pickupAddress}</p>
                                        </div>
                                        <div className="w-full h-px bg-[var(--foreground)]/10" />
                                        <div>
                                            <p className="text-xs sm:text-sm text-[var(--text-muted)] leading-tight">Drop</p>
                                            <p className="text-sm sm:text-base leading-snug">{trip.dropAddress}</p>
                                        </div>
                                    </div>
                                )}

                                {!loading && (
                                    <div className="w-full flex flex-col gap-2 mt-2">
                                        {supportButton}
                                        {/* Says plainly that this is someone else's
                                            ride and that the link is temporary, so
                                            a watcher who bookmarks it isn't
                                            surprised later. */}
                                        <p className="text-xs sm:text-sm text-[var(--text-muted)] leading-snug text-center sm:text-left">
                                            This is a shared view of someone else's trip. The link stops working once it expires.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </BackgroundPanel>
        </div>
    );
};

export default SharedTrip;

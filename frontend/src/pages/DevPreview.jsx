/* ─── EVERY PAGE OF THE PROJECT (dev server: http://localhost:1574) ───────────

   Real routes (auth-gated ones need a Clerk session):
     http://localhost:1574/                 OnBoarding — booking form / current trip
     http://localhost:1574/login            LoginPage
     http://localhost:1574/signup           SignUpPage
     http://localhost:1574/book             VehicleSelect            (auth)
     http://localhost:1574/booking/<id>     TrackingPage             (auth)
     http://localhost:1574/manage-account   ManageAccount            (auth)
     http://localhost:1574/settings         SettingsPage             (auth)
     http://localhost:1574/safety           SafetyPage               (auth)
     http://localhost:1574/help             HelpPage                 (public)
     http://localhost:1574/terms            LegalPage — Terms        (public)
     http://localhost:1574/privacy          LegalPage — Privacy      (public)
     http://localhost:1574/refunds          LegalPage — Refunds      (public)
     http://localhost:1574/grievance        LegalPage — Grievance    (public)
     http://localhost:1574/dashboard        AdminDashboard           (admin)

   Dev previews (no sign-in; this file, dev builds only):
     http://localhost:1574/dev              index of every preview below
     http://localhost:1574/dev/home         OnBoarding, fresh form
     http://localhost:1574/dev/trip         OnBoarding, current-trip card
     http://localhost:1574/dev/vehicle      VehicleSelect (see PREVIEWS for variants)
     http://localhost:1574/dev/tracking     TrackingPage  (see PREVIEWS for variants)
     http://localhost:1574/dev/ride-details RideDetails panel
     http://localhost:1574/dev/account      ManageAccount, section list first
     http://localhost:1574/dev/rides        ManageAccount, straight to Ride History
     http://localhost:1574/dev/settings     SettingsPage
     http://localhost:1574/dev/safety       SafetyPage
     http://localhost:1574/dev/help         HelpPage
     http://localhost:1574/dev/admin        AdminDashboard
     http://localhost:1574/dev/states       EmptyState / FailureState / RefreshNotice
     http://localhost:1574/dev/crash        ErrorBoundary crash test

   The PREVIEWS list below is the source of truth for query-param variants
   (?status=, ?fare=formula, ?scheduled=1, ?safe=1, …) — keep this block in sync.

   ?safe=1 is the one variant that is not purely a store seed: on /dev/vehicle the
   row only exists if the SERVER said this route has a safer alternative, so
   VehicleSelect fakes that verdict from the same param (see DEV_SAFE_ROUTE).

   ?options=1 opens the ride-options panel on /dev/vehicle. It is a click away in
   the app, and a screenshot can't click. */

import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useData } from "../hooks/useData";
import OnBoarding from "./OnBoarding";
import VehicleSelect from "./VehicleSelect";
import TrackingPage from "./TrackingPage";
// The account pages sit behind ProtectedRoute in main.jsx. Rendering them here
// is not a bypass of that gate — this whole route is registered only under
// import.meta.env.DEV and never ships — it just lets their empty/failure states
// be seen without a Clerk session. Their data still comes from the API, so the
// states are driven by stubbing those responses, not by faking them in the page.
import ManageAccount from "./ManageAccount";
import AdminDashboard from "./AdminDashboard";
import SettingsPage from "./SettingsPage";
import SafetyPage from "./SafetyPage";
import HelpPage from "./HelpPage";
import RideDetails from "../components/RideDetails";
import BackgroundPanel from "../components/ui/BackgroundPanel";
import GoogleMap, { MAP_LAND_COLOR } from "../components/ui/GoogleMap";
import { MAP_CLASSES } from "../components/ui/mapOverlays";
import { useIsMobile } from "../hooks/useIsMobile";
import EmptyState from "../components/ui/EmptyState";
import FailureState from "../components/ui/FailureState";
import RefreshNotice from "../components/ui/RefreshNotice";

// Dev-only preview harness — registered in main.jsx behind import.meta.env.DEV.
// Seeds the store with a mock booking and renders any booking-flow screen without
// signing in or running the backend. Visit /dev for an index of all previews.
const MOCK = {
    id: "dev-1",
    code: "4829",
    status: "en_route",
    pickupAddress: "Connaught Place, Block A, New Delhi, Delhi 110001",
    dropAddress: "Noida Sector 18, Atta Market, Noida, Uttar Pradesh 201301",
    pickupCoords: { lat: 28.6315, lng: 77.2167 },
    dropCoords: { lat: 28.5708, lng: 77.3260 },
    distanceKm: 22.4,
    durationMin: 48,
    fare: 300,
    scheduledAt: null,
};

// The whole flow, in the order a rider walks through it.
const PREVIEWS = [
    ["/dev/home", "OnBoarding: fresh booking form"],
    ["/dev/vehicle", "VehicleSelect: choose a ride"],
    ["/dev/vehicle?fare=formula", "VehicleSelect: choose a ride, per-km (tolls pill)"],
    ["/dev/vehicle?safe=1", "VehicleSelect: safer route offered, off"],
    ["/dev/vehicle?options=1", "VehicleSelect: ride options open (popover / sheet)"],
    ["/dev/vehicle?safe=1&options=1", "VehicleSelect: ride options open, all three offered"],
    ["/dev/vehicle?step=confirmLocation", "VehicleSelect: confirm pickup point"],
    ["/dev/vehicle?step=searching", "VehicleSelect: requesting a ride"],
    ["/dev/vehicle?panel=noDriver", "VehicleSelect: no drivers nearby"],
    ["/dev/vehicle?panel=confirmed&scheduled=1", "VehicleSelect: scheduled booking confirmed"],
    ["/dev/tracking?status=assigned", "TrackingPage: driver assigned"],
    ["/dev/tracking?status=en_route&driver=1", "TrackingPage: live map with driver puck"],
    ["/dev/tracking?status=en_route", "TrackingPage: driver arriving (OTP visible)"],
    ["/dev/tracking?status=reached", "TrackingPage: driver has arrived"],
    ["/dev/tracking?status=on_trip", "TrackingPage: driving to destination"],
    ["/dev/tracking?status=on_trip&fare=formula", "TrackingPage: live, per-km (tolls + extra-fare pills)"],
    ["/dev/tracking?status=completed", "TrackingPage: ride completed"],
    ["/dev/tracking?status=completed&fare=formula", "TrackingPage: completed, per-km (both pills)"],
    ["/dev/tracking?status=completed&safe=1", "TrackingPage: completed receipt, safer-route line"],
    ["/dev/tracking?status=confirmed&scheduled=1", "TrackingPage: scheduled, driver not assigned"],
    ["/dev/tracking?status=assigned&scheduled=1", "TrackingPage: scheduled, driver assigned"],
    ["/dev/tracking?status=assigned&scheduled=1&fare=formula", "TrackingPage: scheduled + assigned, per-km (both pills)"],
    ["/dev/trip", 'OnBoarding: live "Current Trip" card'],
    ["/dev/trip?scheduled=1", "OnBoarding: scheduled-ride card"],
    ["/dev/ride-details", "RideDetails panel"],
    ["/dev/ride-details?safe=1", "RideDetails panel: safer-route line item"],
    // Empty / failure / stale states.
    ["/dev/vehicle?route=none", "VehicleSelect: no route set (empty)"],
    ["/dev/tracking?status=none", "TrackingPage: no ride to track (empty)"],
    ["/dev/states", "EmptyState / FailureState / RefreshNotice: both tones"],
    // Auth-gated in the real router; here they render bare so their list states
    // can be driven by whatever the API returns.
    ["/dev/rides", "ManageAccount: Ride History (empty / failure via API)"],
    ["/dev/account", "ManageAccount: opens on the section list (phone menu-first flow)"],
    ["/dev/settings", "SettingsPage: language, notifications, saved places"],
    ["/dev/safety", "SafetyPage: emergency contact, live location, helpline"],
    ["/dev/help", "HelpPage: FAQ, contact, cancellation (also public at /help)"],
    ["/dev/admin", "AdminDashboard: bookings, drivers, users (empty / failure via API)"],
    ["/dev/crash", "ErrorBoundary: deliberate render throw"],
];

// Every variant of the three state components on the two surfaces they have to
// work on: --background (booking flow) and --foreground (account pages). They
// are full-width by design, so each is boxed at the width it actually renders
// at in the app — 290px inside the booking column, wide on the account pages.
const StatesGallery = () => {
    const Box = ({ label, tone, width, children }) => (
        <div className="flex flex-col gap-1">
            <p className="text-xs font-mono text-[var(--text-muted)]">{label}</p>
            <div
                className={`${tone === "light" ? "bg-[var(--foreground)]" : "bg-[var(--background)]"} rounded-xl overflow-hidden border border-[var(--foreground)]/15`}
                // maxWidth, not width: at 390px the fixed 560px boxes ran off
                // the side and the gallery couldn't be read on a phone at all.
                style={{ width: "100%", maxWidth: width }}
            >
                {children}
            </div>
        </div>
    );

    return (
        <div className="min-h-[100dvh] p-8 bg-[var(--background-primary)] text-[var(--text)] flex flex-col gap-8">
            <h2 className="font-bold">State components</h2>

            <div className="flex flex-wrap items-start gap-8">
                <Box label="EmptyState · light · action" tone="light" width={560}>
                    <EmptyState
                        tone="light"
                        title="No rides yet"
                        message="Your trips show up here once you book one, with the driver's details and what you paid."
                        action={{ label: "Book a ride", onClick: () => { } }}
                    />
                </Box>

                <Box label="EmptyState · light · search + clear" tone="light" width={560}>
                    <EmptyState
                        tone="light"
                        glyph="search"
                        title="No rides match your search"
                        message="Try a wider date range, or clear what's set to see every ride."
                        secondaryAction={{ label: "Clear filters", onClick: () => { } }}
                    />
                </Box>

                <Box label="EmptyState · light · no action (admin)" tone="light" width={560}>
                    <EmptyState
                        tone="light"
                        title="No drivers registered yet"
                        message="Drivers appear here once they sign up and submit their vehicle details for approval."
                    />
                </Box>

                <Box label="FailureState · light · retry" tone="light" width={560}>
                    <FailureState
                        tone="light"
                        title="Couldn't load your rides"
                        detail="Server error (503)"
                        onRetry={() => { }}
                    />
                </Box>
            </div>

            {/* 290px is the real booking-flow column width on phones — the
                tightest box any of these has to survive. */}
            <div className="flex flex-wrap items-start gap-8">
                <Box label="EmptyState · dark · 290px col" tone="dark" width={290}>
                    <EmptyState
                        tone="dark"
                        title="No route set"
                        message="Tell us where you're starting from and where you're headed, and we'll price it."
                        action={{ label: "Set your route", onClick: () => { } }}
                    />
                </Box>

                <Box label="EmptyState · dark · both actions" tone="dark" width={290}>
                    <EmptyState
                        tone="dark"
                        title="We don't price this route yet"
                        message="This drop-off isn't on our rate card. Message us and we'll quote it by hand."
                        action={{ label: "Ask us for a fare", onClick: () => { } }}
                        secondaryAction={{ label: "Change your route", onClick: () => { } }}
                    />
                </Box>

                <Box label="FailureState · dark · retry + secondary" tone="dark" width={290}>
                    <FailureState
                        tone="dark"
                        title="Couldn't price this route"
                        detail="Couldn't reach the server to price this route."
                        onRetry={() => { }}
                        secondaryAction={{ label: "Change your route", onClick: () => { } }}
                    />
                </Box>

                <Box label="FailureState · dark · retrying" tone="dark" width={290}>
                    <FailureState
                        tone="dark"
                        title="Couldn't load your ride"
                        detail="Couldn't reach the server"
                        onRetry={() => { }}
                        retrying
                    />
                </Box>
            </div>

            {/* Fixed-position pill, so it lands at the top of the viewport
                rather than inside a box. */}
            <p className="text-xs font-mono text-[var(--text-muted)]">
                RefreshNotice: fixed bottom-centre, shown live below
            </p>
            <RefreshNotice
                notice={{
                    message: "Couldn't refresh your profile. Showing your last saved details.",
                    onRetry: () => { },
                }}
            />
        </div>
    );
};

const DevPreview = () => {
    const { view } = useParams();
    const { search } = useLocation();
    // top level, not inside the ride-details branch — hooks can't be conditional
    const isMobile = useIsMobile();
    // URL the store was last seeded for — a page only mounts after its own seed ran.
    const [seeded, setSeeded] = useState(null);

    useEffect(() => {
        const params = new URLSearchParams(search);
        // ?status=none seeds an empty status, which with no bookingId is how a
        // rider reaches tracking with nothing to track.
        const statusParam = params.get("status");
        const status = statusParam === "none" ? "" : (statusParam || MOCK.status);
        const scheduled = params.get("scheduled")
            ? new Date(Date.now() + 60 * 60 * 1000)
            : null;
        // ?route=none clears the addresses, which is what /book looks like when
        // it is opened directly with nothing in the store.
        const fresh = view === "home" || params.get("route") === "none"; // pre-booking: empty form, no trip card

        const s = useData.getState();
        s.setActiveBooking(fresh ? null : { ...MOCK, status, scheduledAt: scheduled });
        s.setPickup(fresh ? "" : MOCK.pickupAddress);
        s.setDrop(fresh ? "" : MOCK.dropAddress);
        // Coords drive the maps; the polyline is cleared so previews always
        // show the same straight connector instead of a real route left in the
        // store by an earlier /book session.
        s.setPickupCoords(fresh ? null : MOCK.pickupCoords);
        s.setDropCoords(fresh ? null : MOCK.dropCoords);
        s.setRoutePolyline(null);
        s.setDistanceKm(fresh ? null : MOCK.distanceKm);
        s.setDurationMin(fresh ? null : MOCK.durationMin);
        // ?fare=formula → per-km pricing, which is the only source that shows
        // the tolls notice. Default null keeps previews on the all-in quote.
        s.setFareSource(fresh ? null : params.get("fare"));
        // Cleared for the same reason the polyline is: a real booking made
        // earlier in this browser would otherwise leave its toll and carrier
        // itemised under a mock fare they were never part of.
        s.setFareToll(0);
        s.setFareCarrier(0);
        s.setFareAirport(0);
        // ?safe=1 means "this trip has a safer route". On the booking screen that
        // is an OFFER, not a decision — opting in is the rider's move — so the
        // toggle starts off and off is the state the preview lands on. Past
        // booking there is no toggle to read it off, so the same param means the
        // ride took it and the fare carries the fee.
        //
        // Written on every seed either way, for the same reason the add-ons above
        // are cleared: it is a sticky store flag, so a real booking made earlier
        // in this browser would otherwise have tracking and ride details itemise
        // a ₹150 detour under a mock fare that never included one.
        s.setSafeRoute(params.get("safe") === "1" && view !== "vehicle");
        s.setFare(MOCK.fare);
        s.setStatus(status);
        s.setBookingCode(MOCK.code);
        // A set bookingId would make TrackingPage fetch the backend on mount.
        s.setBookingId(null);
        s.setScheduledTime(scheduled);
        s.setDevAuthBypass(true);
        // ManageAccount picks its opening tab from this key, so the preview
        // lands straight on Ride History rather than Account information.
        if (view === "rides") sessionStorage.setItem("manageAccountTab", "Ride History");
        setSeeded(view + search);
    }, [view, search]);

    if (view && seeded !== view + search) return null;

    // key remounts the page between previews so internal state resets.
    // Deliberate render throw, so the ErrorBoundary above RouterProvider can be
    // seen without breaking a real page. Dev-only, like everything on this route.
    if (view === "crash") throw new Error("Deliberate crash from /dev/crash");
    if (view === "states") return <StatesGallery />;
    // view in the key: /dev/rides and /dev/account render the same component,
    // and without a remount the rides tab would survive the switch between them.
    if (view === "rides" || view === "account") return <ManageAccount key={view + search} />;
    if (view === "settings") return <SettingsPage />;
    if (view === "safety") return <SafetyPage />;
    if (view === "help") return <HelpPage />;
    if (view === "admin") return <AdminDashboard key={search} />;
    if (view === "home" || view === "trip") return <OnBoarding key={view + search} />;
    if (view === "vehicle") return <VehicleSelect key={search} />;
    if (view === "tracking") return <TrackingPage key={search} />;

    // The map has to come with it, exactly as TrackingPage and VehicleSelect mount
    // it — desktop map beside the column, land-coloured one under the mobile sheet.
    // A bare panel reads as the real screen missing its map.
    if (view === "ride-details")
        return (
            <div className="relative w-[100vw] h-[100dvh]">
                {isMobile && (
                    <>
                        <div className="absolute inset-0 z-0" style={{ background: MAP_LAND_COLOR }} />
                        <GoogleMap center={MOCK.pickupCoords} zoom={12} className="absolute inset-0 z-0" />
                    </>
                )}
                <BackgroundPanel className="z-3 sm:z-2 py-6 sm:overflow-hidden text-left flex flex-col sm:flex-row justify-center items-center sm:justify-center lg:justify-between sm:px-[9%] md:px-[5%] xl:px-[13%]">
                    {!isMobile && (
                        <GoogleMap center={MOCK.pickupCoords} zoom={12} className={MAP_CLASSES} />
                    )}
                    <RideDetails
                        prop={{
                            bookingId: MOCK.id,
                            setLoading: () => {},
                            setError: () => {},
                            setDetialsVisibility: () => {},
                        }}
                    />
                </BackgroundPanel>
            </div>
        );

    // /dev or an unknown view → index of every preview.
    return (
        <div className="min-h-[100dvh] p-8 flex flex-col items-start gap-2 bg-[var(--background-primary)] text-[var(--text)]">
            <h2 className="font-bold mb-2">Booking-flow previews</h2>
            {view && <p className="mb-2 text-[var(--text-muted)]">Unknown preview: {view}</p>}
            {PREVIEWS.map(([to, label]) => (
                <Link key={to} to={to} className="underline text-left">
                    {to} <span className="text-[var(--text-muted)]">{label}</span>
                </Link>
            ))}
        </div>
    );
};

export default DevPreview;

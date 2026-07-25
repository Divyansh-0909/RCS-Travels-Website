import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useData } from "../hooks/useData";
import OnBoarding from "./OnBoarding";
import VehicleSelect from "./VehicleSelect";
import TrackingPage from "./TrackingPage";
import RideDetails from "../components/RideDetails";
import BackgroundPanel from "../components/ui/BackgroundPanel";

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
    ["/dev/home", "OnBoarding — fresh booking form"],
    ["/dev/vehicle", "VehicleSelect — choose a ride"],
    ["/dev/vehicle?fare=formula", "VehicleSelect — choose a ride, per-km (tolls pill)"],
    ["/dev/vehicle?step=confirmLocation", "VehicleSelect — confirm pickup point"],
    ["/dev/vehicle?step=searching", "VehicleSelect — requesting a ride"],
    ["/dev/vehicle?panel=noDriver", "VehicleSelect — no drivers nearby"],
    ["/dev/vehicle?panel=confirmed&scheduled=1", "VehicleSelect — scheduled booking confirmed"],
    ["/dev/tracking?status=assigned", "TrackingPage — driver assigned"],
    ["/dev/tracking?status=en_route&driver=1", "TrackingPage — live map with driver puck"],
    ["/dev/tracking?status=en_route", "TrackingPage — driver arriving (OTP visible)"],
    ["/dev/tracking?status=reached", "TrackingPage — driver has arrived"],
    ["/dev/tracking?status=on_trip", "TrackingPage — driving to destination"],
    ["/dev/tracking?status=on_trip&fare=formula", "TrackingPage — live, per-km (tolls + extra-fare pills)"],
    ["/dev/tracking?status=completed", "TrackingPage — ride completed"],
    ["/dev/tracking?status=completed&fare=formula", "TrackingPage — completed, per-km (both pills)"],
    ["/dev/tracking?status=confirmed&scheduled=1", "TrackingPage — scheduled, driver not assigned"],
    ["/dev/tracking?status=assigned&scheduled=1", "TrackingPage — scheduled, driver assigned"],
    ["/dev/tracking?status=assigned&scheduled=1&fare=formula", "TrackingPage — scheduled + assigned, per-km (both pills)"],
    ["/dev/trip", 'OnBoarding — live "Current Trip" card'],
    ["/dev/trip?scheduled=1", "OnBoarding — scheduled-ride card"],
    ["/dev/ride-details", "RideDetails panel"],
];

const DevPreview = () => {
    const { view } = useParams();
    const { search } = useLocation();
    // URL the store was last seeded for — a page only mounts after its own seed ran.
    const [seeded, setSeeded] = useState(null);

    useEffect(() => {
        const params = new URLSearchParams(search);
        const status = params.get("status") || MOCK.status;
        const scheduled = params.get("scheduled")
            ? new Date(Date.now() + 60 * 60 * 1000)
            : null;
        const fresh = view === "home"; // pre-booking: empty form, no trip card

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
        s.setFare(MOCK.fare);
        s.setStatus(status);
        s.setBookingCode(MOCK.code);
        // A set bookingId would make TrackingPage fetch the backend on mount.
        s.setBookingId(null);
        s.setScheduledTime(scheduled);
        s.setDevAuthBypass(true);
        setSeeded(view + search);
    }, [view, search]);

    if (view && seeded !== view + search) return null;

    // key remounts the page between previews so internal state resets.
    if (view === "home" || view === "trip") return <OnBoarding key={view + search} />;
    if (view === "vehicle") return <VehicleSelect key={search} />;
    if (view === "tracking") return <TrackingPage key={search} />;

    if (view === "ride-details")
        return (
            <div className="relative w-[100vw] h-[100vh]">
                <BackgroundPanel className="z-3 gap-6 sm:gap-12 py-6 text-center sm:text-left flex flex-col justify-center items-center">
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
        <div className="min-h-[100vh] p-8 flex flex-col items-start gap-2 bg-[var(--background-primary)] text-[var(--text)]">
            <h2 className="font-bold mb-2">Booking-flow previews</h2>
            {view && <p className="mb-2 text-[var(--text-muted)]">Unknown preview: {view}</p>}
            {PREVIEWS.map(([to, label]) => (
                <Link key={to} to={to} className="underline text-left">
                    {to} <span className="text-[var(--text-muted)]">— {label}</span>
                </Link>
            ))}
        </div>
    );
};

export default DevPreview;

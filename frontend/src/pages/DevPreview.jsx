import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useData } from "../hooks/useData";
import OnBoarding from "./OnBoarding";
import VehicleSelect from "./VehicleSelect";
import TrackingPage from "./TrackingPage";
import RideDetails from "../components/RideDetails";
import BackgroundPanel from "../components/ui/BackgroundPanel";

// Dev-only preview harness — registered in main.jsx behind import.meta.env.DEV.
// Seeds the store with a mock booking and renders every booking-flow screen so
// they can be inspected and screenshotted without signing in or running the
// backend. Visit /dev for a clickable index of all previews.
//   /dev/home                             → OnBoarding, fresh form (no active booking)
//   /dev/trip[?scheduled=1]               → OnBoarding with the live/scheduled trip card
//   /dev/vehicle[?step=searching|panel=…] → VehicleSelect (see its dev params)
//   /dev/tracking?status=…[&scheduled=1]  → TrackingPage in any booking status
//   /dev/ride-details                     → the RideDetails panel
const MOCK = {
    id: "dev-1",
    code: "4829",
    status: "en_route",
    pickupAddress: "Connaught Place, Block A, New Delhi, Delhi 110001",
    dropAddress: "Noida Sector 18, Atta Market, Noida, Uttar Pradesh 201301",
    fare: 300,
    scheduledAt: null,
};

// The whole flow, in the order a rider walks through it.
const PREVIEWS = [
    ["/dev/home", "OnBoarding — fresh booking form"],
    ["/dev/vehicle", "VehicleSelect — choose a ride"],
    ["/dev/vehicle?step=searching", "VehicleSelect — requesting a ride"],
    ["/dev/vehicle?panel=noDriver", "VehicleSelect — no drivers nearby"],
    ["/dev/vehicle?panel=confirmed&scheduled=1", "VehicleSelect — scheduled booking confirmed"],
    ["/dev/tracking?status=assigned", "TrackingPage — driver assigned"],
    ["/dev/tracking?status=en_route", "TrackingPage — driver arriving (OTP visible)"],
    ["/dev/tracking?status=reached", "TrackingPage — driver has arrived"],
    ["/dev/tracking?status=on_trip", "TrackingPage — driving to destination"],
    ["/dev/tracking?status=completed", "TrackingPage — ride completed"],
    ["/dev/tracking?status=confirmed&scheduled=1", "TrackingPage — scheduled, driver not assigned"],
    ["/dev/tracking?status=assigned&scheduled=1", "TrackingPage — scheduled, driver assigned"],
    ["/dev/trip", 'OnBoarding — live "Current Trip" card'],
    ["/dev/trip?scheduled=1", "OnBoarding — scheduled-ride card"],
    ["/dev/ride-details", "RideDetails panel"],
];

const DevPreview = () => {
    const { view } = useParams();
    const { search } = useLocation();
    // Tracks which URL the store was last seeded for, so a page only mounts
    // after its own seed ran (not against a previous preview's state).
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
        s.setDrop(fresh ? null : MOCK.dropAddress);
        s.setFare(MOCK.fare);
        s.setStatus(status);
        s.setBookingCode(MOCK.code);
        // Never carry a bookingId between previews — a set id makes
        // TrackingPage fetch the backend on mount.
        s.setBookingId(null);
        s.setScheduledTime(scheduled);
        s.setDevAuthBypass(true);
        setSeeded(view + search);
    }, [view, search]);

    if (view && seeded !== view + search) return null;

    // key remounts the page when hopping between previews so internal state
    // (steps, panels) resets to what the new URL's params ask for.
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

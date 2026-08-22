import Icon from '@mdi/react';
import { useState } from "react";
import { mdiKeyboardBackspace } from '@mdi/js';
import Button from "./ui/Button";
import { useData } from "../hooks/useData";
import { useApi } from "../hooks/useApi";
import waLogo from '../assets/whatsapp-logo.webp';
import { openSupportWhatsApp } from "../constants/support";
import RoutePanel from "./ui/RoutePanel";
import { SAFE_ROUTE_SURCHARGE } from "../constants/fares";

// Keep the customer site's dark palette while following the captain app's
// compact detail structure: route, quick facts, then a separate fare summary.
const COL = "w-[min(86vw,100%)] sm:w-[377px]";
const CARD = "rounded-2xl bg-[var(--background-muted)] p-5";
const FARE_LINE = "text-sm sm:text-base font-medium";

const RideDetails = ({ prop }) => {
    const bookingId = useData(state => state.bookingId);
    const api = useApi();
    const pickupLocation = useData(state => state.pickupLocation);
    const dropLocation = useData(state => state.dropLocation);
    const fare = useData(state => state.fare);
    const distanceKm = useData(state => state.distanceKm);
    const durationMin = useData(state => state.durationMin);
    const safeRoute = useData(state => state.safeRoute);
    const cancellationCharge = useData(state => state.cancellationCharge);
    const [confirmCancel, setConfirmCancel] = useState(false);
    const surcharge = safeRoute ? SAFE_ROUTE_SURCHARGE : 0;
    // Both are the amounts the estimate actually charged, saved at booking time:
    // the carrier is waived on the pricier routes, so its sticker price would be
    // the wrong thing to subtract here.
    const toll = useData(state => state.fareToll);
    const carrier = useData(state => state.fareCarrier);
    const airport = useData(state => state.fareAirport);
    const baseFare = fare != null ? fare - surcharge - toll - carrier - airport : null;

    // One id for both the guard and the call. The two sources disagree in each
    // direction: the searching panel mounts this without the prop while the
    // store holds the id, and /booking/:id after a reload has the prop but no
    // store id (it isn't persisted). Guarding on one and sending the other
    // refused a cancellable ride on the first and sent `undefined` on the second.
    const cancelId = prop.bookingId ?? bookingId;

    async function handleCancel(e) {
        e.preventDefault();

        try {
            prop.setError(null);
            prop.setLoading(true);
            if (!cancelId) {
                prop.setError("No active ride to cancel");
                return;
            }

            const data = await api.cancelBooking(cancelId, cancellationCharge);

            if (data?.error) {
                if (data.code === "CANCELLATION_AMOUNT_CHANGED") {
                    useData.getState().setCancellationCharge(data.cancellationCharge ?? 0);
                    setConfirmCancel(false);
                    prop.setError(data.error);
                    return;
                }
                prop.setError("Can't cancel ride");
                return;
            }
            if (data.ok) {
                // The landing-page outcome panel must show what the server
                // actually settled, not the quote that happened to be on screen
                // before the request. The disposition explains whether a paid
                // advance was retained or is on its way back.
                sessionStorage.setItem("rideCancelled", JSON.stringify({
                    cancellationCharge: data.cancellationCharge ?? 0,
                    advanceDisposition: data.advanceDisposition ?? null,
                    refundStatus: data.refund?.status ?? null,
                }));
                window.location.href = '/';
            }
        } catch (err) {
            console.error(err);
            prop.setError("Something went wrong");
        } finally {
            prop.setLoading(false);
        }
    }

    return (
        <div className="z-10 flex w-full flex-col items-center gap-4 text-left sm:order-1 sm:h-[100dvh] sm:w-auto sm:justify-center sm:overflow-y-auto sm:py-6">
            <button
                type="button"
                aria-label="Back"
                onClick={() => prop.setDetialsVisibility(false)}
                className="flex items-center justify-center text-[var(--text)] outline-none transition-colors max-sm:absolute max-sm:-top-12 max-sm:left-4 max-sm:z-20 max-sm:my-1 max-sm:h-9 max-sm:rounded-full max-sm:bg-[var(--background-muted)] max-sm:px-3 max-sm:shadow-[0_4px_20px_2px_rgba(0,0,0,0.5)] max-sm:hover:bg-[var(--background-primary)] sm:fixed sm:top-6 sm:left-6 sm:h-9 sm:w-9 sm:rounded-xl sm:opacity-80 sm:hover:bg-[var(--foreground)]/10 sm:hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]/70"
            >
                <Icon path={mdiKeyboardBackspace} size={1.05} />
            </button>
            <div className={`flex items-center justify-start ${COL}`}>
                <h2 className="text-xl font-semibold leading-tight tracking-[-0.03em] sm:text-2xl">Ride Details</h2>
            </div>

            <div className={`${CARD} flex flex-col gap-4 ${COL}`}>
                <RoutePanel plain size="sm" pickup={pickupLocation} drop={dropLocation} />

                {(distanceKm != null || durationMin != null) && (
                    <div className="flex items-center gap-2 pl-6">
                        {durationMin != null && (
                            <span className="rounded-xl bg-[var(--background-primary)] px-2.5 py-1.5 text-sm font-semibold">
                                {durationMin} min
                            </span>
                        )}
                        {distanceKm != null && (
                            <span className="rounded-xl bg-[var(--background-primary)] px-2.5 py-1.5 text-sm font-semibold">
                                {Math.round(distanceKm * 10) / 10} km
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div className={`flex flex-col gap-2 ${COL}`}>
                <p className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Ride summary</p>
                <div className={`${CARD} flex flex-col gap-3`}>
                    <div className="flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-3">
                            <span className={FARE_LINE}>Base fare</span>
                            <span className={FARE_LINE}>₹{baseFare}</span>
                        </div>
                        {safeRoute && (
                            <div className="flex items-start justify-between gap-3">
                                <span className={FARE_LINE}>Safer route</span>
                                <span className={FARE_LINE}>₹{surcharge}</span>
                            </div>
                        )}
                        {toll > 0 && (
                            <div className="flex items-start justify-between gap-3">
                                <span className={FARE_LINE}>Highway toll</span>
                                <span className={FARE_LINE}>₹{toll}</span>
                            </div>
                        )}
                        {airport > 0 && (
                            <div className="flex items-start justify-between gap-3">
                                <span className={FARE_LINE}>Airport pickup</span>
                                <span className={FARE_LINE}>₹{airport}</span>
                            </div>
                        )}
                        {carrier > 0 && (
                            <div className="flex items-start justify-between gap-3">
                                <span className={FARE_LINE}>Roof carrier</span>
                                <span className={FARE_LINE}>₹{carrier}</span>
                            </div>
                        )}
                    </div>

                    <div className="h-px w-full bg-[var(--foreground)]/10" />

                    <div className="flex items-center justify-between gap-3">
                        <span className="text-xl font-semibold">Total</span>
                        <span className="text-xl font-semibold">₹{fare}</span>
                    </div>
                </div>
            </div>

            <div className={`flex flex-col items-center gap-2 sm:items-start ${COL}`}>
                <Button
                    onClick={() => openSupportWhatsApp("Hi, I need help with my ride.")}
                    prop={{ variant: "input", width: "100%", bg: "var(--background-muted)", border: false }}
                >
                    <span className="flex items-center justify-center gap-2 text-base sm:text-lg">
                        <img src={waLogo} alt="WhatsApp" className="h-6 w-6" />
                        Talk to support
                    </span>
                </Button>
                {/* The charge is computed server-side and refreshed by the
                    tracking poll, so this number is exactly what gets billed.
                    Two taps required: cancelling costs money at this point, and
                    a single mis-tap shouldn't. */}
                {cancellationCharge > 0 && (
                    <p className="text-left text-xs leading-snug text-[var(--text-muted)] sm:text-sm">
                        Cancelling now retains <span className="text-[var(--text)]">₹{cancellationCharge}</span> from
                        your scheduled advance for the driver. It is not a second charge.
                    </p>
                )}
                <Button
                    onClick={!confirmCancel
                        ? (e) => { e.preventDefault(); setConfirmCancel(true); }
                        : handleCancel}
                    prop={{ variant: "negative", width: "100%" }}
                >
                    <span className="text-base sm:text-lg">
                        {confirmCancel
                            ? cancellationCharge > 0 ? `Yes, cancel and pay ₹${cancellationCharge}` : "Yes, cancel this ride"
                            : "Cancel ride"}
                    </span>
                </Button>
            </div>
        </div>
    );
};

export default RideDetails;

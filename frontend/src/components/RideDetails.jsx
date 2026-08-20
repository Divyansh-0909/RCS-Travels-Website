import Icon from '@mdi/react';
import { useState } from "react";
import { mdiKeyboardBackspace } from '@mdi/js';
import Button from "./ui/Button";
import { useData } from "../hooks/useData";
import { useApi } from "../hooks/useApi";
import { useViewNavigate } from "../hooks/useViewNavigate";
import waLogo from '../assets/whatsapp-logo.webp';
import { openSupportWhatsApp } from "../constants/support";
import RoutePanel from "./ui/RoutePanel";
import { statusLabels } from "../constants/statusLabels";
import { SAFE_ROUTE_SURCHARGE } from "../constants/fares";

// Same layout + type scale as VehicleSelect / TrackingPage: a real 377px
// desktop column (OnBoarding's effective control width) instead of a scale
// transform, with one rhythm for pairs, groups and stacks.
const COL = "w-[min(86vw,100%)] sm:w-[377px]";
const TITLE = "font-bold text-3xl sm:text-5xl leading-tight";
const SUBTITLE = "text-lg sm:text-2xl font-normal leading-snug text-[var(--text-muted)]";
const META = "text-base sm:text-xl";
const STACK = "gap-6 sm:gap-8";
const GROUP = "gap-2 sm:gap-3";
const PAIR = "gap-0.5 sm:gap-1";

const RideDetails = ({ prop }) => {
    const bookingId = useData(state => state.bookingId);
    const setBookingId = useData(state => state.setBookingId);
    const api = useApi()
    const navigate = useViewNavigate();
    const pickupLocation = useData(state => state.pickupLocation);
    const setPickup = useData(state => state.setPickup);
    const dropLocation = useData(state => state.dropLocation);
    const setDrop = useData(state => state.setDrop);
    const setActiveBooking = useData(state => state.setActiveBooking);
    const fare = useData(state => state.fare);
    const status = useData(state => state.status);
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
                prop.setError("No active ride to cancel")
                return
            }

            const data = await api.cancelBooking(cancelId, cancellationCharge)

            if (data?.error) {
                if (data.code === "CANCELLATION_AMOUNT_CHANGED") {
                    useData.getState().setCancellationCharge(data.cancellationCharge ?? 0)
                    setConfirmCancel(false)
                    prop.setError(data.error)
                    return
                }
                prop.setError("Can't cancel ride")
                return
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
                }))
                window.location.href = '/'
            }
        } catch (err) {
            console.error(err);
            prop.setError("Something went wrong");
        } finally {
            prop.setLoading(false);
        }
    }

    // sm:relative, not relative: on mobile this column must NOT be the offset
    // parent, so the arrow inside resolves against the surrounding
    // BackgroundPanel and can float above the sheet like every other screen's.
    // z-10 still applies — it is a flex item of that panel.
    return (
        <div className={`sm:relative z-10 sm:order-1 flex flex-col justify-center items-center sm:items-start text-left w-full sm:w-auto sm:h-[100dvh] ${STACK}`}>
            {/* same treatment as TrackingPage's backArrow: a pill over the map
                just above the sheet on mobile, a bare glyph fixed to the
                panel's top-left corner on desktop */}
            <div onClick={() => prop.setDetialsVisibility(false)} className="max-sm:absolute max-sm:z-20 max-sm:-top-12 max-sm:left-4 max-sm:h-9 max-sm:my-1 max-sm:px-3 max-sm:rounded-full max-sm:border max-sm:border-[var(--foreground)]/30 max-sm:bg-[var(--background-muted)] max-sm:shadow-[0_4px_20px_2px_rgba(0,0,0,0.5)] flex items-center justify-center cursor-pointer sm:opacity-[0.8] transition-opacity duration-300 hover:opacity-[1] text-[var(--text)] sm:fixed sm:left-6 sm:top-6">
                <Icon path={mdiKeyboardBackspace} size={1.2} />
            </div>
            <div className={`flex flex-col justify-center items-center sm:items-start ${PAIR} ${COL}`}>
                <h2 className={`w-full text-center sm:text-left ${TITLE}`}>Ride Details</h2>
                <h3 className={`w-full text-center sm:text-left ${SUBTITLE}`}>{statusLabels[status] || status}</h3>
            </div>
            <div className={`flex flex-col justify-center items-start ${GROUP} ${COL}`}>
                <RoutePanel size="sm" pickup={pickupLocation} drop={dropLocation}>
                    {distanceKm != null && (
                        <div className="flex items-center justify-between w-full">
                            <h4 className={`${META} text-[var(--text-muted)]`}>Distance</h4>
                            <h4 className={META}>{Math.round(distanceKm * 10) / 10} km</h4>
                        </div>
                    )}
                    {durationMin != null && (
                        <div className="flex items-center justify-between w-full">
                            <h4 className={`${META} text-[var(--text-muted)]`}>Ride time</h4>
                            <h4 className={META}>{durationMin} min</h4>
                        </div>
                    )}

                    <div className="w-full h-px bg-[var(--foreground)]/10 my-1" />

                    <div className="flex items-center justify-between w-full">
                        <h4 className={`${META} text-[var(--text-muted)]`}>Base fare</h4>
                        <h4 className={META}>₹{baseFare}</h4>
                    </div>
                    {safeRoute && (
                        <div className="flex items-center justify-between w-full">
                            <h4 className={`${META} text-[var(--text-muted)]`}>Safer route</h4>
                            <h4 className={META}>₹{surcharge}</h4>
                        </div>
                    )}
                    {toll > 0 && (
                        <div className="flex items-center justify-between w-full">
                            <h4 className={`${META} text-[var(--text-muted)]`}>Highway toll</h4>
                            <h4 className={META}>₹{toll}</h4>
                        </div>
                    )}
                    {airport > 0 && (
                        <div className="flex items-center justify-between w-full">
                            <h4 className={`${META} text-[var(--text-muted)]`}>Airport pickup</h4>
                            <h4 className={META}>₹{airport}</h4>
                        </div>
                    )}
                    {carrier > 0 && (
                        <div className="flex items-center justify-between w-full">
                            <h4 className={`${META} text-[var(--text-muted)]`}>Roof carrier</h4>
                            <h4 className={META}>₹{carrier}</h4>
                        </div>
                    )}
                    <div className="flex items-center justify-between w-full">
                        <h4 className={`${META} font-semibold`}>Total</h4>
                        <h4 className={`${META} font-semibold`}>₹{fare}</h4>
                    </div>
                </RoutePanel>
            </div>
            <div className={`flex flex-col justify-center items-center sm:items-start gap-3 ${COL}`}>
                <Button
                    onClick={() => openSupportWhatsApp("Hi, I need help with my ride.")}
                    prop={{ variant: "input", width: "100%", bg: "var(--background-muted)" }}
                >
                    <span className="flex items-center justify-center gap-2 text-base sm:text-lg">
                        <img src={waLogo} alt="WhatsApp" className="w-6 h-6" />
                        Talk to support
                    </span>
                </Button>
                {/* The charge is computed server-side and refreshed by the
                    tracking poll, so this number is exactly what gets billed.
                    Two taps required: cancelling costs money at this point, and
                    a single mis-tap shouldn't. */}
                {cancellationCharge > 0 && (
                    <p className="text-xs sm:text-sm text-left text-[var(--text-muted)] leading-snug">
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
    )
}

export default RideDetails

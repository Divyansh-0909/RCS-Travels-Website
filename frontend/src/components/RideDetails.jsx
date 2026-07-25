import Icon from '@mdi/react';
import { mdiKeyboardBackspace } from '@mdi/js';
import Button from "./ui/Button";
import { useData } from "../hooks/useData";
import { useApi } from "../hooks/useApi";
import { useViewNavigate } from "../hooks/useViewNavigate";
import waLogo from '../assets/whatsapp-logo.webp';
import { openSupportWhatsApp } from "../constants/support";
import RoutePanel from "./ui/RoutePanel";
import { statusLabels } from "../constants/statusLabels";

// Must match VehicleSelect's SAFE_ROUTE_SURCHARGE — the breakdown backs the
// safer-route add-on out of the stored total.
const SAFE_ROUTE_SURCHARGE = 150;

// Same layout + type scale as VehicleSelect / TrackingPage: a real 377px
// desktop column (OnBoarding's effective control width) instead of a scale
// transform, with one rhythm for pairs, groups and stacks.
const COL = "w-[290px] sm:w-[377px]";
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
    const surcharge = safeRoute ? SAFE_ROUTE_SURCHARGE : 0;
    const baseFare = fare != null ? fare - surcharge : null;

    async function handleCancel(e) {
        e.preventDefault();

        try {
            prop.setError(null);
            prop.setLoading(true);
            if (!prop.bookingId) {
                prop.setError("No active ride to cancel")
                return
            }

            const data = await api.cancelBooking(bookingId)

            if (data?.error) {
                prop.setError("Can't cancel ride")
                return
            }
            if (data.ok) {
                sessionStorage.setItem("rideCancelled", "1")
                window.location.href = '/'
            }
        } catch (err) {
            console.error(err);
            prop.setError("Something went wrong");
        } finally {
            prop.setLoading(false);
        }
    }

    return (
        <div className={`relative z-10 sm:order-1 flex flex-col justify-center items-center sm:items-start text-left w-full sm:w-auto sm:h-[100vh] ${STACK}`}>
            {/* same anchor as TrackingPage's arrow: in the sheet on mobile,
                the panel's top-left corner on desktop — the column is w-auto
                here, so an absolute left-5 would track the content instead */}
            <div onClick={() => prop.setDetialsVisibility(false)} className="flex gap-2 sm:gap-2 items-center cursor-pointer opacity-[0.8] transition-opacity duration-300 hover:opacity-[1] justify-center absolute left-5 top-0 sm:fixed sm:left-6 sm:top-6 text-[var(--text)]">
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
                <Button onClick={handleCancel} prop={{ variant: "negative", width: "100%" }}>
                    <span className="text-base sm:text-lg">Cancel ride</span>
                </Button>
            </div>
        </div>
    )
}

export default RideDetails

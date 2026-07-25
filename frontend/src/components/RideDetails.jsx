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
        <div className="relative flex flex-col justify-center items-center sm:items-start sm:text-left sm:px-[9%] md:px-[5%] xl:px-[13%] sm:h-[100vh] w-full gap-6 sm:gap-12">
            <div onClick={() => prop.setDetialsVisibility(false)} className="flex gap-2 sm:gap-3 items-center cursor-pointer opacity-[0.8] transition-opacity duration-300 hover:opacity-[1] justify-center absolute left-5 top-0 text-[var(--text)]">
                <Icon path={mdiKeyboardBackspace} size={1.2} />
            </div>
            <div className="flex flex-col justify-center items-center sm:items-start gap-1 sm:gap-2 w-[290px]">
                <h2 className="font-bold">Ride Details</h2>
                <h3 className="text-[var(--text-muted)]">{statusLabels[status] || status}</h3>
            </div>
            <div className="flex flex-col justify-center items-start w-[290px] gap-3 sm:gap-4 ">
                <RoutePanel size="sm" pickup={pickupLocation} drop={dropLocation}>
                    <div className="flex items-center justify-between w-full">
                        <h4 className="text-base sm:text-lg text-[var(--text-muted)]">Fare</h4>
                        <h4 className="text-base sm:text-lg">₹{fare}</h4>
                    </div>
                    {distanceKm != null && (
                        <div className="flex items-center justify-between w-full">
                            <h4 className="text-base sm:text-lg text-[var(--text-muted)]">Distance</h4>
                            <h4 className="text-base sm:text-lg">{Math.round(distanceKm * 10) / 10} km</h4>
                        </div>
                    )}
                    {durationMin != null && (
                        <div className="flex items-center justify-between w-full">
                            <h4 className="text-base sm:text-lg text-[var(--text-muted)]">Ride time</h4>
                            <h4 className="text-base sm:text-lg">{durationMin} min</h4>
                        </div>
                    )}
                </RoutePanel>
            </div>
            <div className="flex flex-col justify-center items-center sm:items-start gap-2 sm:gap-3">
                <Button
                    onClick={() => openSupportWhatsApp("Hi, I need help with my ride.")}
                    prop={{ variant: "input", width: "290px", bg: "var(--background-muted)", border: false }}
                >
                    <span className="flex items-center justify-center gap-2">
                        <img src={waLogo} alt="WhatsApp" className="w-6 h-6" />
                        Talk to support
                    </span>
                </Button>
                <Button onClick={handleCancel} prop={{ variant: "negative" }}>Cancel ride</Button>
            </div>
        </div>
    )
}

export default RideDetails
import Icon from '@mdi/react';
import { mdiKeyboardBackspace } from '@mdi/js';
import Button from "./ui/Button";
import { useData } from "../hooks/useData";
import { useApi } from "../hooks/useApi";
import { useViewNavigate } from "../hooks/useViewNavigate";
import dashedLine from '../assets/dashed-line.svg';
import arrow from '../assets/arrow.svg';
import waLogo from '../assets/whatsapp-logo.webp';

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
    const distance = "30 KM";

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
        <div className="relative flex flex-col justify-center items-center  sm:h-[100vh] w-full gap-6 sm:gap-12">
            <div onClick={() => prop.setDetialsVisibility(false)} className="flex gap-2 sm:gap-3 items-center cursor-pointer opacity-[0.8] transition-opacity duration-300 hover:opacity-[1] justify-center absolute left-5 top-0 text-[var(--text)]">
                <Icon path={mdiKeyboardBackspace} size={1.2} />
            </div>
            <h2>Ride Details</h2>
            <div className="flex flex-col justify-center items-start w-[290px] gap-3 sm:gap-4 ">
                <div className="flex justify-center items-center">
                    <div className="flex flex-col justify-center items-center m-0 p-0 h-[2px] scale-[0.35]">
                        <img src={dashedLine} alt="dashed-line" />
                        <img src={arrow} alt="arrow" />
                    </div>
                    <div className="flex flex-col justify-center items-start gap-2 text-left sm:gap-3">
                        <div className='flex flex-col items-start justify-center text-left'>
                            <h3 className="w-full px-4 flex justify-start items-center">{pickupLocation?.split(',')[0]}</h3>
                            <p className='w-full px-4 flex justify-start items-center text-base'>{pickupLocation?.replace(`${pickupLocation?.split(",")[0]}, `, "")}</p>
                        </div>
                        <div className='flex flex-col items-start justify-center text-left'>
                            <h3 className="w-full px-4 flex justify-start items-center">{dropLocation?.split(',')[0]}</h3>
                            <p className='w-full px-4 flex justify-start items-center text-base'>{dropLocation?.replace(`${dropLocation?.split(",")[0]}, `, "")}</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between w-full">
                    <h4 className="text-[var(--text-muted)]">Fare:</h4>
                    <h4>{fare}</h4>
                </div>

                <div className="flex items-center justify-between w-full">
                    <h4 className="text-[var(--text-muted)]">Distance:</h4>
                    <h4>{distance}</h4>
                </div>

                <div className="flex items-center justify-between w-full">
                    <h4 className="text-[var(--text-muted)]">Status:</h4>
                    <h4>{status.charAt(0).toUpperCase() + status.slice(1)}</h4>
                </div>
            </div>
            <div className="flex flex-col justify-center items-center gap-2 sm:gap-3">
                <Button
                    onClick={() => window.open("https://wa.me/918586088085?text=Hi%2C%20I%20need%20help%20with%20my%20ride.", "_blank", "noopener,noreferrer")}
                    prop={{ variant: "input", width: "290px" }}
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
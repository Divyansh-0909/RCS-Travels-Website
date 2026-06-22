import Button from "../components/ui/button";
import { useData } from "../hooks/useData";
import { useApi } from "../hooks/useApi";
import { useState, useEffect } from "react";
import errorIcon from "../assets/cross.webp";
import confirmIcon from "../assets/tick.webp";
import { useViewNavigate } from "../hooks/useViewNavigate";
import PriceIllustration from "../components/illustrations/RadarScanIllustration";
import SafetyIllustration from "../components/illustrations/DriverEnRouteIllustration";
import WhatsAppIllustration from "../components/illustrations/WhatsAppIllustration";
import Icon from '@mdi/react';
import { mdiKeyboardBackspace, mdiPhone, mdiShareVariant } from '@mdi/js';
import dashedLine from '../assets/dashed-line.svg';
import arrow from '../assets/arrow.svg';
import waLogo from '../assets/whatsapp-logo.webp';
import ErrorPanel from "../components/ui/ErrorPanel";
import BackgroundPanel from "../components/ui/BackgroundPanel";
import pfpPlaceholder from "../assets/pfp-placeholder.webp"
import RideDetails from "../components/RideDetails";

const TrackingPage = () => {
    const phone = useData(state => state.phone)
    const scheduledTime = useData(state => state.scheduledTime)
    const dropLocation = useData(state => state.dropLocation)
    const pickupLocation = useData(state => state.pickupLocation)
    const fare = useData(state => state.fare)
    const vehicleType = useData(state => state.vehicleType);
    const setvehicleType = useData(state => state.setvehicleType);
    const sharing = useData(state => state.sharing);
    const setSharing = useData(state => state.setSharing);
    const bookingId = useData(state => state.bookingId);
    const setBookingId = useData(state => state.setBookingId);
    const bookingCode = useData(state => state.bookingCode);
    const setBookingCode = useData(state => state.setBookingCode);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [panelState, setPanelState] = useState("");  // "confirm" | "error"
    const [step, setStep] = useState("searching"); // "vehicleType" | "searching"
    const [detialsVisibility, setDetialsVisibility] = useState(false)
    const [msgIndex, setMsgIndex] = useState(0);
    const [illusIndex, setIllusIndex] = useState(0);
    const navigate = useViewNavigate();
    const pickupTime = "5 mins"
    const pickupDistance = "1"

    return (
        <div className="relative bg-transparent text-center flex flex-col justify-center items-center w-[100vw] h-[100vh]">
            <ErrorPanel prop={{ error: error, setError: setError }} />
            <BackgroundPanel className={"py-6"}>
                <div className="relative flex flex-col justify-center items-center w-full gap-6 sm:gap-12">
                    <Button prop={{ variant: "input" }} className='absolute -top-18 right-3 px-2 pr-3'>
                        <div className="flex gap-1 sm:gap-2">
                            <Icon path={mdiShareVariant} size={0.8} />
                            <h4>Share</h4>
                        </div>
                    </Button>
                    <div className="flex flex-col gap-1 sm:gap-2 w-[290px]">
                        <h2 className="text-center w-full">Meet the driver at {pickupLocation} Inner Gate </h2>
                        <h3 className="text-[var(--text-muted)]">Pick up in {pickupTime}</h3>
                    </div>

                    <div className="flex flex-col justify-center items-start w-[290px] gap-3 sm:gap-4 ">
                        <div className="w-full flex flex-col gap-1 sm:gap-2">
                            <div className="flex items-center justify-between w-full">
                                <h3 className="text-[var(--text-muted)] text-xl">OTP:</h3>
                                <h3 className="text-2xl">{bookingCode} 1 2 3 4 5 6</h3>
                            </div>
                            <div className="flex flex-col gap-3 sm:gap-4 justify-center items-start w-full">
                                <Button onClick={() => setDetialsVisibility(true)} prop={{ variant: "input", width: "140px" }} className="cursor-pointer" >
                                    <p> View ride details </p>
                                </Button>
                            </div>
                        </div>

                        <Button
                            className="flex justify-between items-center w-full"
                            prop={{ variant: "input", innerClassName: "flex justify-between items-center w-full px-4 py-3" }}
                        >
                            <div className="flex flex-col text-left items-left gap-2 sm:gap-3">
                                <div class="w-17 h-17 rounded-full overflow-hidden">
                                    <img src={pfpPlaceholder} alt="placeholder" class="w-full h-full object-cover" />
                                </div>
                            </div>
                            <div className="flex flex-col text-right items-right justify-center">
                                <h4>Driver name</h4>
                                <h3> UP 16 AB 1234</h3>
                                <h4 className="text-[var(--text-muted)]">Car name</h4>
                            </div>
                        </Button>
                        <div className="flex justify-between w-[290px] items-center">
                            <Button
                                onClick={() => window.open("https://wa.me/918586088085?text=Hi%2C%20I%20need%20help%20with%20my%20ride.", "_blank", "noopener,noreferrer")}
                                prop={{ variant: "input", width: "140px" }}
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
            {/* ride details */}
            <BackgroundPanel show={detialsVisibility === true} className={`z-3 sm:z-2 gap-6 sm:gap-12 py-6 text-center flex flex-col justify-center items-center`}>
                <RideDetails prop={{setLoading,setError,setDetialsVisibility}}/>
            </BackgroundPanel>
        </div>
    )
}

export default TrackingPage
import Button from "../components/ui/Button";
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
    const status = useData(state => state.status);
    const setStatus = useData(state => state.setStatus);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [panelState, setPanelState] = useState("");  // "confirm" | "error"
    const [step, setStep] = useState("searching"); // "vehicleType" | "searching"
    const [detialsVisibility, setDetialsVisibility] = useState(false)
    const [msgIndex, setMsgIndex] = useState(0);
    const [illusIndex, setIllusIndex] = useState(0);
    const navigate = useViewNavigate();
    const pickupTime = "5 mins"
    const dropTime = "30 mins"

    useEffect(() => {
        if (status === "cancelled") setError("Driver canceled the ride");
    }, [status]);

    return (
        <div className="relative bg-transparent text-center flex flex-col justify-center items-center w-[100vw] h-[100vh]">
            <ErrorPanel prop={{ error: error, setError: setError }} />
            { scheduledTime !== null
            ? <BackgroundPanel className={"py-6 h-[100vh] rounded-t-none justify-center items-center"}>
                        <div className="relative flex flex-col justify-around items-center pt-6 w-full h-full gap-6 sm:gap-12">
                             <div onClick={() => navigate('/')} className="flex gap-2 sm:gap-3 items-center justify-center absolute left-5 top-0 text-[var(--text)]">
                                <Icon path={mdiKeyboardBackspace} size={1.2} />
                            </div>
                            <div className="flex flex-col justify-center items-center gap-1 sm:gap-2 w-[290px]">
                                <h2 className="text-center w-full">{status === "assigned" ? "Driver has been assigned" : "Driver has not been assigned"}</h2>
                                <h3 className="text-[var(--text-muted)]">{status === "assigned" ? "We suggest contacting the driver" : "Drivers are assigned closer to your pickup time. Check back shortly."}</h3>
                            </div>

                            <div className="flex flex-col justify-center items-start w-[290px] gap-3 sm:gap-4 ">
                                <div className="w-full flex flex-col gap-1 sm:gap-2">

                                    <div className="flex flex-col gap-3 sm:gap-4 justify-center items-start w-full">
                                        <h2>Ride Details</h2>
                                        <div className="flex flex-col justify-center items-start w-[290px] gap-3 sm:gap-4 ">
                                            <div className="flex justify-center items-center">
                                                <div className="flex flex-col justify-center items-center m-0 p-0 h-[2px] scale-[0.35]">
                                                    <img src={dashedLine} alt="dashed-line" />
                                                    <img src={arrow} alt="arrow" />
                                                </div>
                                                <div className="flex flex-col justify-center items-center gap-2 sm:gap-3">
                                                    <Button
                                                        prop={{
                                                            variant: "input",
                                                            width: "255px",
                                                        }}
                                                    >
                                                        <h3 className="w-full px-4 flex justify-start items-center">{pickupLocation}</h3>
                                                    </Button>
                                                    <Button
                                                        prop={{
                                                            variant: "input",
                                                            width: "255px",
                                                        }}
                                                    >
                                                        <h3 className="w-full px-4 flex justify-start items-center">{dropLocation}</h3>
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between w-full">
                                                <h4 className="text-[var(--text-muted)]">Fare:</h4>
                                                <h4>{fare}</h4>
                                            </div>

                                            <div className="flex items-center justify-between w-full">
                                                <h4 className="text-[var(--text-muted)]">Distance:</h4>
                                                <h4>30 KM</h4>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <Button
                                    className={`${status === "assigned" ? "block" : "hidden"} flex justify-between items-center w-full`}
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
                            </div>

                            <div className="flex flex-col justify-center gap-1 sm:gap-2 w-[290px] items-center">
                                <Button
                                    onClick={() => window.open("https://wa.me/918586088085?text=Hi%2C%20I%20need%20help%20with%20my%20ride.", "_blank", "noopener,noreferrer")}
                                    prop={{ variant: "input", width: "290px" }}
                                >
                                    <span className="flex items-center justify-center gap-2">
                                        <img src={waLogo} alt="WhatsApp" className="w-6 h-6" />
                                        Talk to Support
                                    </span>
                                </Button>
                                <Button
                                        className={`${status === 'assigned' ? "block" : "hidden"} flex gap-1 sm:gap-2 items-center justify-center`}
                                        prop={{ variant: "", width: "290px", innerClassName: "flex gap-2 items-center justify-center" }}
                                    >
                                        <Icon path={mdiPhone} size={0.7} />
                                        Call driver
                                    </Button>
                            </div>
                        </div>
                    </BackgroundPanel>
            : status === "completed"
                    ? 
                    <BackgroundPanel className={"py-6 h-[100vh] rounded-t-none justify-center items-center"}>
                        <div className="relative flex flex-col justify-around items-center w-full h-full gap-6 sm:gap-12">
                            <div className="flex flex-col justify-center items-center gap-1 sm:gap-2 w-[290px]">
                                <img className="-my-8 w-[150px]" src={panelState === "noDriver" ? errorIcon : confirmIcon} alt="icon" />
                                <h3 className="text-[var(--text-muted)]">Ride has been completed</h3>
                                <h2 className="text-center">Fare: {fare}</h2>
                            </div>

                            <div className="flex flex-col justify-center items-start w-[290px] gap-3 sm:gap-4 ">
                                <div className="w-full flex flex-col gap-1 sm:gap-2">

                                    <div className="flex flex-col gap-3 sm:gap-4 justify-center items-start w-full">
                                        <h2>Ride Details</h2>
                                        <div className="flex flex-col justify-center items-start w-[290px] gap-3 sm:gap-4 ">
                                            <div className="flex justify-center items-center">
                                                <div className="flex flex-col justify-center items-center m-0 p-0 h-[2px] scale-[0.35]">
                                                    <img src={dashedLine} alt="dashed-line" />
                                                    <img src={arrow} alt="arrow" />
                                                </div>
                                                <div className="flex flex-col justify-center items-center gap-2 sm:gap-3">
                                                    <Button
                                                        prop={{
                                                            variant: "input",
                                                            width: "255px",
                                                        }}
                                                    >
                                                        <h3 className="w-full px-4 flex justify-start items-center">{pickupLocation}</h3>
                                                    </Button>
                                                    <Button
                                                        prop={{
                                                            variant: "input",
                                                            width: "255px",
                                                        }}
                                                    >
                                                        <h3 className="w-full px-4 flex justify-start items-center">{dropLocation}</h3>
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* <div className="flex items-center justify-between w-full">
                                                <h4 className="text-[var(--text-muted)]">Time taken:</h4>
                                                <h4>{time}</h4>
                                            </div> */}

                                            <div className="flex items-center justify-between w-full">
                                                <h4 className="text-[var(--text-muted)]">Distance:</h4>
                                                <h4>30 KM</h4>
                                            </div>

                                            <div className="flex items-center justify-between w-full">
                                                <h4 className="text-[var(--text-muted)]">Status:</h4>
                                                <h4>{status}</h4>
                                            </div>
                                        </div>
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
                            </div>

                            <div className="flex flex-col justify-center gap-1 sm:gap-2 w-[290px] items-center">
                                <Button onClick={()=>navigate("/")}
                                    className="flex gap-1 sm:gap-2 items-center justify-center"
                                    prop={{ variant: "", width: "290px", innerClassName: "flex gap-2 items-center justify-center" }}
                                >
                                    Confirm
                                </Button>
                                <Button
                                    onClick={() => window.open("https://wa.me/918586088085?text=Hi%2C%20I%20need%20help%20with%20my%20ride.", "_blank", "noopener,noreferrer")}
                                    prop={{ variant: "input", width: "290px" }}
                                >
                                    <span className="flex items-center justify-center gap-2">
                                        <img src={waLogo} alt="WhatsApp" className="w-6 h-6" />
                                        Talk to Support
                                    </span>
                                </Button>
                            </div>
                        </div>
                    </BackgroundPanel>

                    : <BackgroundPanel className={"py-6"}>
                        <div className="relative flex flex-col justify-center items-center w-full gap-6 sm:gap-12">
                            <Button prop={{ variant: "input" }} className='absolute -top-18 right-3 px-2 pr-3'>
                                <div className="flex gap-1 sm:gap-2">
                                    <Icon path={mdiShareVariant} size={0.8} />
                                    <h4>Share</h4>
                                </div>
                            </Button>
                            <div className="flex flex-col justify-center items-center gap-1 sm:gap-2 w-[290px]">
                                <h2 className="text-center w-[90%]">{status === "en_route" ? `Meet the driver at ${pickupLocation} Inner Gate` : status === "reached" ? `Meet the driver at ${pickupLocation}` : `Driving towards ${dropLocation}`} </h2>
                                <h3 className="text-[var(--text-muted)] w-[80%]">{status === "en_route" ? `Pick up in ${pickupTime}` : status === "reached" ? `Driver has arrived at the pick up point` : `Reaching destination in ${dropTime}`}</h3>
                            </div>

                            <div className="flex flex-col justify-center items-start w-[290px] gap-3 sm:gap-4 ">
                                <div className="w-full flex flex-col gap-1 sm:gap-2">
                                    <div className={`${status === "en_route" || status === "reached" ? "block" : "hidden"} flex items-center justify-between w-full`}>
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
            }
            {/* ride details */}
            <BackgroundPanel show={detialsVisibility === true} className={`z-3 sm:z-2 gap-6 sm:gap-12 py-6 text-center flex flex-col justify-center items-center`}>
                <RideDetails prop={{ setLoading, setError, setDetialsVisibility }} />
            </BackgroundPanel>
        </div>
    )
}

export default TrackingPage
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
import { mdiKeyboardBackspace } from '@mdi/js';
import dashedLine from '../assets/dashed-line.svg';
import arrow from '../assets/arrow.svg';
import waLogo from '../assets/whatsapp-logo.webp';
import ErrorPanel from "../components/ui/ErrorPanel";
import BackgroundPanel from "../components/ui/BackgroundPanel";
import RideDetails from "../components/RideDetails";

const VehicleSelect = ()=>{
    const phone=useData(state=>state.phone)
    const scheduledTime= useData(state=>state.scheduledTime)
    const dropLocation= useData(state=>state.dropLocation)
    const pickupLocation= useData(state=>state.pickupLocation)
    const fare= useData(state=>state.fare)
    const vehicleType = useData(state=>state.vehicleType);
    const setvehicleType = useData(state => state.setvehicleType);
    const sharing = useData(state=>state.sharing);
    const setSharing = useData(state => state.setSharing);
    const bookingId = useData(state=>state.bookingId);
    const setBookingId = useData(state => state.setBookingId);
    const bookingCode = useData(state=>state.bookingCode);
    const setBookingCode = useData(state => state.setBookingCode);
    const status = useData(state=>state.status);
    const setStatus = useData(state => state.setStatus);
    const setActiveBooking = useData(state => state.setActiveBooking);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [panelState, setPanelState]= useState("");  // "confirm" | "error"
    const [step, setStep] = useState("vehicleType"); // "vehicleType" | "searching"
    const [detialsVisibility, setDetialsVisibility] = useState(false)
    const [msgIndex, setMsgIndex] = useState(0);
    const [illusIndex, setIllusIndex] = useState(0);
    const navigate = useViewNavigate();
    const api=useApi();

    const searchMessages = [
        "Finding drivers near you...",
        "Notifying nearby drivers...",
        "Connecting you with a driver...",
        "Checking driver availability...",
        "Looking a little further...",
        "Reaching out to more drivers...",
        "Almost there...",
        "Hang tight...",
    ];

    useEffect(() => {
        if (step !== "searching") return;
        const t = setInterval(() => setIllusIndex(i => (i + 1) % 3), 5000);
        return () => clearInterval(t);
    }, [step]);

    useEffect(() => {
        if (step !== "searching") return;
        // durations (ms) each message stays before advancing — last 2 stay 3× longer
        const durations = [30000, 30000, 30000, 30000, 30000, 30000, 210000, 210000];
        const timeouts = [];
        let elapsed = 0;
        durations.slice(0, -1).forEach((dur, i) => {
            elapsed += dur;
            timeouts.push(setTimeout(() => setMsgIndex(i + 1), elapsed));
        });
        return () => timeouts.forEach(clearTimeout);
    }, [step]);

    async function handleSubmit(e) {
        e.preventDefault();

        if (!vehicleType) {
            setError("Select a vehicle type");
            return;
        }

        try {
            setError(null);
            setLoading(true);

            const data = await api.createBooking({
                pickupAddress:  pickupLocation,
                // TODO: replace with real geocoded coords from Maps API.
                // Hardcoded to the seed's driver anchor (Connaught Place, Delhi)
                // so test bookings fall inside getDriver's bounding box.
                pickupLat:      28.6315,
                pickupLng:      77.2167,
                dropAddress:    dropLocation,
                dropLat:        28.4951,
                dropLng:        77.0890,
                vehicleType:    vehicleType,   // 4 | 6 | 1
                fare:           300,
                distanceKm:    5.2,
                sharing:       sharing,
                scheduledAt: scheduledTime,
                isOutstation:  false,
            });

            if (data?.error) {
                if (data.error === "No drivers available. Please try again shortly."){
                    setPanelState("noDriver")
                    return
                }
                // Surface the server's booking-conflict message as-is (same
                // rules the OnBoarding form enforces client-side).
                if (data.error.startsWith("You already have")) {
                    setError(data.error);
                    return;
                }
                setError("Can't create booking, try again");
                return;
            }
            if (data.bookingId) setBookingId(data.bookingId)
            if (data.bookingCode) setBookingCode(data.bookingCode)
            if (data.status) setStatus(data.status)

            // Optimistically record the new live booking so OnBoarding's cards
            // show immediately on return; the next OnBoarding mount re-fetches
            // and reconciles this with the server's truth.
            setActiveBooking({
                id: data.bookingId,
                code: data.bookingCode,
                status: data.status,
                pickupAddress: pickupLocation,
                dropAddress: dropLocation,
                fare: fare,
                scheduledAt: scheduledTime,
            });

            if(scheduledTime) setPanelState("confirmed")
            else if (data.status === "assigned") {
                // navigate(`/booking/${data.bookingId}`)
                navigate(`/booking/test`)
                return
            }
            else setStep("searching")
        } catch (err) {
            console.error(err);
            
            setError("Something went wrong");
        } finally {
            setLoading(false);
        }
    }

    let sliderColor = sharing ? "bg-green-500" : "bg-gray-500"
    let sliderPosition = sharing ? "-left-2" : "left-5"
    let solo = sharing ? "text-xs text-[var(--text-muted)]" : "font-medium text-lg sm:text-xl text-[var(--text)]"
    let share = sharing ? "text-lg sm:text-xl text-[var(--text)] font-medium" : "text-xs text-[var(--text-muted)]" 
    let soloVisiblity = sharing? "block" : "hidden"
    let shareVisiblity = sharing? "hidden" : "block"

    const searchingVisible = (panelState !== "noDriver" || (panelState !== "confirmed" && !scheduledTime)) && step === "searching"

    return (
        <div className="relative bg-transparent text-center flex flex-col justify-center items-center w-[100vw] h-[100vh]">
                <>
                    <ErrorPanel prop={{error: error, setError: setError}} />
                    <BackgroundPanel show={panelState === "noDriver" || (panelState === "confirmed" && scheduledTime)} className={`z-4 sm:z-3 bottom-0 gap-2 sm:gap-4 py-6 text-center flex flex-col justify-center items-center`}>
                        <img className="-my-8 w-[150px]" src={ panelState === "noDriver" ? errorIcon :  confirmIcon } alt="icon" />
                        <h2> { panelState === "noDriver" ? "No drivers nearby." :  "You're all set." } </h2>
                        <p> { panelState === "noDriver" ? "Try again in a few minutes." :  <>You'll get a <b>WhatsApp notification</b> <br /> when a driver is assigned, closer <br /> to your pick up time.</> } </p>
                        <Button 
                            onClick={() => navigate('/')}
                            prop={{
                                type: "submit",
                            }}
                            className="mt-4 scale-[1] sm:scale-[1.1] "
                        >
                            {loading? "Loading..." : "Go back"}
                        </Button>
                    </BackgroundPanel>
                    
                    {/* Searching panel — illustrations */}
                    <BackgroundPanel show={searchingVisible && detialsVisibility === false} className={`z-3 sm:z-2 gap-6 sm:gap-12 py-6 text-center flex flex-col justify-center items-center`}>
                        <h2 className="text-[var(--text)]">Requesting a ride</h2>
                        <div className="flex flex-col items-center justify-center gap-3 sm:gap-4 w-[290px]">
                            <div className="flex flex-col gap-3 sm:gap-4 justify-center items-start w-full">
                                <p className="text-left">{searchMessages[msgIndex]}</p>
                            </div>

                            <div className="relative w-[290px] rounded-full h-[6px] overflow-hidden">
                                <div className="absolute z-1 inset-0 bg-primary animate-searching-bar h-full"/>
                                <div className="absolute z-0 inset-0 bg-gray-500 w-full h-full"/>
                            </div>

                            <div className="flex flex-col gap-3 sm:gap-4 justify-center items-start w-full">
                                <Button onClick={()=>setDetialsVisibility(true)} prop={{ variant: "input", width: "140px" }} className="cursor-pointer" >
                                    <p> View ride details </p>
                                </Button>
                            </div>
                        </div>
                        <div key={illusIndex} className="animate-illus-fade flex flex-col items-center justify-center gap-[14px]">
                            {illusIndex === 0 && (
                                <>
                                    <PriceIllustration />
                                    <div style={{ width: "290px", textAlign: "left" }}>
                                        <h3 className="text-[var(--text)]">Lowest fares on campus.</h3>
                                        <p className="text-[var(--text-muted)]">Save up to 40% over cabs on every single ride.</p>
                                    </div>
                                </>
                            )}
                            {illusIndex === 1 && (
                                <>
                                    <SafetyIllustration />
                                    <div style={{ width: "290px", textAlign: "left" }}>
                                        <h3 className="text-[var(--text)]">Every ride, verified safe.</h3>
                                        <p className="text-[var(--text-muted)]">Background checked drivers. Real-time GPS. Safety, built in.</p>
                                    </div>
                                </>
                            )}
                            {illusIndex === 2 && (
                                <>
                                    <WhatsAppIllustration />
                                    <div style={{ width: "290px", textAlign: "left" }}>
                                        <h3 className="text-[var(--text)]">Same WhatsApp. Zero effort.</h3>
                                        <p className="text-[var(--text-muted)]">Message to book like you always have. We handle the rest, automatically.</p>
                                    </div>
                                </>
                            )}
                        </div>
                    </BackgroundPanel>

                    {/* Searching panel — ride details */}
                    <BackgroundPanel show={searchingVisible && detialsVisibility === true} className={`z-3 sm:z-2 gap-6 sm:gap-12 py-6 text-center flex flex-col justify-center items-center`}>
                        <RideDetails prop={{setLoading,setError,setDetialsVisibility}}/>
                    </BackgroundPanel>
                    
                    <div className={`${panelState === "noDriver" || (panelState === "confirmed" && scheduledTime) || step === "searching" ? "block" : "hidden" } absolute z-2 sm:z-1 bottom-0 bg-black/40 w-[100vw] h-[100vh]`}/>
                    
                    <BackgroundPanel show={step === "vehicleType"} className={`z-1 sm:z-0 gap-6 sm:gap-12 py-6 text-center flex flex-col justify-center items-center`}>
                        <div onClick={()=>navigate('/')} className="flex gap-2 sm:gap-3 items-center justify-center absolute left-5 top-6 text-[var(--text)]">
                            <Icon path={mdiKeyboardBackspace} size={1.2} />
                        </div>
                        <h2 className="text-[var(--text)]">Choose a ride</h2>
                        <form className="flex flex-col justify-center items-center gap-2.5 sm:gap-4" noValidate onSubmit={handleSubmit}>
                            <Button 
                                prop={{
                                    variant: "input",
                                    width: "290px",
                                }}
                                className={`${vehicleType === 4 ? "outline-2" : "outline-0"} scale-[1] sm:scale-[1.1] px-4 outline-primary focus:outline-2 outline-primary`}
                            >
                                <div onClick={() => setvehicleType(4)} className="flex justify-between items-center w-full">
                                    <div className="text-left flex flex-col justify-center items-start gap-0.5">
                                        Cab Economy
                                        <p>4 Seater</p>
                                    </div>
                                    <div key={sharing ? "share" : "solo"} className="animate-fade-swap text-right flex flex-col justify-center items-end gap-0.5">
                                        {/* Add sharing price too, also move the sharing price up if sharing is true else move them down */}
                                        <span className={`flex gap-1 ${solo}`}> <span className={`${soloVisiblity}`}>Solo: </span>₹400</span>
                                        <span className={`flex gap-1 ${share}`}> <span className={`${shareVisiblity}`}>Sharing: </span>₹300</span>
                                    </div>
                                </div> 
                            </Button>
                            <Button 
                                prop={{
                                    variant: "input",
                                    width: "290px",
                                }}
                                className={`${vehicleType === 6 ? "outline-2" : "outline-0"} scale-[1] sm:scale-[1.1] px-4 outline-primary focus:outline-2 outline-primary`}
                            >
                                <div onClick={() => setvehicleType(6)} className="flex justify-between items-center w-full ">
                                    <div className="text-left flex flex-col justify-center items-start gap-0.5">
                                        Cab XL
                                        <p>6 Seater</p>
                                    </div>
                                    <div key={sharing ? "share" : "solo"} className="animate-fade-swap text-right flex flex-col justify-center items-end gap-0.6">
                                        <span className={`flex gap-1 ${solo}`}> <span className={`${soloVisiblity}`}>Solo: </span>₹600</span>
                                        <span className={`flex gap-1 ${share}`}> <span className={`${shareVisiblity}`}>Sharing: </span>₹500</span>
                                    </div>
                                </div> 
                            </Button>
                            <Button 
                                prop={{
                                    variant: "input",
                                    width: "290px",
                                }}
                                className={`${vehicleType === 1 ? "outline-2" : "outline-0"} scale-[1] sm:scale-[1.1] px-4  outline-primary focus:outline-2 outline-primary`}
                            >
                                <div onClick={() => setvehicleType(1)} className="flex justify-between items-center w-full">
                                    <div className="text-left flex flex-col justify-center items-start gap-0.5">
                                        Book any
                                        <p>4-6 Seater</p>
                                    </div>
                                    <div key={sharing ? "share" : "solo"} className="animate-fade-swap text-right flex flex-col justify-center items-end gap-0.5">
                                        <span className={`flex gap-1 ${solo}`}> <span className={`${soloVisiblity}`}>Solo: </span>₹400-600</span>
                                        <span className={`flex gap-1 ${share}`}> <span className={`${shareVisiblity}`}>Sharing: </span>₹300-500</span>
                                    </div>
                                </div> 
                            </Button>
                            
                            <div className="flex justify-between items-center w-[100%] px-2.5">
                                <h4>Share a ride?</h4>
                                <div onClick={()=>setSharing(!sharing)} className="relative w-[50px] h-[22px] scale-[0.9] sm:scale-[1] flex items-center justify-center ">
                                    <div className={`absolute inset-0 ${sliderPosition} border-b-2 border-[rgba(255,255,255,0.05)] bg-white scale-[1] hover:bg-white/10 hover:scale-[1.3] cursor-pointer [transition:all_300ms,transform_300ms_150ms] bg-[linear-gradient(to_top,transparent_50%,rgba(146,146,139,0.25)_100%)] shadow-[inset_0px_2px_2px_1px_rgba(255,255,255,0.4),0px_0px_10px_rgba(0,0,0,0.6)] hover:shadow-[inset_0px_2px_2px_1px_rgba(255,255,255,0.4),0px_2px_20px_rgba(0,0,0,0.7)] w-[40px] rounded-full h-[inherit]`}/>
                                    <div className={`${sliderColor} rounded-full w-[inherit] h-[14px]`}/>
                                </div>
                            </div>
                            <div className="mt-4 flex flex-col gap-2 sm:gap-4">
                                <Button
                                    prop={{
                                        type: "submit",
                                    }}
                                    className="scale-[1] sm:scale-[1.1] "
                                    >
                                    {loading? "Booking..." : "Book ride"}
                                </Button>
                                {/* contact raju on whatsapp */}
                                <p className="text-xs sm:text-sm">Special requirements? Like a round trip  <br /> or an extended stay. <a href="" className="underline font-bold text-primary-light">Talk to us.</a></p> 
                                
                            </div>
                        </form>
                    </BackgroundPanel>
                </>                   
        </div>
    );
};

export default VehicleSelect
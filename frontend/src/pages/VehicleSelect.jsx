import Button from "../components/ui/button";
import { useData } from "../hooks/useData";
import { useApi } from "../hooks/useApi";
import { useState, useEffect } from "react";
import noDriverIcon from "../assets/cross.webp";
import confirmIcon from "../assets/tick.webp";
import { useNavigate } from "react-router-dom";

const VehicleSelect = ()=>{
    const scheduledTime= useData(state=>state.scheduledTime)
    const dropLocation= useData(state=>state.dropLocation)
    const pickupLocation= useData(state=>state.pickupLocation)
    const fare= useData(state=>state.fare)
    const vehicleType = useData(state=>state.vehicleType);
    const setvehicleType = useData(state => state.setvehicleType);
    const sharing = useData(state=>state.sharing);
    const setSharing = useData(state => state.setSharing);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);    
    const [panelState, setPanelState]= useState("");  // "confirm" | "noDriver"
    const [step, setStep] = useState("vehicleType"); // "vehicleType" | "searching" 
    const navigate = useNavigate();

    const api=useApi()

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
                pickupLat:      12.9716,
                pickupLng:      77.5946,
                dropAddress:    dropLocation,
                dropLat:        12.9719,
                dropLng:        77.6069,
                vehicleType:    vehicleType,   // 4 | 6 | 1
                fare:           250,
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
                setError("Can't create booking, try again");
                return;
            }
            if(scheduledTime) setPanelState("confirmed")
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

    return (
        <div className="relative bg-transparent text-center flex flex-col justify-center items-center w-[100vw] h-[100vh]">
            { step === "vehicleType" ?
                <>
                    <div className={` ${panelState === "noDriver" || (panelState === "confirmed" && scheduledTime) ? "block" : "hidden" } absolute z-3 sm:z-2 bottom-0 bg-transparent gap-2 sm:gap-4 rounded-t-4xl sm:rounded-none py-6 text-center flex flex-col justify-center items-center sm:h-[100vh] w-[100vw] bg-panel-gradient`}>
                        <img className="-my-8 w-[160px]" src={ panelState === "noDriver" ? noDriverIcon :  confirmIcon } alt="icon" />
                        <h2> { panelState === "noDriver" ? "No drivers nearby." :  "You're all set." } </h2>
                        <p> { panelState === "noDriver" ? "Try again in a few minutes." :  <>We'll assign a driver closer to <br /> your pick up time.</> } </p>
                        <Button 
                            onClick={() => navigate('/')}
                            prop={{
                                type: "submit",
                            }}
                            className="mt-4 scale-[1] sm:scale-[1.1] "
                        >
                            {loading? "Loading..." : "Okay"}
                        </Button>
                    </div>
                    <div className={`${panelState === "noDriver" || (panelState === "confirmed" && scheduledTime) ? "block" : "hidden" } absolute z-2 sm:z-1 bottom-0 bg-black/40 w-[100vw] h-[100vh]`}></div>
                    <div className="absolute z-1 sm:z-0 bottom-0 bg-transparent  gap-6 sm:gap-12 rounded-t-4xl sm:rounded-none py-6 text-center flex flex-col justify-center items-center sm:h-[100vh] w-[100vw] bg-panel-gradient">
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
                                    <div className="text-right flex flex-col justify-center items-end gap-0.5">
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
                                    <div className="text-right flex flex-col justify-center items-end gap-0.6">
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
                                    <div className="text-right flex flex-col justify-center items-end gap-0.5">
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
                    </div>
                </>
                :
                <div/>         
            }
        </div>
    );
};

export default VehicleSelect
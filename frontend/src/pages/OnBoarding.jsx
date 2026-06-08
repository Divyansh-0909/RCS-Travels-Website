import mobileBackgroundIllustration from "../assets/Mobile.webp"
import laptopBackgroundIllustration from "../assets/Laptop.webp"
import Button from "../components/ui/button";
import { use, useEffect, useState } from "react";
import Icon from '@mdi/react';
import { mdiClockTimeFourOutline } from '@mdi/js';
import { mdiChevronDown } from '@mdi/js';
import { mdiCalendarMonthOutline } from '@mdi/js';
import Input from "../components/ui/Input";
// import { useApi } from "../hooks/useApi";
import { useNavigate } from "react-router-dom";
import { DateTimeSelector } from "../components/ui/DateTimeSelector";


const OnBoarding = ()=>{
    const [timing,setTiming]=useState("Schedule")
    const [expand, setExpand]=useState(false)
    const [expandCalendar, setExpandCalendar]=useState(false)
    const [pickup, setPickup]=useState(null)
    const [drop,setDrop]=useState(null)
    const [loading,setLoading]=useState(false)
    const [error,setError]=useState(null)
    const [scheduledTime, setScheduledTime] = useState(null)
    // const api = useApi()
    
    async function handleSubmit(e) {
        e.preventDefault();

        setLoading(true)
        setError(null)

        // useEffect(()=>{
        //     api.getMe().then(data=>{
        //         if(data.error) navigate("/login")
        //         else {
        //             // move to the vechile type selector
        //         }
        //     })
        // })

    }

    return (
        <div className="relative flex flex-col sm:flex-row w-[100vw] h-[100vh] sm:px-60 sm:gap-20 sm:pt-10 sm:justify-center items-center bg-black">
            <div className="relative z-10 py-8 flex flex-col items-center h-[inherit] justify-end sm:justify-center">    
                <div className="flex flex-col text-center sm:text-left justify-center items-center sm:items-start gap-2 sm:gap-4">
                    <h2 className="text-white sm:text-6xl">Welcome!</h2>
                    <p className="text-white-muted sm:mb-8">Website for making your daily travel <br /> as convenient and smooth as possible</p>
                    <form className="flex flex-col sm:pl-3 justify-center items-start gap-2 sm:gap-3 mt-3" noValidate>
                        <div className="flex flex-col relative">
                            <div className="flex scale-[1] sm:scale-[1.1] justify-between items-center w-[73vw] sm:w-[275px]">
                                <Button        
                                    prop={{                    
                                        variant: "input",
                                        width: "200px"
                                    }}    
                                    className="relative"
                                >
                                    <div onClick={()=>setExpand(!expand)} className="w-full flex justify-between items-center gap-2">
                                        <div className="flex justify-center items-center gap-2">
                                            {(scheduledTime && timing === "Schedule" )
                                                ?   scheduledTime.toLocaleString("en-GB", { hour: "numeric", minute: "2-digit", day: "numeric", month: "numeric", })
                                                :   <div className="flex gap-2">
                                                        <Icon path={mdiClockTimeFourOutline} size={0.9} />
                                                        {timing}
                                                    </div>
                                            }      
                                        </div>
                                            
                                        <div>
                                            <Icon path={mdiChevronDown} size={0.9} 
                                            style={{
                                                transform: expand ? "rotate(180deg)" : "rotate(0deg)",
                                            }}/>
                                        </div>
                                    </div>
                                </Button>
                                <Button        
                                    prop={{                    
                                        variant: "input",
                                        width: "62px"
                                    }}    
                                    className={`relative  ${timing === "Schedule" ? "block" : "hidden"}`}
                                >
                                    <div onClick={()=>setExpandCalendar(!expandCalendar)} className="w-full flex justify-center gap-2 items-center">
                                        <Icon path={mdiCalendarMonthOutline} size={0.9} />
                                    </div>
                                </Button>
                            </div>
                            {/*Dropdown for selecting type of timing */}
                            <Button 
                                prop={{                    
                                    variant: "dropdown",
                                    width: "195px",
                                }}
                                className={`${expand ? "block" : "hidden"} absolute z-10 scale-[1] sm:scale-[1.1] top-10 sm:top-12 sm:-left-1`}
                            >
                                <div className="flex flex-col items-start">
                                    <div onClick={()=>{setTiming("Schedule") ; setExpand(false)}} className={`w-full relavtive flex items-center gap-2 py-3 ${timing === "Schedule" ? "text-white-muted" : "text-white"}`}>
                                        Schedule a ride
                                    </div>
                                    <div onClick={()=>{setTiming("Now"); setExpand(false)}} className={`w-full relavtive flex items-center gap-2 py-3 ${timing === "Now" ? "text-white-muted" : "text-white"}`}>
                                        Ride now
                                    </div>
                                </div>
                            </Button>
                            
                            {/*Dropdown for setting time and date */}
                            <Button 
                                prop={{                    
                                    variant: "dropdown",
                                    width: "250px",
                                }}
                                className={`${expandCalendar ? "block" : "hidden"} absolute scale-[1] sm:scale-[1.1] z-20 -top-75 sm:-top-50 left-80 `}
                            >
                                <div className="flex flex-col w-full items-start" onClick={(e) => e.stopPropagation()}>
                                    <DateTimeSelector
                                        onClick={()=>setExpandCalendar(false)}
                                        onChange={(dt) => setScheduledTime(dt.toLocaleString("en-GB", { 
                                            hour: "numeric", 
                                            minute: "2-digit", 
                                            hour12: true,
                                            day: "numeric", 
                                            month: "numeric" 
                                        }))}
                                        onConfirm={() => setExpandCalendar(false)}
                                    />
                                </div>
                            </Button>
                        </div>
                        <Input prop={{
                            type: "text", 
                            id: "pickup-location", 
                            name:"pickup-location", 
                            placeholder: "Pickup Location",
                            value: pickup,
                            onChangeFn: setPickup
                        }}
                            className={`scale-[1] sm:scale-[1.1]`}    
                        />
                        <Input prop={{type: "text", id: "drop-location", name:"drop-location", placeholder: "Drop Location"}} className={`scale-[1] sm:scale-[1.1]`}/>
                        <Button prop={{type: "submit", onSubmit: handleSubmit}} className={`scale-[1] sm:scale-[1.1]`}>See prices</Button>
                    </form>
                    <p className={`text-white text-xs sm:text-base`}>{timing === "Now" ? "Subject to availability" : "99% guaranteed cab allocation"}</p>
                    
                </div>
            </div>
            
            <div className="block sm:hidden absolute z-5 inset-x-0 top-0 h-[100vh] bg-[linear-gradient(to_top,var(--background)_35%,transparent_100%)]"/>
            <img src={mobileBackgroundIllustration} alt="background-illustration" className="absolute block sm:hidden z-0 w-full h-full object-top -top-8 object-cover bg-gradient" />
            <img src={laptopBackgroundIllustration} alt="background-illustration" className="w-[55%] rounded-3xl"/>
        </div>
    );
};

export default OnBoarding
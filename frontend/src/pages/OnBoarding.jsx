import mobileBackgroundIllustration from "../assets/Mobile.webp"
import laptopBackgroundIllustration from "../assets/Laptop.webp"
import Button from "../components/ui/button";
import { useState } from "react";
import Icon from '@mdi/react';
import { mdiClockTimeFourOutline } from '@mdi/js';
import { mdiChevronDown } from '@mdi/js';


const OnBoarding = ()=>{
    const [timing,setTiming]=useState("Schedule")
    const [expand, setExpand]=useState(false)

    return (
        <div className="relative flex flex-col w-[100vw] h-[100vh] items-center">
            <div className="relative z-10 py-8 flex flex-col items-center h-[inherit] justify-between">    
                <h3 className="text-black bg-white font-semibold px-4 py-2 rounded-full">RCS travels</h3>
                <div className="flex flex-col text-center justify-center items-center gap-2 ">
                    <h2 className="text-white">Welcome!</h2>
                    <p className="text-white-muted">App for making your daily travel <br /> as convenient and smooth as possible</p>
                    <div className="flex flex-col justify-center items-start gap-2 mt-3">
                        <div className="flex flex-col relative">
                            <Button                                
                                variant={"input"} 
                                width={"46vw"}
                                className="relative"
                            >
                                <div onClick={()=>setExpand(!expand)} className="w-full flex justify-between items-center gap-2">
                                    <div className="flex justify-center items-center gap-2">
                                        <Icon path={mdiClockTimeFourOutline} size={0.9} />
                                        {timing}
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
                                variant={"dropdown"} 
                                width={"45vw"}
                                rouned={true}
                                className={`${expand ? "block" : "hidden"} absolute top-10`}
                            >
                                <div className="flex flex-col items-start">
                                    <div onClick={()=>{setTiming("Now"); setExpand(false)}} className={`w-full relavtive flex items-center gap-2 py-3 ${timing === "Now" ? "text-white-muted" : "text-white"}`}>
                                        Ride now
                                    </div>
                                    <div onClick={()=>{setTiming("Schedule") ; setExpand(false)}} className={`w-full relavtive flex items-center gap-2 py-3 ${timing === "Schedule" ? "text-white-muted" : "text-white"}`}>
                                        Schedule a ride
                                    </div>
                                </div>
                            </Button>
                        </div>
                        <Button variant={"input"}> <div className="text-white-muted">Pickup Location</div>  </Button>
                        <Button variant={"input"}> <div className="text-white-muted">Drop Location</div> </Button>
                        <Button> See prices</Button>
                    </div>
                    <p className={`text-white text-xs`}>{timing === "Now" ? "Subject to availability" : "99% guaranteed cab allocation"}</p>
                    
                </div>
            </div>
            
            <div className="block sm:hidden absolute z-5 inset-x-0 top-0 h-[100vh] bg-[linear-gradient(to_top,var(--background)_35%,transparent_100%)]"/>
            <img src={mobileBackgroundIllustration} alt="background-illustration" className="absolute z-0 w-full h-full object-top -top-8 object-cover bg-gradient" />
        </div>
    );
};

export default OnBoarding
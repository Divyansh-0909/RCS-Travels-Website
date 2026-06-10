import Button from "../components/ui/button";
import { useData } from "../hooks/useData";

const VehicleSelect = ()=>{
    const vehicleType = useData(state=>state.vehicleType);
    const setvehicleType = useData(state => state.setvehicleType);

    return (
        <div className="relative bg-transparent text-center flex flex-col justify-center items-center w-[100vw] h-[100vh]">
            <div className="absolute z-1 sm:z-0 bottom-0 bg-transparent gap-6 sm:gap-12 rounded-t-4xl sm:rounded-none py-6 text-center flex flex-col justify-center items-center sm:h-[100vh] w-[100vw] bg-panel-gradient">
                <h2 className="text-[var(--text)]">Choose a ride</h2>
                <form className="flex flex-col justify-center items-center gap-2 sm:gap-4" noValidate >
                    <Button 
                        prop={{
                            variant: "input"
                        }}
                        className={`${vehicleType === "Cab-Economy" ? "outline-2" : "outline-0"} scale-[1] sm:scale-[1.1] outline-primary focus:outline-2 outline-primary`}
                    >
                        <div onClick={() => setvehicleType("Cab-Economy")} className="flex justify-between items-center w-full">
                            <div className="text-left flex flex-col justify-center items-start">
                                <h3>Cab Economy</h3>
                                <p className="text-[var(--text-muted)]">4 Person</p>
                            </div>
                            <div className="text-right flex flex-col justify-center items-end">
                                <h2 className="text-xl">₹400</h2>
                            </div>   
                        </div> 
                    </Button>
                    <Button 
                        prop={{
                            variant: "input"
                        }}
                        className={`${vehicleType === "Cab-XL" ? "outline-2" : "outline-0"} scale-[1] sm:scale-[1.1] outline-primary focus:outline-2 outline-primary`}
                    >
                        <div onClick={() => setvehicleType("Cab-XL")} className="flex justify-between items-center w-full ">
                            <div className="text-left flex flex-col justify-center items-start">
                                <h3>Cab XL</h3>
                                <p className="text-[var(--text-muted)]">6 Person</p>
                            </div>
                            <div className="text-right flex flex-col justify-center items-end">
                                <h2 className="text-xl">₹600</h2>
                            </div>   
                        </div> 
                    </Button>
                    <Button 
                        prop={{
                            variant: "input"
                        }}
                        className={`${vehicleType === "Book-any" ? "outline-2" : "outline-0"} scale-[1] sm:scale-[1.1]  outline-primary focus:outline-2 outline-primary`}
                    >
                        <div onClick={() => setvehicleType("Book-any")} className="flex justify-between items-center w-full">
                            <div className="text-left flex flex-col justify-center items-start">
                                <h3>Book any</h3>
                                <p className="text-[var(--text-muted)]">4-6 Person</p>
                            </div>
                            <div className="text-right flex flex-col justify-center items-end">
                                <h3 className="text-xl">₹400-600</h3>
                            </div>   
                        </div> 
                    </Button>

                    <Button
                        prop={{
                            type: "submit",
                        }}
                        className="scale-[1] sm:scale-[1.1] mt-4"
                        >
                        {"Book ride"}
                    </Button>
                </form>
            </div>
        </div>
    );
};

export default VehicleSelect
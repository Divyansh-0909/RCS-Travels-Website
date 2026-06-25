import Button from "../components/ui/Button";
import { useData } from "../hooks/useData";
import { useApi } from "../hooks/useApi";
import { useEffect, useState } from "react";
import { useViewNavigate } from "../hooks/useViewNavigate";
import { useAuth } from "@clerk/clerk-react";
import NavBar from "../components/ui/NavBar";
import errorIcon from "../assets/cross.webp";
import Icon from "@mdi/react";
import { mdiChevronDown } from "@mdi/js";
import dashedLine from '../assets/dashed-line.svg';
import arrow from '../assets/arrow.svg';

const RideHistory = () => {
    const { getToken } = useAuth();
    const api = useApi();
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const navigate = useViewNavigate();
    const [bookings, setBookings] = useState(null);
    const [expand, setExpand] = useState(null);

    useEffect(() => {
        let cancelled = false;            // guard against strict mode
        (async () => {
            setLoading(true)
            const data = await api.getMyBookings(getToken)
            if (cancelled) return

            if (data.error) setError(data.error)
            else setBookings(data.bookings)
            setLoading(false)
        })()

        return () => { cancelled = true }
    }, [getToken])


    console.log(bookings)
    return (
        <div className="bg-[var(--foreground)]">
            <div className="fixed z-100 left-1/2 -translate-x-1/2 top-6 sm:top-10 invert-[1]">
                <NavBar />
            </div>
            <div className="relative flex flex-col px-8 sm:px-60 gap-6 ">
                {(bookings === null || bookings.length === 0) //add a skeleton state when bookings === null
                    ?
                    <div className="flex flex-col justify-center items-center w-full h-[100vh] gap-1 sm:gap-2">
                        <img className="-my-8 w-[150px] " src={errorIcon} alt="icon" />
                        <h2 className="text-[var(--background-primary)]">No rides found</h2>
                        <h3 className="w-fit text-[var(--background-primary)]">Try <u className="cursor-pointer text-primary/80 transition-color duration-300ms hover:text-primary" onClick={() => navigate('/')} >booking a ride</u></h3>
                    </div>
                    :
                    <div className="pt-30 sm:pt-40">
                        <h1 className="font-semibold text-[var(--background-primary)] pb-4">Ride History</h1>
                        {
                            bookings.map((booking) => {
                                return (
                                    <div key={booking.id} onClick={() => { expand ? setExpand(null) : setExpand(booking.id) }} className={`cursor-pointer ${expand === booking.id ? "bg-[var(--background-primary)]" : "bg-[var(--foreground-muted)]"} py-5 px-7 sm:py-6 sm:px-8 rounded-2xl my-4 flex flex-col justify-center items-start gap-2 sm:gap-3`}>
                                        <div className="flex justify-between items-center gap-1 sm:gap-2 w-full">
                                            <div>
                                                <h3 className="font-semibold text-primary mb-2">{expand === booking.id ? (booking.driver ? `Your ride was with ${booking.driver.name}.` : "Driver couldn't be assigned.") : booking.dropAddress}</h3>
                                                <h4 className="font-semibold text-[var(--foreground)] mb-2">{expand === booking.id ? (booking.driver ? (booking.vechileType === 4 ? `Cab Economy ${(booking.sharing? "• Sharing" : "")}` : `Cab XL ${(booking.sharing? "• Sharing" : "")}`) : (booking.vechileType === 1 ? `Booked Any ${(booking.sharing? "• Sharing" : "")}` : (booking.vechileType === 4 ? `Booked Cab Economy ${(booking.sharing? "• Sharing" : "")}` : `Booked Cab XL ${(booking.sharing? "• Sharing" : "")}`) )) : ""}</h4>

                                                <h4 className={`${expand === booking.id ? "text-[var(--foreground)]" : "text-[var(--background-primary)]"}`}>
                                                    {new Date(booking.createdAt).toLocaleDateString("en-GB", {
                                                        day: "numeric",
                                                        month: "short",
                                                    })}
                                                    {" • "}
                                                    {new Date(booking.createdAt).toLocaleTimeString("en-GB", {
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                        hour12: true,
                                                    }).toUpperCase()}
                                                </h4>
                                                <h4 className={`${expand === booking.id ? "text-[var(--foreground)]" : "text-[var(--background-primary)]"}`}>₹{booking.fare} • {booking.status}</h4>
                                            </div>

                                            <Icon className={`${expand === booking.id ? "invert-[0]" : "invert-[1]"}`}
                                                path={mdiChevronDown}
                                                size={1.2}
                                                style={{
                                                    transform: expand === booking.id
                                                        ? "rotate(180deg)"
                                                        : "rotate(0deg)",
                                                }}
                                            />
                                        </div>
                                        <p className="mt-2 sm:mt-0">Ride ID: {booking.id}</p>
                                        <div className={`${expand === booking.id ? "block" : "hidden"} bg-[var(--background)] py-2 -ml-2`}>
                                            <div className="flex justify-start items-center">
                                                <div className="flex flex-col justify-center items-center m-0 -mr-4 sm:-mr-2 p-0 h-[2px] scale-[0.18] sm:scale-[0.23]">
                                                    <img src={dashedLine} alt="dashed-line" />
                                                    <img src={arrow} alt="arrow" />
                                                </div>
                                                <div className="flex flex-col justify-center text-[var(--text)] font-semibold items-center gap-2 sm:gap-3">
                                                    <h4 className="w-full px-4 flex justify-start items-center">{booking.pickupAddress}</h4>
                                                    <h4 className="w-full px-4 flex justify-start items-center">{booking.dropAddress}</h4>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        }
                    </div>
                }
            </div>
        </div>
    )
}

export default RideHistory
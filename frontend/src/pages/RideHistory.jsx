import Button from "../components/ui/Button";
import { useData } from "../hooks/useData";
import { useApi } from "../hooks/useApi";
import { useEffect, useState } from "react";
import { useViewNavigate } from "../hooks/useViewNavigate";
import { useAuth } from "@clerk/clerk-react";
import NavBar from "../components/ui/NavBar";
import errorIcon from "../assets/cross.webp";
import Icon from "@mdi/react";
import { mdiChevronDown, mdiPlus, mdiContentCopy, mdiClose } from "@mdi/js";
import dashedLine from '../assets/dashed-line.svg';
import arrow from '../assets/arrow.svg';
import FourSeaterCar from "../assets/4-seater-bottom-left.webp"
import SixSeaterCar from "../assets/6-seater-bottom-left.webp"
import RideHistorySkeleton from "../components/RideHistorySkeleton";

const RideHistory = () => {
    const { getToken } = useAuth();
    const api = useApi();
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const navigate = useViewNavigate();
    const [bookings, setBookings] = useState(null);
    const [expand, setExpand] = useState(null);
    const [copied, setCopied] = useState(false);
    const bookingId = useData(state => state.bookingId);
    const setBookingId = useData(state => state.setBookingId);

    const copyRideId = (id) => {
        if (!id) return;
        navigator.clipboard.writeText(id);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    async function handleCancel(id) {
        if (!id) return;

        try {
            setError(null);
            setLoading(true);

            const data = await api.cancelBooking(id);

            if (data?.error) {
                setError("Can't cancel ride");
                return;
            }
            if (data.ok) {
                if (bookingId === id) setBookingId(null);
                setBookings(prev => prev.map(b => b.id === id ? { ...b, status: "cancelled" } : b));
                setExpand(null);
            }
        } catch (err) {
            console.error(err);
            setError("Something went wrong");
        } finally {
            setLoading(false);
        }
    }

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

    const expandedBooking = expand !== null ? bookings.find(b => b.id === expand) : null;

    return (
        <div className="bg-[var(--foreground)]">
            <div className="fixed z-100 left-1/2 -translate-x-1/2 top-6 sm:top-10">
                <NavBar invert hideExpanded />
            </div>
            <div
                className={`${copied ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"} flex justify-center items-center w-[230px] fixed z-100 left-1/2 -translate-x-1/2 bottom-8 sm:bottom-10 bg-primary text-[var(--foreground)] text-sm font-semibold px-5 py-3 rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.25)] flex items-center gap-2 transition-[opacity,transform] duration-300`}
            >
                <Icon path={mdiContentCopy} size={0.7} />
                Copied to clipboard
            </div>
            <div className="relative flex flex-col px-8 sm:px-60 gap-6 ">
                {bookings === null && !error
                    ?
                    <RideHistorySkeleton />
                    : (bookings?.length ?? 0) === 0
                    ?
                    <div className="flex flex-col justify-center items-center w-full h-[100vh] gap-1 sm:gap-2">
                        <img className="-my-8 w-[150px] " src={errorIcon} alt="icon" />
                        <h2 className="text-[var(--background-primary)]">No rides found</h2>
                        <h3 className="w-fit text-[var(--background-primary)]">Try <u className="cursor-pointer text-primary/80 transition-color duration-300 hover:text-primary" onClick={() => navigate('/')} >booking a ride</u></h3>
                    </div>
                    :
                    <div className="pt-30 sm:pt-40">
                        <Button
                            className={`${expandedBooking ? "block animate-datetime" : "hidden animate-datetime-out"} z-200 py-6 flex flex-col justify-center items-center fixed left-1/2 top-1/2 -translate-x-1/2 mt-10 -translate-y-1/2 hover:opacity-[1]`}
                            prop={{ variant: "dropdown", width: "290px" }}
                        >
                            <Icon onClick={() => setExpand(null)} className="text-[var(--foreground)] w-full right-4 top-4 absolute opacity-[0.8] transition-opacity duration-300 hover:opacity-[1]" path={mdiClose} size={1} />
                            <div className="flex flex-col justify-center items-center gap-6 px-4 pt-2">
                                <div className="flex flex-col justify-center items-center gap-1">
                                    <h3 className="text-[var(--text)] font-semibold">{!expandedBooking?.driver ? (new Date(expandedBooking?.scheduledAt) > new Date() ? "Driver yet to be assigned" : "Driver couldn't be assigned") : `Your driver was ${expandedBooking.driver.name}`}</h3>
                                    <h4 className="text-[var(--text-muted)]">{(expandedBooking?.driver ? (expandedBooking?.vechileType === 4 ? `Cab Economy ${(expandedBooking?.sharing ? "• Sharing" : "")}` : `Cab XL ${(expandedBooking?.sharing ? "• Sharing" : "")}`) : (expandedBooking?.vechileType === 1 ? `Booked Any ${(expandedBooking?.sharing ? "• Sharing" : "")}` : (expandedBooking?.vechileType === 4 ? `Booked Cab Economy ${(expandedBooking?.sharing ? "• Sharing" : "")}` : `Booked Cab XL ${(expandedBooking?.sharing ? "• Sharing" : "")}`)))}</h4>
                                </div>
                                <div className="flex w-full gap-1 justify-center items-center -my-3">
                                    <div>-----</div>
                                    <h4>RIDE DETAILS</h4>
                                    <div>-----</div>
                                </div>
                                <div>
                                    <h4 className="text-[var(--text-muted)] flex justify-center items-center">
                                        {new Date(expandedBooking?.createdAt).toLocaleDateString("en-GB", {
                                            day: "numeric",
                                            month: "short",
                                        })}
                                        {" • "}
                                        {new Date(expandedBooking?.createdAt).toLocaleTimeString("en-GB", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            hour12: true,
                                        }).toUpperCase()}
                                    </h4>
                                    <h4 className="text-[var(--text-muted)] flex justify-center items-center uppercase">{expandedBooking?.status}</h4>
                                    <h4 className="text-[var(--text-muted)] flex justify-center items-center">
                                        {expandedBooking?.distanceKm} KM
                                        {expandedBooking?.status === "completed"
                                            ? ` • ${Math.floor(
                                                (Date.parse(expandedBooking.completedAt) -
                                                    Date.parse(expandedBooking.confirmedAt)) /
                                                60000
                                            )} min`
                                            : ""}
                                    </h4>                                </div>

                                <div className="flex justify-center items-center -ml-2 sm:ml-0 -mt-2">
                                    {/* <div className="flex flex-col justify-center items-start m-0 -mr-4 sm:-mr-2 p-0 h-[2px] scale-[0.26] sm:scale-[0.4]">
                                        <img src={dashedLine} alt="dashed-line" />
                                        <img src={arrow} alt="arrow" />
                                    </div> */}
                                    <div className="flex flex-col justify-between font-semibold w-full items-start gap-2 sm:gap-3">
                                        <div className="flex items-center justify-center gap-1 h-fit">
                                            <div className="bg-[var(--foreground)] w-3 h-3 rounded-full relative"></div>
                                            <div className="w-full px-4 flex flex-col justify-center items-start">
                                                <h4 className="text-[var(--text)] text-left">
                                                    {expandedBooking?.pickupAddress?.split(",")[0]}
                                                </h4>
                                                <p className="text-sm text-[var(--text-muted)] text-left">
                                                    {expandedBooking?.pickupAddress?.split(",").slice(1).join(",").trim()}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-center gap-1 h-fit"> 
                                            <div className="bg-primary w-3 h-3 rounded-full relative"><div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--foreground)] w-1.5 h-1.5 rounded-full"/></div>
                                            <div className="w-full px-4 flex flex-col justify-center items-start">
                                                <h4 className="text-left">
                                                    {expandedBooking?.dropAddress?.split(",")[0]}
                                                </h4>
                                                <p className="text-sm text-[var(--text-muted)] text-left">
                                                    {expandedBooking?.dropAddress?.split(",").slice(1).join(",").trim()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col w-full gap-1 justify-center items-center -my-3">
                                    <div>----------------------</div>
                                    <h4 className="text-[var(--text)]">Total Fare: ₹{expandedBooking?.fare} </h4>
                                    <div>----------------------</div>
                                </div>
                                <div className="flex flex-col justify-center items-center gap-1 sm:gap-2">
                                    <div className="flex gap-3 h-fit justify-center items-center">
                                        <p>
                                            Ride ID: {expandedBooking?.id?.slice(0, 8)}....
                                        </p>
                                        <span className="group relative flex items-center">
                                            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded-md bg-primary text-[var(--foreground)] text-xs font-semibold whitespace-nowrap opacity-0 translate-y-1 transition-[opacity,transform] duration-200 group-hover:opacity-100 group-hover:translate-y-0">copy</span>
                                            <Icon onClick={() => copyRideId(expandedBooking?.id)} className="cursor-pointer text-[var(--text-muted)] transition-color duration-300 hover:text-[var(--text)]" path={mdiContentCopy} size={0.65} />
                                        </span>
                                    </div>
                                    <Button onClick={() => handleCancel(expandedBooking?.id)} prop={{variant: "negative", width: "200px"}} className={`${new Date(expandedBooking?.scheduledAt) > new Date() ? "block" : "hidden" }`}>Cancel ride</Button>
                                    <p>Need help? <u className="text-[var(--text)] cursor-pointer transition-color duration-300 hover:text-[var(--text)]/80">Talk to us</u></p>
                                    
                                </div>
                            </div>
                        </Button>

                        <h1 className={`font-semibold text-[var(--background-primary)] pb-4 ${expand ? "sm:blur-xs opacity-[0.9]" : ""}`}>Ride History</h1>
                        {
                            bookings.map((booking) => {
                                return (
                                    <>
                                    {booking.status !== "cancelled" ?
                                         <div key={booking.id} className={`${expand ? "sm:blur-xs opacity-[0.9]" : ""} cursor-default bg-[var(--foreground-muted)] bg-var(--background-primary) bg-[linear-gradient(to_bottom,transparent_50%,rgba(146,146,139,0.10)_100%)] shadow-[inset_0_2px_2px_rgba(255,255,255,0.25)] transition-color duration-300 hover:bg-[var(--background)]/10 py-5 px-5 sm:py-6 sm:px-8 rounded-2xl my-4 sm:my-6 flex flex-col justify-center items-start gap-2 sm:gap-3`}>
                                        <div className="flex justify-between font-medium items-center gap-1 sm:gap-2 w-full">
                                            <div className="flex flex-col justify-center items-start">
                                                <h3 className="font-semibold text-primary mb-1">{booking.dropAddress}</h3>
                                                <div className="flex flex-row gap-2 h-fit mb-2 justify-center items-start sm:items-center">
                                                    <p className="text-gray-500">Ride ID: {booking.id?.slice(0, 8)}....</p>
                                                    <span className="group relative flex items-center">
                                                        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded-md bg-primary text-[var(--foreground)] text-xs font-semibold whitespace-nowrap opacity-0 translate-y-1 transition-[opacity,transform] duration-200 group-hover:opacity-100 group-hover:translate-y-0">copy</span>
                                                        <Icon onClick={() => copyRideId(booking?.id)} className="cursor-pointer mb-0.5 text-gray-500 transition-color duration-300 hover:text-[var(--text-foreground)]" path={mdiContentCopy} size={0.6} />
                                                    </span>
                                                </div>
                                                <div className="flex gap-2 justify-start items-center">
                                                    <img src={booking.vechileType === 4 ? FourSeaterCar : SixSeaterCar} className="w-20 sm:w-30 -ml-1" alt="car-image" />
                                                    <div>
                                                        <h4 className="text-[var(--background-primary)]">
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
                                                        <h4 className="text-[var(--background-primary)]">₹{booking.fare} • {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}</h4>
                                                    </div>
                                                </div>
                                            </div>
                                            <div onClick={() => setExpand(expand === booking.id ? null : booking.id)} className="cursor-pointer bg-[var(--background-primary)]/80 transition-color duration-300 hover:bg-[var(--background-primary)] p-1 rounded-full">
                                                <Icon path={mdiPlus} size={1} />
                                            </div>
                                        </div>
                                    </div>
                                : <div/> //if ride status is cancelled render nothing
                                }
                                </>
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
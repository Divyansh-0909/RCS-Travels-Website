import Button from "../components/ui/Button";
import { useData } from "../hooks/useData";
import { useApi } from "../hooks/useApi";
import { useEffect, useState } from "react";
import { useViewNavigate } from "../hooks/useViewNavigate";
import { useAuth } from "@clerk/clerk-react";
import NavBar from "../components/ui/NavBar";
import ErrorMark from "../components/illustrations/ErrorMark";
import Icon from "@mdi/react";
import { mdiChevronDown, mdiContentCopy } from "@mdi/js";
import FourSeaterCar from "../assets/4-seater-bottom-left.webp"
import SixSeaterCar from "../assets/6-seater-bottom-left.webp"
import RideHistorySkeleton from "../components/RideHistorySkeleton";
import { vehicleLabel, statusChip, splitAddress, displayPhone, formatDateTime, CopyBtn } from "../components/ui/bookingDisplay";

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
                sessionStorage.setItem("rideCancelled", "1");
                window.location.reload();
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

    return (
        <div className="bg-[var(--foreground)] w-full h-full">
            <div className="fixed z-100 left-1/2 -translate-x-1/2 top-6 sm:top-10">
                <NavBar invert  />
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
                        <ErrorMark className="-my-8" size={140} />
                        <h2 className="text-[var(--background-primary)]">No rides found</h2>
                        <h3 className="w-fit text-[var(--background-primary)]">Try <u className="cursor-pointer text-primary/80 transition-color duration-300 hover:text-primary" onClick={() => navigate('/')} >booking a ride</u></h3>
                    </div>
                    :
                    <div className="pt-30 sm:pt-40">
                        <h1 className="font-semibold text-[var(--background-primary)] pb-4">Ride History</h1>
                        {
                            bookings.map((booking) => {
                                const [pickupMain, pickupRest] = splitAddress(booking.pickupAddress)
                                const [dropMain, dropRest] = splitAddress(booking.dropAddress)
                                const isOpen = expand === booking.id
                                const upcoming = new Date(booking.scheduledAt) > new Date()
                                return (
                                    <div key={booking.id} className={`${booking.status === "cancelled" ? "opacity-60" : ""} cursor-default bg-[var(--foreground-muted)] py-5 px-5 sm:py-6 sm:px-8 rounded-2xl my-4 sm:my-6 flex flex-col justify-center items-start gap-4`}>
                                        <div className="flex justify-between items-start gap-4 w-full">
                                            {/* Route: pickup → drop, with the car on its left on sm+ */}
                                            <div className="flex items-center gap-4 min-w-0">
                                                <img src={booking.vehicleType === 6 ? SixSeaterCar : FourSeaterCar} className={`hidden sm:block w-44 -ml-4 shrink-0 ${booking.status === "cancelled" ? "grayscale" : ""}`} alt="car-image" />
                                                <div className="flex flex-col gap-3 min-w-0">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-3 h-3 rounded-full bg-[var(--background-primary)] shrink-0"></div>
                                                        <div className="min-w-0">
                                                            <h4 className="font-semibold text-[var(--background-primary)] truncate">{pickupMain}</h4>
                                                            {pickupRest && <p className="text-sm text-gray-500 truncate">{pickupRest}</p>}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-3 h-3 rounded-full bg-primary relative shrink-0"><div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[var(--foreground-muted)]" /></div>
                                                        <div className="min-w-0">
                                                            <h4 className="font-semibold text-[var(--background-primary)] truncate">{dropMain}</h4>
                                                            {dropRest && <p className="text-sm text-gray-500 truncate">{dropRest}</p>}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            {/* Fare + status + expand toggle */}
                                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                <h3 className="font-semibold text-[var(--background-primary)]">₹{booking.fare}</h3>
                                                <span className={`${statusChip(booking.status)} text-xs font-semibold px-2.5 py-1 rounded-full capitalize`}>{booking.status.replace("_", " ")}</span>
                                            </div>
                                        </div>

                                        <div className="w-full border-t border-[var(--background-primary)]/10"></div>

                                        {/* Trip meta + toggle, with the expandable details attached so the
                                            collapsed grid doesn't add an extra flex-gap at the card bottom */}
                                        <div className="flex flex-col w-full">
                                            <div className="flex justify-between items-center w-full gap-4">
                                                <p className="text-base text-gray-500">
                                                    {formatDateTime(booking.scheduledAt ?? booking.createdAt)}  •  {vehicleLabel(booking.vehicleType)}{booking.sharing ? " • Sharing" : ""}
                                                </p>
                                                <div onClick={() => setExpand(isOpen ? null : booking.id)} className="cursor-pointer text-[var(--foreground-muted)] bg-[var(--background-primary)]/80 transition-color duration-300 hover:bg-[var(--background-primary)] p-1 rounded-full shrink-0">
                                                    <Icon path={mdiChevronDown} size={1} className={`transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                                                </div>
                                            </div>

                                            {/* Extra details — hidden until the toggle pops them down */}
                                            <div className={`grid w-full transition-[grid-template-rows] duration-300 ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                                                <div className="overflow-hidden min-h-0 w-full">
                                                    <div className={`${isOpen ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"} transition-[opacity,transform] duration-300 flex flex-col gap-4 w-full pt-4`}>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                                                        <div>
                                                            <p className="text-xs uppercase tracking-wide text-gray-500 mb-0.5">Driver</p>
                                                            {booking.driver
                                                                ? <h4 className="text-[var(--background-primary)]">{booking.driver.name} <span className="text-gray-500">• {displayPhone(booking.driver.phone)}</span> <CopyBtn value={displayPhone(booking.driver.phone)} onCopy={copyRideId} /></h4>
                                                                : <h4 className="text-gray-500">{booking.status === "cancelled" ? "—" : upcoming ? "Yet to be assigned" : "Couldn't be assigned"}</h4>}
                                                        </div>
                                                        <div>
                                                            <p className="text-xs uppercase tracking-wide text-gray-500 mb-0.5">Trip</p>
                                                            <h4 className="text-[var(--background-primary)]">
                                                                {booking.distanceKm ?? "—"} KM
                                                                {booking.status === "completed" && booking.completedAt && booking.confirmedAt
                                                                    ? ` • ${Math.floor((Date.parse(booking.completedAt) - Date.parse(booking.confirmedAt)) / 60000)} min`
                                                                    : ""}
                                                            </h4>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-row gap-2 h-fit justify-start items-start sm:items-center">
                                                        <p className="text-gray-500 text-sm">Ride ID: {booking.id?.slice(0, 8)}....</p>
                                                        <CopyBtn value={booking?.id} onCopy={copyRideId} />
                                                    </div>

                                                    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                                                        {upcoming && booking.status !== "cancelled" &&
                                                            <Button onClick={() => handleCancel(booking.id)} prop={{ variant: "negative", width: "200px" }}>Cancel ride</Button>}
                                                        <p>Need help? <u className="text-[var(--background-primary)] cursor-pointer transition-color duration-300 hover:text-[var(--background-primary)]/80">Talk to us</u></p>
                                                    </div>
                                                    </div>
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

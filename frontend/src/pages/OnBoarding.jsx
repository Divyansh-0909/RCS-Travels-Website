import mobileBackgroundIllustration from "../assets/Mobile.webp";
import laptopBackgroundIllustration from "../assets/Laptop.webp";
import Button from "../components/ui/Button";
import { useState, useEffect } from "react";
import Icon from "@mdi/react";
import {
  mdiClockTimeFourOutline,
  mdiChevronDown,
  mdiCalendarMonthOutline,
} from "@mdi/js";
import Input from "../components/ui/Input";
import { useApi } from "../hooks/useApi";
import { useViewNavigate } from "../hooks/useViewNavigate";
import { DateTimeSelector } from "../components/ui/DateTimeSelector";
import { useData } from "../hooks/useData";
import { useSignIn, useAuth, useUser } from "@clerk/clerk-react";
import dashedLine from '../assets/dashed-line.svg';
import arrow from '../assets/arrow.svg';

function useExitAnim(open, duration) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const t = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, duration);
    return () => clearTimeout(t);
  }, [open, mounted, duration]);

  return { mounted, closing };
}

const statusLabels = {
  pending: "Finding your driver",
  confirmed: "Confirmed",
  assigned: "Driver assigned",
  en_route: "Driver on the way",
  reached: "Driver arrived",
  started: "On trip",
  completed: "Completed",
  cancelled: "Cancelled",
};

const ACTIVE_STATUSES = ["pending", "confirmed", "assigned", "en_route", "reached", "started"];

const OnBoarding = () => {
  const timing = useData(state => state.timing);
  const setTiming = useData(state => state.setTiming);
  const [expand, setExpand] = useState(false);
  const [expandCalendar, setExpandCalendar] = useState(false);
  const pickupLocation = useData(state => state.pickupLocation);
  const setPickup = useData(state => state.setPickup);
  const dropLocation = useData(state => state.dropLocation);
  const setDrop = useData(state => state.setDrop)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scheduledTime = useData(state => state.scheduledTime);
  const setScheduledTime = useData(state => state.setScheduledTime);
  const setBookingId = useData(state => state.setBookingId);
  const setFare = useData(state => state.setFare);
  const setStatus = useData(state => state.setStatus);
  const setBookingCode = useData(state => state.setBookingCode);
  const activeBooking = useData(state => state.activeBooking);
  const setActiveBooking = useData(state => state.setActiveBooking);
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const username = useData(state => state.username);
  const [showForm, setShowForm] = useState(false);
  const api = useApi();
  const navigate = useViewNavigate();

  // Copy the active booking into the shared tracking fields, then open the
  // tracking page. 
  function openActiveBooking() {
    if (!activeBooking) return;
    setBookingId(activeBooking.id);
    setBookingCode(activeBooking.code);
    setStatus(activeBooking.status);
    setPickup(activeBooking.pickupAddress);
    setDrop(activeBooking.dropAddress);
    setFare(activeBooking.fare);
    setScheduledTime(activeBooking.scheduledAt);
    navigate("/booking/test");
  }

  const timingDropdown = useExitAnim(expand, 220);
  const calendarDropdown = useExitAnim(expandCalendar, 300);

  // Hydrate `activeBooking` from the user's active/upcoming booking so the
  // current-trip and scheduled-ride cards survive a fresh page load.
  // Without this the store resets on every reload and the cards vanish.
  // This intentionally does NOT touch the form fields (pickup/drop/scheduled
  // time) — those belong to the new-booking form and are handed to the
  // tracking page only via openActiveBooking().
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    (async () => {
      const data = await api.getMyBookings();
      if (cancelled || data?.error || !data?.bookings) return;
      const active = data.bookings.find(b => ACTIVE_STATUSES.includes(b.status));
      if (!active) return;
      setActiveBooking({
        id: active.id,
        code: active.bookingCode,
        status: active.status,
        pickupAddress: active.pickupAddress,
        dropAddress: active.dropAddress,
        fare: active.fare,
        scheduledAt: active.scheduledAt ? new Date(active.scheduledAt) : null,
      });
    })();
    return () => { cancelled = true; };
  }, [isSignedIn]);

  async function handleSubmit(e) {
    e.preventDefault();

    if (timing === "Schedule" && !scheduledTime) {
      setError("No Scheduled Time");
      return;
    }

    if (!pickupLocation?.trim()) {
      setError("No Pickup Location");
      return;
    }

    if (!dropLocation?.trim()) {
      setError("No Drop Location");
      return;
    }

    // Guard against booking a ride that collides with the current active one.
    if (activeBooking) {
      const norm = (s) => s?.trim().toLowerCase();
      const sameRoute =
        norm(pickupLocation) === norm(activeBooking.pickupAddress) &&
        norm(dropLocation) === norm(activeBooking.dropAddress);

      const OVERLAP_MS = 15 * 60 * 1000;
      const newRideAt = (timing === "Schedule" ? scheduledTime : new Date()).getTime();
      const activeRideAt = (activeBooking.scheduledAt ? new Date(activeBooking.scheduledAt) : new Date()).getTime();
      const sameSlot = Math.abs(newRideAt - activeRideAt) < OVERLAP_MS;

      if (sameSlot) {
        setError(
          activeBooking.scheduledAt
            ? "You already have a ride scheduled around this time"
            : "You already have a ride active right now"
        );
        return;
      }

      // Different time, but an identical pickup + drop is almost certainly a
      // duplicate of the ride they already have.
      if (sameRoute) {
        setError("You already have an active booking for this route");
        return;
      }
    }

    try {
      setError(null);
      setLoading(true);

      const data = await api.getMe();

      if (data?.error) {
        navigate("/login");
        return;
      }
      navigate("/book");
    } catch (err) {
      console.error(err);
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex flex-col sm:flex-row h-[100vh] sm:px-40 sm:gap-20 sm:pt-16 sm:justify-center items-center bg-[var(--background)]">
      <div className="relative z-10 py-8 flex flex-col items-center w-full max-w-[500px] h-[inherit] sm:h-fit justify-end sm:justify-center">
        {(activeBooking && isSignedIn && !activeBooking.scheduledAt)
          ? <div className="flex flex-col text-center sm:text-left text-center justify-center items-center w-full sm:items-start gap-6 sm:gap-12">
            <h1 className="font-bold text-3xl sm:text-6xl">Current Trip</h1>

            <div className="flex flex-col justify-center items-start text-left gap-3 sm:gap-4 w-[75vw] sm:w-[315px]">
              <div className="flex flex-col gap-2 w-full">
                <div className="flex justify-start items-center">
                  <div className="flex flex-col justify-center items-center m-0 p-0 h-[2px] scale-[0.35]">
                    <img src={dashedLine} alt="dashed-line" />
                    <img src={arrow} alt="arrow" />
                  </div>
                  <div className="flex flex-col justify-center items-start gap-2 text-left sm:gap-3">
                    <div className='flex flex-col items-start justify-center text-left'>
                      <h3 className="w-full px-4 flex justify-start items-center">{activeBooking.pickupAddress?.split(',')[0]}</h3>
                      <p className='w-full px-4 flex justify-start items-center text-base'>{activeBooking.pickupAddress?.replace(`${activeBooking.pickupAddress?.split(",")[0]}, `, "")}</p>
                    </div>
                    <div className='flex flex-col items-start justify-center text-left'>
                      <h3 className="w-full px-4 flex justify-start items-center">{activeBooking.dropAddress?.split(',')[0]}</h3>
                      <p className='w-full px-4 flex justify-start items-center text-base'>{activeBooking.dropAddress?.replace(`${activeBooking.dropAddress?.split(",")[0]}, `, "")}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between w-full mt-5">
                  <h3 className="text-[var(--text-muted)]">Status</h3>
                  <h3>{statusLabels[activeBooking.status] || "On trip"}</h3>
                </div>
                <div className="flex items-center justify-between w-full">
                  <h3 className="text-[var(--text-muted)]">Fare</h3>
                  <h3>₹{activeBooking.fare}</h3>
                </div>
              </div>

              <div className="sm:pl-3">
                <Button onClick={openActiveBooking} className="sm:scale-[1.1]" prop={{ variant: "", width: "290px" }}>Track Ride</Button>
              </div>
            </div>
          </div>
          : <div className="flex flex-col text-center sm:text-left text-center justify-center items-center sm:items-start gap-2 sm:gap-5">
            <div className="flex flex-col items-center sm:items-start gap-0.5 sm:gap-1">
              <h2 className="sm:text-3xl text-xl font-normal text-[var(--text-muted)]">
                Hello {username?.split(" ")[0] || user?.firstName || "there"}!
              </h2>
              <h1 className="font-bold text-3xl sm:text-6xl">Where you off to?</h1>
            </div>

            {activeBooking && isSignedIn && activeBooking.scheduledAt && !showForm
              ? <div className="flex flex-col justify-center items-start text-center gap-2 sm:gap-3">
                <h4 className="w-full m-0 p-0 mb-2 sm:mt-0 mt-5">You have a scheduled ride</h4>
                <div className="sm:pl-3 flex flex-col gap-2 sm:gap-3">
                  <Button onClick={openActiveBooking} className="sm:scale-[1.1]" prop={{ variant: "", width: "290px", }}>See Ride Details</Button>
                  <Button onClick={() => setShowForm(true)} className="sm:scale-[1.1]" prop={{ variant: "input", width: "290px", }}>Book another ride</Button>
                </div>
              </div>
              : ""}

            {(!(activeBooking && isSignedIn && activeBooking.scheduledAt) || showForm) && (<>
              <form
                className="flex flex-col sm:pl-3 justify-center items-start gap-2 sm:gap-5  mt-3"
                noValidate
                onSubmit={handleSubmit}
              >
                {error && (
                  <p className={`${error ? "opacity-[1]" : "opacity-[0]"} relative text-red-400 left-1/2 -translate-x-1/2 sm:-left-2 sm:translate-x-0 text-sm`}>
                    {error}
                  </p>
                )}
                <div className="flex flex-col relative">
                  <div className="flex scale-[1] sm:scale-[1.3] sm:ml-7 justify-start gap-2 sm:gap-3 justify-center items-center w-[73vw] sm:w-[290px]">
                    <Button
                      prop={{
                        variant: "input",
                      }}
                      className="relative px-3"
                    >
                      <div
                        onClick={() => setExpand(!expand)}
                        className="w-full flex justify-between items-center gap-2"
                      >
                        <div className="flex justify-center items-center gap-2">
                          {scheduledTime && timing === "Schedule" ? (

                            <span className="flex justify-center items-center gap-2 whitespace-nowrap uppercase">
                              <Icon
                                path={mdiClockTimeFourOutline}
                                size={0.9}
                              />
                              {scheduledTime.toLocaleString("en-GB", {
                                hour: "numeric",
                                minute: "2-digit",
                                hour12: true,
                                day: "numeric",
                                month: "numeric",
                              })}
                            </span>
                          ) : (
                            <div className="flex justify-center items-center gap-2">
                              <Icon
                                path={mdiClockTimeFourOutline}
                                size={0.9}
                              />
                              {timing}
                            </div>
                          )}
                        </div>

                        <Icon
                          path={mdiChevronDown}
                          size={0.9}
                          style={{
                            transform: expand
                              ? "rotate(180deg)"
                              : "rotate(0deg)",
                          }}
                        />
                      </div>
                    </Button>

                    <Button
                      onClick={() => {
                        setExpand(false)
                        setExpandCalendar(!expandCalendar)
                      }
                      }
                      prop={{
                        variant: "input",
                        width: "47px",
                        error: error === "No Scheduled Time",
                      }}
                      className={`relative px-3 ${timing === "Schedule" ? "block" : "hidden"
                        }`}
                    >
                      <div

                        className="w-full flex justify-center gap-2 items-center"
                      >
                        <Icon
                          path={mdiCalendarMonthOutline}
                          size={0.9}
                        />
                      </div>
                    </Button>
                  </div>

                  {/* Timing dropdown */}
                  {timingDropdown.mounted && (
                    <Button
                      prop={{
                        variant: "dropdown",
                        width: "170px",
                      }}
                      className={`block ${timingDropdown.closing ? "animate-dropdown-out" : "animate-dropdown"
                        } absolute z-10 scale-[1] sm:scale-[1.2] top-12 active:opacity-[1] hover:opacity-[1]`}
                    >
                      <div className="flex flex-col items-start">
                        <div
                          onClick={() => {
                            setTiming("Schedule");
                            setExpandCalendar(false)
                            setExpand(false);
                          }}
                          className={`w-full flex items-center gap-2 py-3 ${timing === "Schedule"
                            ? "text-white-muted"
                            : "text-white"
                            }`}
                        >
                          Schedule a ride
                        </div>

                        <div
                          onClick={() => {
                            setTiming("Now");
                            setExpand(false);
                            setError(null);
                            setExpandCalendar(false);
                            setScheduledTime(null);
                          }}
                          className={`w-full flex items-center gap-2 py-3 ${timing === "Now"
                            ? "text-white-muted"
                            : "text-white"
                            }`}
                        >
                          Ride now
                        </div>
                      </div>
                    </Button>
                  )}

                  {/* Calendar dropdown */}
                  {calendarDropdown.mounted && (
                    <Button
                      prop={{
                        variant: "dropdown",
                        width: "250px",
                      }}
                      className={`block ${calendarDropdown.closing ? "animate-datetime-out" : "animate-datetime"
                        } absolute scale-[1] sm:scale-[1.2] z-20 -top-75 sm:top-15 left-1/2 -translate-x-1/2 sm:-translate-y-1/2 sm:left-107 active:opacity-[1] hover:opacity-[1]`}
                    >
                      <div
                        className="flex flex-col w-full items-start"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DateTimeSelector
                          initial={scheduledTime}
                          onClick={() => setExpandCalendar(false)}
                          onChange={(dt) => {
                            setScheduledTime(dt);
                            if (error === "No Scheduled Time") {
                              setError(null);
                            }
                          }}
                          onConfirm={() => setExpandCalendar(false)}
                        />
                      </div>
                    </Button>
                  )}
                </div>

                <Input
                  prop={{
                    type: "text",
                    id: "pickup-location",
                    name: "pickup-location",
                    placeholder: "Pickup Location",
                    value: pickupLocation,
                    onChangeFn: (value) => {
                      setPickup(value);
                      if (error === "No Pickup Location") {
                        setError(null);
                      }
                    },
                    error: error === "No Pickup Location",
                  }}
                  className="scale-[1] sm:scale-[1.3] sm:ml-7"
                />

                <Input
                  prop={{
                    type: "text",
                    id: "drop-location",
                    name: "drop-location",
                    placeholder: "Drop Location",
                    value: dropLocation,
                    onChangeFn: (value) => {
                      setDrop(value);
                      if (error === "No Drop Location") {
                        setError(null);
                      }
                    },
                    error: error === "No Drop Location",
                  }}
                  className="scale-[1] sm:scale-[1.3] sm:ml-7"
                />

                <Button
                  prop={{
                    type: "submit",
                    disabled:
                      (timing === "Schedule" && !scheduledTime) ||
                      !pickupLocation?.trim() ||
                      !dropLocation?.trim(),
                  }}
                  className="scale-[1] sm:scale-[1.3] sm:ml-7"
                >
                  {loading ? "Loading..." : "See prices"}
                </Button>
              </form>

              <p className="relative sm:text-xl text-[var(--text-muted)] ">
                {timing === "Now"
                  ? "* Subject to availability"
                  : "* 99% guaranteed cab allocation"}
              </p>
            </>)}
          </div>
        }
      </div>

      <div className="block sm:hidden absolute z-5 inset-x-0 top-0 h-[100vh] bg-[linear-gradient(to_top,var(--background)_5%,var(--background-primary)_40%,transparent_100%)]" />

      <img
        src={mobileBackgroundIllustration}
        alt="background-illustration"
        className="absolute block sm:hidden z-0 w-full h-full object-top -top-8 object-cover bg-gradient"
      />

      <img
        src={laptopBackgroundIllustration}
        alt="background-illustration"
        className="w-[550px] h-[450px] object-cover sm:block hidden rounded-lg"
      />
    </div>
  );
};

export default OnBoarding;
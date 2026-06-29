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

// Keeps a panel mounted while it plays its closing animation, then unmounts it.
// `mounted` → render the panel; `closing` → swap to the exit animation.
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

const OnBoarding = () => {
  const timing = useData(state => state.timing);
  const setTiming = useData(state => state.setTiming);
  const [expand, setExpand] = useState(false);
  const [expandCalendar, setExpandCalendar] = useState(false);
  const pickup = useData(state=>state.pickupLocation);
  const setPickup = useData(state => state.setPickup);
  const drop = useData(state=>state.dropLocation);
  const setDrop = useData(state => state.setDrop)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scheduledTime = useData(state=>state.scheduledTime);
  const setScheduledTime = useData(state => state.setScheduledTime);

  const api = useApi();
  const navigate = useViewNavigate();

  const timingDropdown = useExitAnim(expand, 220);
  const calendarDropdown = useExitAnim(expandCalendar, 300);

  async function handleSubmit(e) {
    e.preventDefault();

    if (timing === "Schedule" && !scheduledTime) {
      setError("No Scheduled Time");
      return;
    }

    if (!pickup?.trim()) {
      setError("No Pickup Location");
      return;
    }

    if (!drop?.trim()) {
      setError("No Drop Location");
      return;
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
    <div className="relative flex flex-col sm:flex-row h-[100vh] sm:px-60 sm:gap-20 sm:pt-16 sm:justify-center items-center bg-gradient">
      <div className="relative z-10 py-8 flex flex-col items-center w-full h-[inherit] sm:h-fit justify-end sm:justify-center">
        <div className="flex flex-col text-center sm:text-left text-center justify-center items-center sm:items-start gap-2 sm:gap-4">
          <h2 className="text-[var(--text)] sm:text-6xl">Welcome!</h2>

          <h4 className="text-[var(--text-muted)] sm:mb-8">
            Website for making your daily travel
            <br className="sm:hidden block"/> as convenient and smooth as possible
          </h4>

          <form
            className="flex flex-col sm:pl-3 justify-center items-start gap-2 sm:gap-3 mt-3"
            noValidate
            onSubmit={handleSubmit}
          >
            {error && (
                <p className={`${error? "opacity-[1]" : "opacity-[0]"} relative text-red-400 left-1/2 -translate-x-1/2 sm:-left-2 sm:translate-x-0 text-sm`}>
                  {error}
                </p>
            )}
            <div className="flex flex-col relative">
              <div className="flex scale-[1] sm:scale-[1.1] justify-start gap-2 sm:gap-3 justify-center items-center w-[73vw] sm:w-[290px]">
                <Button
                  prop={{
                    variant: "input",
                  }}
                  className="relative px-4"
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
                  prop={{
                    variant: "input",
                    width: "50px",
                    error: error === "No Scheduled Time",
                  }}
                  className={`relative px-3 ${
                    timing === "Schedule" ? "block" : "hidden"
                  }`}
                >
                  <div
                    onClick={() =>
                      setExpandCalendar(!expandCalendar)
                    }
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
                  width: "195px",
                }}
                className={`block ${
                  timingDropdown.closing ? "animate-dropdown-out" : "animate-dropdown"
                } absolute z-10 scale-[1] sm:scale-[1.1] top-10 sm:top-12 sm:-left-1 active:opacity-[1] hover:opacity-[1]`}
              >
                <div className="flex flex-col items-start">
                  <div
                    onClick={() => {
                      setTiming("Schedule");
                      setExpand(false);
                    }}
                    className={`w-full flex items-center gap-2 py-3 ${
                      timing === "Schedule"
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
                    className={`w-full flex items-center gap-2 py-3 ${
                      timing === "Now"
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
                className={`block ${
                  calendarDropdown.closing ? "animate-datetime-out" : "animate-datetime"
                } absolute scale-[1] sm:scale-[1.1] z-20 -top-75 sm:top-10 left-1/2 -translate-x-1/2 sm:-translate-y-1/2 sm:left-97 active:opacity-[1] hover:opacity-[1]`}
              >
                <div
                  className="flex flex-col w-full items-start"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DateTimeSelector
                    initial={scheduledTime}
                    onClick={()=>setExpandCalendar(false)}
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
                value: pickup,
                onChangeFn: (value) => {
                  setPickup(value);
                  if (error === "No Pickup Location") {
                    setError(null);
                  }
                },
                error: error === "No Pickup Location",
              }}
              className="scale-[1] sm:scale-[1.1]"
            />

            <Input
              prop={{
                type: "text",
                id: "drop-location",
                name: "drop-location",
                placeholder: "Drop Location",
                value: drop,
                onChangeFn: (value) => {
                  setDrop(value);
                  if (error === "No Drop Location") {
                    setError(null);
                  }
                },
                error: error === "No Drop Location",
              }}
              className="scale-[1] sm:scale-[1.1]"
            />

            <Button
              prop={{
                type: "submit",
              }}
              className="scale-[1] sm:scale-[1.1]"
            >
              {loading ? "Loading..." : "See prices"}
            </Button>
          </form>

          <p className="relative text-[var(--text-muted)] ">
            {timing === "Now"
              ? "* Subject to availability"
              : "* 99% guaranteed cab allocation"}
          </p>
        </div>
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
        className="opacity-[0.9] w-[550px] sm:block hidden rounded-3xl"
      />
    </div>
  );
};

export default OnBoarding;
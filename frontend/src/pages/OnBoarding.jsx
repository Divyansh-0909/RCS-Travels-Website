import mobileBackgroundIllustration from "../assets/Mobile.webp";
import laptopBackgroundIllustration from "../assets/Laptop.webp";
import Button from "../components/ui/Button";
import { useState, useEffect, useRef } from "react";
import Icon from "@mdi/react";
import {
  mdiClockTimeFourOutline,
  mdiChevronDown,
  mdiCalendarMonthOutline,
  mdiClose,
} from "@mdi/js";
import Input from "../components/ui/Input";
import { useApi } from "../hooks/useApi";
import { useViewNavigate } from "../hooks/useViewNavigate";
import { DateTimeSelector } from "../components/ui/DateTimeSelector";
import { useData } from "../hooks/useData";
import { useIsMobile } from "../hooks/useIsMobile";
import { useSignIn, useAuth, useUser } from "@clerk/clerk-react";
import RoutePanel from "../components/ui/RoutePanel";
import { statusLabels } from "../constants/statusLabels";

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

// Autocomplete state for one address field: debounced Google matches at 3+
// typed chars, recent places when (near-)empty. select() resolves coords
// (recents carry their own; Google picks cost one Details call); manual
// edits clear them.
function useAddressSuggestions(value, setValue, setCoords, api, exclusiveRef) {
  const recentPlaces = useData(state => state.recentPlaces);
  const addRecentPlace = useData(state => state.addRecentPlace);
  const [googleSuggestions, setGoogleSuggestions] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const justSelectedRef = useRef(false);
  // input -> fetched suggestions; repeat queries skip the API and the debounce
  const cacheRef = useRef(new Map());
  const dropdown = useExitAnim(expanded, 220);

  // Only one field's panel may be open at a time: opening this one closes
  // whichever field registered itself in the shared exclusiveRef before.
  function close() { setExpanded(false); }
  function open() {
    if (exclusiveRef && exclusiveRef.current !== close) {
      exclusiveRef.current?.();
      exclusiveRef.current = close;
    }
    setExpanded(true);
  }

  const typed = (value ?? "").trim().length >= 3;

  let recents = [];
  if (recentPlaces.length) {
    const [latest, ...rest] = [...recentPlaces].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    recents = [latest, ...rest.sort((a, b) => b.count - a.count)];
  }

  const items = typed
    ? googleSuggestions.map(s => ({ id: s.placePrediction?.placeId, label: s.placePrediction?.text?.text }))
    : recents.map(p => ({ id: p.label, label: p.label, lat: p.lat, lng: p.lng }));

  // Only react to actual value CHANGES: a store-prefilled value on mount (and
  // StrictMode's double effect run) must not auto-open the panel or wipe
  // coords. A one-shot "first run" flag isn't enough — StrictMode consumes it
  // on the throwaway run and the real run would fetch anyway.
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (value === prevValueRef.current) return;
    prevValueRef.current = value;
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    setCoords(null);
    if (!value || value.trim().length < 3) {
      // keep the panel open — while focused it now shows recents instead
      setGoogleSuggestions([]);
      return;
    }
    const cacheKey = value.trim().toLowerCase();
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setGoogleSuggestions(cached);
      if (cached.length > 0) open(); else setExpanded(false);
      return;
    }
    const timer = setTimeout(async () => {
      const data = await api.placesAutoComplete(value);
      if (data.error) {
        // errors are not cached — the next keystroke should retry
        setGoogleSuggestions([]);
        setExpanded(false);
        return;
      }
      const suggestions = data.suggestions ?? [];
      cacheRef.current.set(cacheKey, suggestions);
      setGoogleSuggestions(suggestions);
      if (suggestions.length > 0) open(); else setExpanded(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  async function select(item) {
    justSelectedRef.current = true;
    setValue(item.label);
    setExpanded(false);

    let coords = item.lat != null ? { lat: item.lat, lng: item.lng } : null;
    if (!coords && item.id) {
      const data = await api.placeDetails(item.id);
      if (!data.error && data.lat != null) coords = { lat: data.lat, lng: data.lng };
    }
    setCoords(coords);
    addRecentPlace(item.label, coords);
  }

  function onFocus() {
    if (items.length) open();
  }

  function onBlur() {
    setExpanded(false);
  }

  return { items, dropdown, select, onFocus, onBlur };
}

// Suggestion panel for an address input. `above` opens it over the input and
// reverses rows so the best match stays nearest the input. onMouseDown is
// prevented panel-wide: blur fires before click and would close the panel
// before a row's onClick could run.
const SuggestionDropdown = ({ anim, items, onSelect, above = false }) => {
  const panelRef = useRef(null);
  const itemsKey = items.map(i => i.id).join("|");

  // Opening upward: start scrolled to the bottom, where the best matches sit.
  useEffect(() => {
    if (above && panelRef.current)
      panelRef.current.scrollTop = panelRef.current.scrollHeight;
  }, [above, itemsKey, anim.mounted]);

  if (!anim.mounted || items.length === 0) return null;
  const rows = above ? [...items].reverse() : items;
  return (
    <div
      ref={panelRef}
      onMouseDown={(e) => e.preventDefault()}
      className={`${anim.closing ? "animate-dropdown-out" : "animate-dropdown"
        } absolute z-10 ${above ? "bottom-13 sm:bottom-15 origin-bottom" : "top-13 sm:top-15"} sm:ml-7 scale-[1] sm:scale-[1.3]
        w-[290px] max-h-[200px] overflow-y-auto scrollbar-inset
        border border-[var(--foreground)]/15 bg-[var(--background-muted)]
        rounded-[16px] shadow-[0_4px_20px_2px_rgba(0,0,0,0.5)]`}
    >
      <ul className="w-full flex flex-col justify-center items-center py-2">
        {rows.map((item, index) => {
          const commaIndex = item.label.indexOf(",");

          const mainLocation =
            commaIndex === -1 ? item.label : item.label.slice(0, commaIndex);

          const remainingLocation =
            commaIndex === -1 ? "" : item.label.slice(commaIndex + 1).trim();

          return (
            <li
              className="w-[97%] px-3 cursor-pointer rounded-xl transition-colors duration-250 hover:bg-[var(--background-primary)] active:bg-[var(--background-primary)]"
              onClick={() => onSelect(item)}
              key={item.id}>
              <div
                className={`py-3 ${index !== rows.length - 1
                  ? "border-b border-[var(--foreground)]/20"
                  : ""
                  }`}
              >
                <h4 className="text-left text-base">{mainLocation}</h4>
                <p className="text-left text-xs text-[var(--text-muted)]">{remainingLocation}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
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
  const setPickupCoords = useData(state => state.setPickupCoords);
  const setDropCoords = useData(state => state.setDropCoords);
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
  const mergeRecentPlaces = useData(state => state.mergeRecentPlaces);
  const { isSignedIn } = useAuth();
  const devAuthBypass = useData(state => state.devAuthBypass);
  // Render gate only; the hydration effect stays on real isSignedIn so the
  // dev preview never hits the API.
  const authed = isSignedIn || devAuthBypass;
  const { user } = useUser();
  const username = useData(state => state.username);
  const [showForm, setShowForm] = useState(false);
  const api = useApi();
  const navigate = useViewNavigate();

  // Copy the active booking into the shared tracking fields and open tracking.
  function openActiveBooking() {
    if (!activeBooking) return;
    setBookingId(activeBooking.id);
    setBookingCode(activeBooking.code);
    setStatus(activeBooking.status);
    setPickup(activeBooking.pickupAddress);
    setDrop(activeBooking.dropAddress);
    // the booking's own coords, so tracking maps the ride that was booked
    // (the form's coords may since have moved on to another route)
    if (activeBooking.pickupLat != null) setPickupCoords({ lat: activeBooking.pickupLat, lng: activeBooking.pickupLng });
    if (activeBooking.dropLat != null) setDropCoords({ lat: activeBooking.dropLat, lng: activeBooking.dropLng });
    setFare(activeBooking.fare);
    setScheduledTime(activeBooking.scheduledAt);
    navigate("/booking/test");
  }

  const timingDropdown = useExitAnim(expand, 220);
  const calendarDropdown = useExitAnim(expandCalendar, 300);

  // Hydrate activeBooking so the trip cards survive reloads. Deliberately
  // leaves the form fields alone — they belong to the new-booking form.
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    (async () => {
      const data = await api.getRecentPlaces();
      if (cancelled || data?.error || !data?.places) return;
      mergeRecentPlaces(data.places);
    })();
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
        pickupLat: active.pickupLat,
        pickupLng: active.pickupLng,
        dropLat: active.dropLat,
        dropLng: active.dropLng,
        fare: active.fare,
        scheduledAt: active.scheduledAt ? new Date(active.scheduledAt) : null,
      });
    })();
    return () => { cancelled = true; };
  }, [isSignedIn]);

  // One autocomplete instance per address field; the shared ref keeps at most
  // one panel open at a time.
  const suggestionCloserRef = useRef(null);
  const pickupAutocomplete = useAddressSuggestions(pickupLocation, setPickup, setPickupCoords, api, suggestionCloserRef)
  const dropAutocomplete = useAddressSuggestions(dropLocation, setDrop, setDropCoords, api, suggestionCloserRef)
  const isMobile = useIsMobile();

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

      // Same route at a different time is almost certainly a duplicate.
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
    <div className="relative flex flex-col sm:flex-row h-[100vh] sm:px-[9%] md:px-[5%] xl:px-[13%] sm:pt-16 sm:justify-center lg:justify-between items-center bg-[var(--background-primary)]">
      <div className="relative z-10 py-8 flex flex-col items-center lg:items-start w-full max-w-[500px] h-[inherit] sm:h-fit justify-end sm:justify-center">
        {(activeBooking && authed && !activeBooking.scheduledAt)
          ? <div className="flex flex-col text-center lg:text-left justify-center items-center w-full lg:items-start gap-6 sm:gap-16">
            <div className="flex flex-col items-center lg:items-start gap-0">
              <h1 className="font-bold text-3xl sm:text-5xl leading-tight">Current Trip</h1>
              <h2 className="sm:text-2xl text-xl font-normal leading-tight text-[var(--text-muted)]">{statusLabels[activeBooking.status] || "On trip"}</h2>
            </div>

            <div className="flex flex-col items-stretch text-left gap-5 sm:gap-14 w-[75vw] sm:w-[290px]">
              <RoutePanel size="xs" className="scale-[1] sm:scale-[1.3] lg:ml-7" pickup={activeBooking.pickupAddress} drop={activeBooking.dropAddress}>
                <div className="flex items-center justify-between w-full">
                  <h4 className="text-sm sm:text-base text-[var(--text-muted)]">Fare</h4>
                  <h4 className="text-sm sm:text-base">₹{activeBooking.fare}</h4>
                </div>
                {activeBooking.code && (
                  <div className="flex items-center justify-between w-full">
                    <h4 className="text-sm sm:text-base text-[var(--text-muted)]">Booking code</h4>
                    <h4 className="text-sm sm:text-base tracking-[0.25em] -mr-[0.25em]">{activeBooking.code}</h4>
                  </div>
                )}
              </RoutePanel>
              <Button onClick={openActiveBooking} className="scale-[1] sm:scale-[1.3] lg:ml-7" prop={{ variant: "", width: "100%" }}>Track Ride</Button>
            </div>
          </div>
          : <div className="flex flex-col text-center lg:text-left justify-center items-center lg:items-start gap-1 sm:gap-5">
            <div className="flex flex-col items-center lg:items-start gap-0 mb-2 sm:mb-4">
              <h2 className="sm:text-2xl text-xl font-normal leading-tight text-[var(--text-muted)]">
                Hello {username?.split(" ")[0] || user?.firstName || "there"}!
              </h2>
              <h1 className="font-bold text-3xl sm:text-5xl leading-tight">Where you off to?</h1>
            </div>

            {activeBooking && authed && activeBooking.scheduledAt && !showForm
              ? <div className="flex flex-col justify-center items-center lg:items-start text-center lg:text-left gap-2 sm:gap-3">
                <h4 className="w-full m-0 p-0 mb-2 sm:mt-0 mt-5 text-xl sm:text-2xl">You have a scheduled ride</h4>
                <div className="lg:pl-3 flex flex-col gap-2 sm:gap-3">
                  <Button onClick={openActiveBooking} className="sm:scale-[1.1]" prop={{ variant: "", width: "290px", }}>See Ride Details</Button>
                  <Button onClick={() => setShowForm(true)} className="sm:scale-[1.1]" prop={{ variant: "input", width: "290px", bg: "var(--background-primary)", }}>Book another ride</Button>
                </div>
              </div>
              : ""}

            {(!(activeBooking && authed && activeBooking.scheduledAt) || showForm) && (<>
              <form
                className="flex flex-col sm:pl-3 justify-center items-start gap-0.5 sm:gap-5 mt-1 sm:mt-3"
                noValidate
                onSubmit={handleSubmit}
              >
                {error && (
                  <p className={`${error ? "opacity-[1]" : "opacity-[0]"} relative text-red-400 left-1/2 -translate-x-1/2 sm:-left-2 sm:translate-x-0 text-sm`}>
                    {error}
                  </p>
                )}
                <div className="flex flex-col relative">
                  <div className="flex scale-[1] sm:scale-[1.3] lg:ml-7 justify-start gap-2 sm:gap-3 justify-center items-center w-[73vw] sm:w-[290px]">
                    <Button
                      prop={{
                        variant: "input",
                        bg: "var(--background-primary)",
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
                        bg: "var(--background-primary)",
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

                <div className="relative">
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
                      bg: "var(--background-muted)",
                      autoComplete: "off",
                      onFocusFn: pickupAutocomplete.onFocus,
                      onBlurFn: pickupAutocomplete.onBlur,
                    }}
                    className="scale-[1] sm:scale-[1.3] lg:ml-7"
                    leading={
                      <div className="w-3 h-3 rounded-full bg-[var(--foreground)]" />
                    }
                    trailing={
                      pickupLocation?.trim() ? (
                        <button
                          type="button"
                          aria-label="Clear pickup location"
                          onClick={() => setPickup("")}
                          className="flex items-center justify-center cursor-pointer rounded-full
                            text-[var(--text-muted)] hover:text-[var(--text)] active:opacity-70
                            outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]/70"
                        >
                          <Icon path={mdiClose} size={0.7} />
                        </button>
                      ) : undefined
                    }
                  />

                  <SuggestionDropdown
                    anim={pickupAutocomplete.dropdown}
                    items={pickupAutocomplete.items}
                    onSelect={pickupAutocomplete.select}
                    above={isMobile}
                  />
                </div>


                <div className="relative">
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
                      bg: "var(--background-muted)",
                      autoComplete: "off",
                      onFocusFn: dropAutocomplete.onFocus,
                      onBlurFn: dropAutocomplete.onBlur,
                    }}
                    className="scale-[1] sm:scale-[1.3] lg:ml-7"
                    leading={
                      <div className="w-3 h-3 rounded-full bg-primary relative">
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[var(--background)]" />
                      </div>
                    }
                    trailing={
                      dropLocation?.trim() ? (
                        <button
                          type="button"
                          aria-label="Clear drop location"
                          onClick={() => setDrop("")}
                          className="flex items-center justify-center cursor-pointer rounded-full
                            text-[var(--text-muted)] hover:text-[var(--text)] active:opacity-70
                            outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]/70"
                        >
                          <Icon path={mdiClose} size={0.7} />
                        </button>
                      ) : undefined
                    }
                  />

                  <SuggestionDropdown
                    anim={dropAutocomplete.dropdown}
                    items={dropAutocomplete.items}
                    onSelect={dropAutocomplete.select}
                    above
                  />
                </div>

                <Button
                  prop={{
                    type: "submit",
                    disabled:
                      (timing === "Schedule" && !scheduledTime) ||
                      !pickupLocation?.trim() ||
                      !dropLocation?.trim(),
                  }}
                  className="scale-[1] sm:scale-[1.3] lg:ml-7"
                >
                  {loading ? "Loading..." : "See prices"}
                </Button>
              </form>

              <p className="relative sm:text-lg text-[var(--text-muted)] ">
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
        className="lg:w-[500px] lg:h-[430px] xl:w-[600px] xl:h-[450px] object-cover lg:block hidden rounded-lg"
      />
    </div>
  );
};

export default OnBoarding;
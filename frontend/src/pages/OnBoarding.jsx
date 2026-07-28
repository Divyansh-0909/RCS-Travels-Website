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
import { useExitAnim } from "../hooks/useExitAnim";
import { useSignIn, useAuth, useUser } from "@clerk/clerk-react";
import RoutePanel from "../components/ui/RoutePanel";
import { statusLabels } from "../constants/statusLabels";
import { useRefreshNotice } from "../hooks/useRefreshNotice";

// ---- Shared layout + type scale -------------------------------------------
// Same tokens as VehicleSelect / TrackingPage / RideDetails. 377px is the width
// this page's scaled controls already render at (290 × 1.3), reached here as a
// real width so the trip screens carry no transform and their type is honest.
const COL = "w-[min(86vw,100%)] sm:w-[377px]";
const TITLE = "font-bold text-3xl sm:text-5xl leading-tight";
const SUBTITLE = "text-lg sm:text-2xl font-normal leading-snug text-[var(--text-muted)]";
const META = "text-base sm:text-xl";
const STACK = "gap-6 sm:gap-8";
const GROUP = "gap-2 sm:gap-3";
const PAIR = "gap-0.5 sm:gap-1";
// Current Trip sets its own step between the heading block, the route panel and
// the CTA. One token for all three so they stay equal — a STACK reads too loose
// here, a GROUP too tight.
const TRIP_STEP = "gap-4 sm:gap-5";
// The booking form sits just inside the page rail on phones. Marked important:
// it has to beat the 86vw default Button and Input carry for every other
// screen. sm+ is untouched — the components keep their fixed widths there.
const FORM_W = "max-sm:w-[82vw]!";


// Autocomplete state for one address field: debounced Google matches at 3+
// typed chars, recent places when (near-)empty. select() resolves coords
// (recents carry their own; Google picks cost one Details call); manual
// edits clear them.
function useAddressSuggestions(value, setValue, setCoords, api, exclusiveRef, closeOthers) {
  const recentPlaces = useData(state => state.recentPlaces);
  const savedPlaces = useData(state => state.savedPlaces);
  const addRecentPlace = useData(state => state.addRecentPlace);
  const [googleSuggestions, setGoogleSuggestions] = useState([]);
  // Set when the lookup itself failed, as opposed to succeeding with no matches.
  // The panel used to close on both, so a typo and a dead connection looked the
  // same: the suggestions simply disappeared as you typed.
  const [lookupError, setLookupError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const justSelectedRef = useRef(false);
  // input -> fetched suggestions; repeat queries skip the API and the debounce
  const cacheRef = useRef(new Map());
  const dropdown = useExitAnim(expanded, 220);

  // Only one panel may be open on the form at a time: opening this one closes
  // whichever field registered itself in the shared exclusiveRef before, and
  // closeOthers dismisses the non-address panels (timing, calendar).
  function close() { setExpanded(false); }
  function open() {
    closeOthers?.();
    if (exclusiveRef && exclusiveRef.current !== close) {
      exclusiveRef.current?.();
      exclusiveRef.current = close;
    }
    setExpanded(true);
  }

  const typed = (value ?? "").trim().length >= 3;

  // Saved places (Home/Work/custom, from Settings) lead the panel; `name`
  // renders as the row heading with the address beneath, and `saved` keeps
  // select() from treating the id as a Google place id. Recents that repeat
  // a saved address are dropped so a place never shows twice.
  const saved = savedPlaces
    .filter(p => p.address)
    .map(p => ({ id: `saved-${p.id ?? p.label}`, saved: true, name: p.label, label: p.address, lat: p.lat ?? null, lng: p.lng ?? null }));
  const savedAddresses = new Set(saved.map(s => s.label));

  let recents = [];
  if (recentPlaces.length) {
    const [latest, ...rest] = [...recentPlaces].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    recents = [latest, ...rest.sort((a, b) => b.count - a.count)].filter(p => !savedAddresses.has(p.label));
  }

  const items = typed
    ? googleSuggestions.map(s => ({ id: s.placePrediction?.placeId, label: s.placePrediction?.text?.text }))
    : [...saved, ...recents.map(p => ({ id: p.label, label: p.label, lat: p.lat, lng: p.lng }))];

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
      setLookupError(null);
      return;
    }
    const cacheKey = value.trim().toLowerCase();
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setGoogleSuggestions(cached);
      setLookupError(null);
      open(); // open even at zero rows — the panel says "no matches" itself now
      return;
    }
    const timer = setTimeout(async () => {
      let data;
      try {
        data = await api.placesAutoComplete(value);
      } catch {
        // request() only maps HTTP errors to { error }; a network failure rejects
        data = { error: "network" };
      }
      if (data.error) {
        // errors are not cached — the next keystroke should retry
        setGoogleSuggestions([]);
        setLookupError("Couldn't load suggestions. You can still type the address in full.");
        open();
        return;
      }
      const suggestions = data.suggestions ?? [];
      cacheRef.current.set(cacheKey, suggestions);
      setLookupError(null);
      setGoogleSuggestions(suggestions);
      open();
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  async function select(item) {
    justSelectedRef.current = true;
    setValue(item.label);
    setExpanded(false);

    let coords = item.lat != null ? { lat: item.lat, lng: item.lng } : null;
    // Saved-place ids aren't Google place ids — a saved row without coords
    // resolves later, exactly like a hand-typed address.
    if (!coords && item.id && !item.saved) {
      const data = await api.placeDetails(item.id);
      if (!data.error && data.lat != null) coords = { lat: data.lat, lng: data.lng };
    }
    setCoords(coords);
    addRecentPlace(item.label, coords);
  }

  function onFocus() {
    // Also opens for a typed query with nothing to show, so returning to the
    // field re-states why it is empty instead of silently showing nothing.
    if (items.length || typed) open();
  }

  function onBlur() {
    setExpanded(false);
  }

  return { items, dropdown, select, onFocus, onBlur, lookupError, typed };
}

// Suggestion panel for an address input. `above` opens it over the input and
// reverses rows so the best match stays nearest the input. onMouseDown is
// prevented panel-wide: blur fires before click and would close the panel
// before a row's onClick could run.
const SuggestionDropdown = ({ anim, items, onSelect, above = false, error = null, typed = false }) => {
  const panelRef = useRef(null);
  const itemsKey = items.map(i => i.id).join("|");

  // Opening upward: start scrolled to the bottom, where the best matches sit.
  useEffect(() => {
    if (above && panelRef.current)
      panelRef.current.scrollTop = panelRef.current.scrollHeight;
  }, [above, itemsKey, anim.mounted]);

  if (!anim.mounted) return null;

  // Nothing to list. A typed query still gets a panel — saying "no matches" or
  // why the lookup failed — but an untouched field with no recents stays silent
  // rather than popping an empty box on focus.
  if (items.length === 0) {
    if (!typed && !error) return null;
    return (
      <div
        onMouseDown={(e) => e.preventDefault()}
        className={`${anim.closing ? "animate-dropdown-out" : "animate-dropdown"
          } absolute z-10 ${above ? "bottom-13 sm:bottom-15 origin-bottom" : "top-13 sm:top-15"} sm:ml-7 scale-[1] sm:scale-[1.3]
          max-sm:w-full sm:w-[290px] max-w-full border border-[var(--foreground)]/15 bg-[var(--background-muted)]
          rounded-[16px] shadow-[0_4px_20px_2px_rgba(0,0,0,0.5)]`}
      >
        <div className="px-4 py-3 text-left">
          <h4 className="text-sm text-[var(--text)]">
            {error ? "Suggestions unavailable" : "No matching places"}
          </h4>
          <p className="text-xs leading-snug text-[var(--text-muted)] mt-0.5">
            {error || "Check the spelling, or type the address in full and we'll find it."}
          </p>
        </div>
      </div>
    );
  }

  const rows = above ? [...items].reverse() : items;
  return (
    <div
      ref={panelRef}
      onMouseDown={(e) => e.preventDefault()}
      className={`${anim.closing ? "animate-dropdown-out" : "animate-dropdown"
        } absolute z-10 ${above ? "bottom-13 sm:bottom-15 origin-bottom" : "top-13 sm:top-15"} sm:ml-7 scale-[1] sm:scale-[1.3]
        max-sm:w-full sm:w-[290px] max-w-full max-h-[200px] overflow-y-auto scrollbar-inset
        border border-[var(--foreground)]/15 bg-[var(--background-muted)]
        rounded-[16px] shadow-[0_4px_20px_2px_rgba(0,0,0,0.5)]`}
    >
      <ul className="w-full flex flex-col justify-center items-center py-2">
        {rows.map((item, index) => {
          const commaIndex = item.label.indexOf(",");

          // Saved places show their name (Home, Work) as the heading and the
          // full address beneath; everything else splits at the first comma.
          const mainLocation = item.name
            ?? (commaIndex === -1 ? item.label : item.label.slice(0, commaIndex));

          const remainingLocation = item.name
            ? item.label
            : commaIndex === -1 ? "" : item.label.slice(commaIndex + 1).trim();

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
  const setSavedPlaces = useData(state => state.setSavedPlaces);
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
  const notifyRefreshFailed = useRefreshNotice(state => state.notifyRefreshFailed);
  const clearRefreshNotice = useRefreshNotice(state => state.clearRefreshNotice);
  // Guards the active-booking hydration (and its retry) against landing after
  // this page is gone.
  const hydrationCancelledRef = useRef(false);

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
    // freshStatus: the status set above is the one the card the user just tapped
    // was displaying, so tracking opens on it directly. A skeleton here would
    // hide a status they had already read and flash a panel past on the way to
    // the same answer; the poll on the other side refreshes it either way.
    navigate("/booking/test", { state: { freshStatus: true } });
  }

  const timingDropdown = useExitAnim(expand, 220);
  const calendarDropdown = useExitAnim(expandCalendar, 300);

  // Hydrate activeBooking so the trip cards survive reloads. Deliberately
  // leaves the form fields alone — they belong to the new-booking form.
  //
  // A failure here is not cosmetic: with no trip card the page shows only the
  // booking form, so a rider who already has a live ride can't tell it exists
  // and may book a second one. It can't take the page over either — the form
  // underneath is perfectly usable — so it raises the ambient notice.
  async function hydrateActiveBooking({ isRetry = false } = {}) {
    let data;
    try {
      data = await api.getMyBookings();
    } catch {
      data = { error: "Couldn't reach the server" };
    }
    if (hydrationCancelledRef.current) return;
    if (data?.error) {
      notifyRefreshFailed(
        "Couldn't check whether you have a ride booked.",
        () => hydrateActiveBooking({ isRetry: true }),
      );
      return;
    }
    if (isRetry) clearRefreshNotice();
    if (!data?.bookings) return;
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
  }

  useEffect(() => {
    if (!isSignedIn) return;
    hydrationCancelledRef.current = false;
    // Recents failing stays silent on purpose: the field still works, it just
    // opens without history, and there is nothing for the rider to act on.
    (async () => {
      const data = await api.getRecentPlaces().catch(() => ({ error: "network" }));
      if (hydrationCancelledRef.current || data?.error || !data?.places) return;
      mergeRecentPlaces(data.places);
    })();
    // Saved places (Home/Work/custom) refresh the same way — silently, over
    // the persisted copy the suggestion panels already render from.
    (async () => {
      const data = await api.getSavedPlaces().catch(() => ({ error: "network" }));
      if (hydrationCancelledRef.current || data?.error || !data?.places) return;
      setSavedPlaces(data.places);
    })();
    hydrateActiveBooking();
    return () => { hydrationCancelledRef.current = true; clearRefreshNotice(); };
  }, [isSignedIn]);

  // One autocomplete instance per address field; the shared ref keeps at most
  // one panel open at a time. The two closers below extend that guarantee
  // across all four panels — address suggestions, timing and calendar — so
  // opening any one of them dismisses the rest.
  const suggestionCloserRef = useRef(null);
  const closeSuggestions = () => { suggestionCloserRef.current?.(); };
  const closeTimingPanels = () => { setExpand(false); setExpandCalendar(false); };
  const pickupAutocomplete = useAddressSuggestions(pickupLocation, setPickup, setPickupCoords, api, suggestionCloserRef, closeTimingPanels)
  const dropAutocomplete = useAddressSuggestions(dropLocation, setDrop, setDropCoords, api, suggestionCloserRef, closeTimingPanels)
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
    <div className="relative flex flex-col sm:flex-row h-[100dvh] sm:px-[9%] md:px-[5%] xl:px-[13%] sm:pt-16 sm:justify-center lg:justify-between items-center bg-[var(--background-primary)]">
      <div className="relative z-10 py-8 flex flex-col items-center lg:items-start w-full max-w-[500px] h-[inherit] sm:h-fit justify-end sm:justify-center">
        {(activeBooking && authed && !activeBooking.scheduledAt)
          // one rhythm down the whole card: heading block → route panel → CTA
          // all sit one TRIP_STEP apart
          ? <div className={`flex flex-col justify-center items-center w-full lg:items-start ${TRIP_STEP}`}>
            <div className={`flex flex-col items-center lg:items-start ${PAIR} ${COL}`}>
              <h1 className={`w-full text-center lg:text-left ${TITLE}`}>Current Trip</h1>
              <h2 className={`w-full text-center lg:text-left ${SUBTITLE}`}>{statusLabels[activeBooking.status] || "On trip"}</h2>
            </div>

            <div className={`flex flex-col items-stretch text-left ${TRIP_STEP} ${COL}`}>
              <RoutePanel size="sm" pickup={activeBooking.pickupAddress} drop={activeBooking.dropAddress}>
                <div className="flex items-center justify-between w-full">
                  <h4 className={`${META} text-[var(--text-muted)]`}>Fare</h4>
                  <h4 className={META}>₹{activeBooking.fare}</h4>
                </div>
                {activeBooking.code && (
                  <div className="flex items-center justify-between w-full">
                    <h4 className={`${META} text-[var(--text-muted)]`}>Booking code</h4>
                    <h4 className={`${META} tracking-[0.25em] -mr-[0.25em]`}>{activeBooking.code}</h4>
                  </div>
                )}
              </RoutePanel>
              {/* my-0! cancels Button's own my-1 so the gap under the panel is
                  the container's GROUP, same as the gap above it */}
              <Button onClick={openActiveBooking} className="my-0!" prop={{ variant: "", width: "100%" }}>
                <span className="text-base sm:text-lg">Track Ride</span>
              </Button>
            </div>
          </div>
          : <div className="flex flex-col text-center lg:text-left justify-center items-center lg:items-start gap-1 sm:gap-5">
            {/* no sm:mb — the container's gap-5 already separates the heading
                from the form; the extra margin stacked on top of it */}
            <div className="flex flex-col items-center lg:items-start gap-0 mb-2 sm:mb-0">
              <h2 className="sm:text-2xl text-xl font-normal leading-tight text-[var(--text-muted)]">
                Hello {username?.split(" ")[0] || user?.firstName || "there"}!
              </h2>
              <h1 className="font-bold text-3xl sm:text-5xl leading-tight">Where you off to?</h1>
            </div>

            {activeBooking && authed && activeBooking.scheduledAt && !showForm
              // Same card pattern as Current Trip above — the ride states itself, so
              // it needs no sentence introducing it. Every value comes from
              // activeBooking, which the getMyBookings effect already hydrates.
              ? <div className={`flex flex-col justify-center items-center lg:items-start mt-3 sm:mt-0 ${TRIP_STEP}`}>
                <div className={`flex flex-col items-stretch text-left ${GROUP} ${COL}`}>
                  <RoutePanel size="sm" pickup={activeBooking.pickupAddress} drop={activeBooking.dropAddress}>
                    <div className="flex items-center justify-between w-full">
                      <h4 className={`${META} text-[var(--text-muted)]`}>Scheduled</h4>
                      <h4 className={META}>
                        {new Date(activeBooking.scheduledAt).toLocaleString("en-GB", {
                          day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
                        })}
                      </h4>
                    </div>
                    <div className="flex items-center justify-between w-full">
                      <h4 className={`${META} text-[var(--text-muted)]`}>Fare</h4>
                      <h4 className={META}>₹{activeBooking.fare}</h4>
                    </div>
                    {activeBooking.code && (
                      <div className="flex items-center justify-between w-full">
                        <h4 className={`${META} text-[var(--text-muted)]`}>Booking code</h4>
                        <h4 className={`${META} tracking-[0.25em] -mr-[0.25em]`}>{activeBooking.code}</h4>
                      </div>
                    )}
                  </RoutePanel>

                  {/* "Confirmed" alone reads as done rather than waiting, so the
                      pre-assignment state says what is actually pending. */}
                  <p className="text-xs sm:text-sm text-[var(--text-muted)] leading-snug">
                    {activeBooking.status === "confirmed"
                      ? "Driver assigned closer to your pickup time."
                      : statusLabels[activeBooking.status] || activeBooking.status}
                  </p>

                  <Button onClick={openActiveBooking} className="my-0!" prop={{ variant: "", width: "100%" }}>
                    <span className="text-base sm:text-lg">See Ride Details</span>
                  </Button>
                  <Button onClick={() => setShowForm(true)} className="my-0!" prop={{ variant: "input", width: "100%", bg: "var(--background-primary)" }}>
                    <span className="text-base sm:text-lg">Book another ride</span>
                  </Button>
                </div>
              </div>
              : ""}

            {(!(activeBooking && authed && activeBooking.scheduledAt) || showForm) && (<>
              <form
                className="flex flex-col sm:pl-3 justify-center items-start gap-0.5 sm:gap-5 mt-1 sm:mt-1"
                noValidate
                onSubmit={handleSubmit}
              >
                {error && (
                  <p className={`${error ? "opacity-[1]" : "opacity-[0]"} relative text-red-400 left-1/2 -translate-x-1/2 sm:-left-2 sm:translate-x-0 text-sm`}>
                    {error}
                  </p>
                )}
                <div className="flex flex-col relative">
                  <div className="flex scale-[1] sm:scale-[1.3] lg:ml-7 justify-start gap-2 sm:gap-3 justify-center items-center max-sm:w-[82vw] max-sm:max-w-full sm:w-[290px]">
                    <Button
                      prop={{
                        variant: "input",
                        bg: "var(--background-primary)",
                      }}
                      className="relative px-3"
                    >
                      <div
                        onClick={() => {
                          closeSuggestions();
                          setExpandCalendar(false);
                          setExpand(!expand);
                        }}
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
                        closeSuggestions();
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
                    className={`scale-[1] sm:scale-[1.3] lg:ml-7 ${FORM_W}`}
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
                    error={pickupAutocomplete.lookupError}
                    typed={pickupAutocomplete.typed}
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
                    className={`scale-[1] sm:scale-[1.3] lg:ml-7 ${FORM_W}`}
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
                    error={dropAutocomplete.lookupError}
                    typed={dropAutocomplete.typed}
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
                  className={`scale-[1] sm:scale-[1.3] lg:ml-7 ${FORM_W}`}
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

      <div className="block sm:hidden absolute z-5 inset-x-0 top-0 h-[100dvh] bg-[linear-gradient(to_top,var(--background)_5%,var(--background-primary)_40%,transparent_100%)]" />

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
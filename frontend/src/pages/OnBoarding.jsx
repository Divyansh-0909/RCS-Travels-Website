import mobileBackgroundIllustration from "../assets/Mobile.webp";
import laptopBackgroundIllustration from "../assets/Laptop.webp";
import Button from "../components/ui/Button";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
const FORM_W = "max-sm:w-[78vw]!";


// Autocomplete state for one address field: debounced Google matches at 3+
// typed chars, recent places when (near-)empty. select() resolves coords
// (recents carry their own; Google picks cost one Details call); manual
// edits clear them.
function useAddressSuggestions(value, setValue, setCoords, api, exclusiveRef, closeOthers,allowCurrentLocation = false) {
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

  const currentLocationItem = {
    id: "__current_location__",
    label: "Current location",
    name: "Current location",
    isCurrentLocation: true,
  };

  let recents = [];
  if (recentPlaces.length) {
    const [latest, ...rest] = [...recentPlaces].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    recents = [latest, ...rest.sort((a, b) => b.count - a.count)].filter(p => !savedAddresses.has(p.label));
  }

  const items = typed
    ? googleSuggestions.map(s => ({ id: s.placePrediction?.placeId, label: s.placePrediction?.text?.text }))
    : [...(allowCurrentLocation ? [currentLocationItem] : []), ...saved, ...recents.map(p => ({ id: p.label, label: p.label, lat: p.lat, lng: p.lng }))];

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

    if (item.isCurrentLocation) {
      if (!navigator.geolocation) {
        setLookupError("Location isn't available on this device.");
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;

          setCoords({
            lat: latitude,
            lng: longitude,
          });

          const data = await api.reverseGeocode(latitude, longitude);

          if (data?.error) {
            setLookupError("Couldn't determine your current address.");
            return;
          }

          const address = data.address;

          setValue(address);
          setExpanded(false);
          addRecentPlace(address, {
            lat: latitude,
            lng: longitude,
          });
        },
        () => {
          setLookupError("Couldn't access your current location.");
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000,
        },
      );

      return;
    }

    setValue(item.label);
    setExpanded(false);

    let coords = item.lat != null
      ? { lat: item.lat, lng: item.lng }
      : null;

    if (!coords && item.id && !item.saved) {
      const data = await api.placeDetails(item.id);

      if (!data.error && data.lat != null) {
        coords = {
          lat: data.lat,
          lng: data.lng,
        };
      }
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
          } absolute z-10 ${above ? "bottom-13 sm:bottom-15 origin-bottom sm:origin-bottom-left" : "top-13 sm:top-15 sm:origin-top-left"} scale-[1] sm:scale-[1.3]
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
        } absolute z-10 ${above ? "bottom-13 sm:bottom-15 origin-bottom sm:origin-bottom-left" : "top-13 sm:top-15 sm:origin-top-left"} scale-[1] sm:scale-[1.3]
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
                <p className="text-left text-xs text-[var(--text-muted)]">
                  {item.isCurrentLocation
                    ? "Use your current location"
                    : remainingLocation}
                </p>
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
  const [isRoundTrip, setIsRoundTrip] = useState(false)

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
    navigate(`/booking/${activeBooking.id}`, { state: { freshStatus: true } });
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
  const pickupAutocomplete = useAddressSuggestions(pickupLocation, setPickup, setPickupCoords, api, suggestionCloserRef, closeTimingPanels,true)
  const dropAutocomplete = useAddressSuggestions(dropLocation, setDrop, setDropCoords, api, suggestionCloserRef, closeTimingPanels,false)
  const isMobile = useIsMobile();

  // The calendar panel is portalled to the body (see its comment at the render
  // site), so it can no longer be anchored by CSS — it shares no positioned
  // ancestor with its button. From sm up it reads the button's right edge and
  // opens to the right of it; on phones it stays centred, where there is no
  // room to sit beside anything. Re-read on resize because the form's own left
  // edge moves with the breakpoint: centred at sm/md, left-aligned once lg
  // splits the layout against the illustration.
  const calendarBtnRef = useRef(null);
  const [calendarAnchor, setCalendarAnchor] = useState(null);

  // Keyed on `mounted`, not on expandCalendar: the panel outlives the flag by
  // the length of its exit animation, and dropping the anchor early would send
  // it back to the centred branch to play that exit from the middle of the
  // screen.
  useEffect(() => {
    if (!calendarDropdown.mounted || isMobile) {
      setCalendarAnchor(null);
      return;
    }
    const update = () => {
      const rect = calendarBtnRef.current?.getBoundingClientRect();
      // Only the left edge is measured: the panel opens to the right of the
      // button, one gap clear of it, and takes its vertical position from the
      // viewport rather than the button. origin-left keeps the gap exact — the
      // 1.2 scale grows rightward, away from the button, instead of straddling
      // it as a centre origin would.
      if (rect) setCalendarAnchor({ left: rect.right + 12 });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [calendarDropdown.mounted, isMobile]);

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
              <Button onClick={openActiveBooking} className="my-0!" prop={{ variant: "", width: "100%" }}>
                <span className="text-base sm:text-lg">Track Ride</span>
              </Button>
            </div>
          </div>
          : <div className="flex flex-col text-center lg:text-left justify-center items-center lg:items-start gap-1 sm:gap-5">
            <div className="flex flex-col items-center lg:items-start gap-0 mb-2 sm:mb-0">
              <h2 className="sm:text-3xl text-xl font-normal leading-tight text-[var(--text-muted)]">
                Hello {username?.split(" ")[0] || user?.firstName || "there"}!
              </h2>
              <h1 className="font-bold text-4xl sm:text-6xl lg:text-5xl xl:text-6xl leading-tight">Where you off to?</h1>
            </div>

            {activeBooking && authed && activeBooking.scheduledAt && !showForm
              ? <div className={`flex flex-col justify-center items-center lg:items-start mt-3 sm:mt-0 ${TRIP_STEP}`}>
                <div className={`flex flex-col items-stretch text-left ${GROUP} ${COL}`}>
                  <RoutePanel
                    size="sm"
                    pickup={activeBooking.pickupAddress}
                    drop={activeBooking.dropAddress}
                    header={
                      // Status leads the card: it outranks the addresses and the
                      // meta rows, so the state of the ride is the first thing
                      // read. The confirmed caveat drops to a muted note beneath
                      // rather than competing at that size.
                      <>
                        <h3 className="text-xl sm:text-2xl font-semibold leading-tight">
                          {statusLabels[activeBooking.status] || activeBooking.status}
                        </h3>
                        {activeBooking.status === "confirmed" && (
                          <p className="mt-0.5 text-xs sm:text-sm text-[var(--text-muted)] leading-snug">
                            Driver assigned closer to your pickup time.
                          </p>
                        )}
                      </>
                    }
                  >
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
                  </RoutePanel>

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
                className="flex flex-col justify-center items-start gap-1 sm:gap-5 mt-1 sm:mt-1 sm:w-[377px]"
                noValidate
                onSubmit={handleSubmit}
              >
                {error && (
                  <p className={`${error ? "opacity-[1]" : "opacity-[0]"} relative text-red-400 left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 text-sm`}>
                    {error}
                  </p>
                )}
                <div className="flex bg-[var(--background-muted)] mb-1 sm:mb-0 outline outline-[var(--foreground)]/40 rounded-full gap-1 sm:gap-2 p-1.5 sm:p-2 [&>*]:text-base [&>*]:sm:text-xl [&>*]:py-1 [&>*]:px-3 [&>*]:sm:py-2 [&>*]:sm:px-3 [&>*]:cursor-pointer [&>*]:rounded-full">
                  <h3 onClick={() => setIsRoundTrip(false)} className={`transition-color duration-300 text-[var(--text)] ${isRoundTrip ? "" : "bg-primary"}`}>
                    One way
                  </h3>
                  <h3 onClick={() => setIsRoundTrip(true)} className={`transition-color duration-300 text-[var(--text)] ${isRoundTrip ? "bg-primary" : ""}`}>
                    Round trip
                  </h3>
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
                    className={`scale-[1] sm:scale-[1.3] sm:origin-left ${FORM_W}`}
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
                    className={`scale-[1] sm:scale-[1.3] sm:origin-left ${FORM_W}`}
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

                <div className="flex flex-col relative">
                  <div className={`flex scale-[1] sm:scale-[1.3] sm:origin-left justify-start gap-2 justify-center items-center max-sm:max-w-full sm:w-[290px] ${FORM_W}`}>
                    <Button
                      onClick={() => {
                        closeSuggestions();
                        setExpandCalendar(false);
                        setExpand(!expand);
                      }}
                      prop={{
                        variant: "input",
                        bg: expand ? "var(--background-primary)" : "var(--background-muted)",
                      }}
                      className="relative px-2"
                    >
                      <div

                        className="w-full flex justify-between items-center gap-1"
                      >
                        <div className="flex justify-center items-center gap-1">
                          {scheduledTime && timing === "Schedule" ? (

                            <span className="flex justify-center items-center gap-1 whitespace-nowrap uppercase">
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
                              <Icon
                                path={mdiClose}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setScheduledTime(null);
                                }}
                                size={0.7}
                                className="mx-1 ml-1.5 transition-opcaity duration-300 opacity-[0.7] hover:opacity-[1]" />
                            </span>
                          ) : (
                            <div className="flex justify-center items-center gap-1">
                              <Icon
                                path={mdiClockTimeFourOutline}
                                size={0.9}
                              />
                              {timing}
                              <Icon
                                className="transition-opacity duration-300 opacity-[0.7] hover:opacity-[1]"
                                path={mdiChevronDown}
                                size={0.9}
                                style={{
                                  transform: expand
                                    ? "rotate(180deg)"
                                    : "rotate(0deg)",
                                }}
                              />
                            </div>
                          )}
                        </div>


                      </div>
                    </Button>

                    <Button
                      containerRef={calendarBtnRef}
                      onClick={() => {
                        closeSuggestions();
                        setExpand(false)
                        setExpandCalendar(!expandCalendar)
                      }
                      }
                      prop={{
                        variant: "input",
                        bg: expandCalendar ? "var(--background-primary)" : "var(--background-muted)",
                        error: error === "No Scheduled Time",
                      }}
                      className={`relative px-2 pr-3 ${timing === "Schedule" ? "block" : "hidden"
                        }`}
                    >
                      <div

                        className="w-full flex justify-between items-center gap-2"
                      >
                        <div className="flex justify-center items-center gap-2">
                          {scheduledTime && timing === "Schedule" ? (

                            <span className="flex justify-center items-center gap-1 whitespace-nowrap">
                              <Icon
                                path={mdiCalendarMonthOutline}
                                size={0.9}
                              />
                              Edit
                            </span>
                          ) : (
                            <div className="flex justify-center items-center gap-1">
                              <Icon
                                path={mdiCalendarMonthOutline}
                                size={0.9}
                              />
                              When
                            </div>
                          )}
                        </div>
                      </div>
                    </Button>
                  </div>

                  {/* Timing dropdown */}
                  {timingDropdown.mounted && (
                    <Button
                      prop={{
                        variant: "dropdown",
                        width: "155px",
                      }}
                      className={`block ${timingDropdown.closing ? "animate-dropdown-out" : "animate-dropdown"
                        } absolute z-10 scale-[1] sm:scale-[1.2] bottom-13 origin-bottom sm:bottom-auto sm:top-15 sm:origin-top-left active:opacity-[1] hover:opacity-[1]`}
                    >
                      <div className="flex flex-col items-start">
                        <div
                          onClick={() => {
                            setTiming("Schedule");
                            setExpandCalendar(false)
                            setExpand(false);
                          }}
                          className={`w-full flex items-center gap-2 py-1 pb-2 border-b-1 border-[var(--foreground)]/40 ${timing === "Schedule"
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
                          className={`w-full flex items-center gap-2 py-1 pt-2 ${timing === "Now"
                            ? "text-white-muted"
                            : "text-white"
                            }`}
                        >
                          Ride now
                        </div>
                      </div>
                    </Button>
                  )}

                  {/* Calendar dropdown. Portalled to the body: the column at the
                      top of this page is `relative z-10`, which opens a stacking
                      context its descendants can't paint out of — inside it no
                      z-index reaches over the fixed z-100 nav rail. Position
                      comes from calendarAnchor: beside the button from sm up,
                      centred on the viewport on phones. */}
                  {calendarDropdown.mounted && createPortal(
                    <Button
                      prop={{
                        variant: "dropdown",
                        width: "250px",
                      }}
                      className={`block ${calendarDropdown.closing ? "animate-datetime-out" : "animate-datetime"
                        } fixed scale-[1] sm:scale-[1.2] z-[105] top-1/2 -translate-y-1/2 ${calendarAnchor
                          ? "origin-left"
                          : "left-1/2 -translate-x-1/2"
                        } active:opacity-[1] hover:opacity-[1]`}
                      style={calendarAnchor ? { left: calendarAnchor.left } : undefined}
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
                    </Button>,
                    document.body,
                  )}
                </div>

                <Button
                  prop={{
                    type: "submit",
                    disabled:
                      (timing === "Schedule" && !scheduledTime) ||
                      !pickupLocation?.trim() ||
                      !dropLocation?.trim(),
                  }}
                  className={`scale-[1] sm:scale-[1.3] sm:origin-left ${FORM_W}`}
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

      <div className="block sm:hidden absolute z-5 inset-x-0 top-0 h-[100dvh] bg-[linear-gradient(to_top,var(--background)_30%,var(--background-primary)_45%,transparent_90%)]" />

      <img
        src={mobileBackgroundIllustration}
        alt="background-illustration"
        className="absolute block sm:hidden z-0 w-full h-full object-top -top-20 object-cover bg-gradient"
      />

      <img
        src={laptopBackgroundIllustration}
        alt="background-illustration"
        className="lg:w-[500px] lg:h-[430px] xl:w-[560px] xl:h-[440px] object-cover lg:block hidden rounded-lg"
      />
    </div>
  );
};

export default OnBoarding;
import { useTranslation as useCopyLanguage } from "react-i18next";
import { websiteCopy as dc } from "../i18nCopy";
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
  mdiKeyboardBackspace,
  mdiMapMarkerOutline,
  mdiBookmarkOutline,
} from "@mdi/js";
import Input from "../components/ui/Input";
import { useApi } from "../hooks/useApi";
import { useViewNavigate } from "../hooks/useViewNavigate";
import { DateTimeSelector } from "../components/ui/DateTimeSelector";
import { useData } from "../hooks/useData";
import { useIsMobile } from "../hooks/useIsMobile";
import { useExitAnim } from "../hooks/useExitAnim";
import { useSignIn, useAuth } from "@clerk/clerk-react";
import { statusLabels } from "../constants/statusLabels";
import { useRefreshNotice } from "../hooks/useRefreshNotice";
import GoogleMap from "../components/ui/GoogleMap";
import BackgroundPanel from "../components/ui/BackgroundPanel";
import { INITIAL_SHEET_SNAP } from "../hooks/useBottomSheet";
import { CenterPin } from "../components/ui/mapOverlays";
import { useWebsiteCopy } from "../hooks/useWebsiteCopy";
import { useTranslation } from "react-i18next";

// ---- Shared layout + type scale -------------------------------------------
// Same tokens as VehicleSelect / TrackingPage / RideDetails. 377px is the width
// this page's scaled controls already render at (290 × 1.3), reached here as a
// real width so the trip screens carry no transform and their type is honest.
const COL = "w-[min(86vw,100%)] sm:w-[377px]";
const TITLE = "font-bold text-3xl sm:text-5xl leading-tight";
const SUBTITLE = "text-lg sm:text-2xl font-normal leading-snug text-[var(--text-muted)]";
const STACK = "gap-6 sm:gap-8";
// Current Trip sets its own step between its heading, status and CTA.
const TRIP_STEP = "gap-4 sm:gap-5";
// The booking form sits just inside the page rail on phones. Marked important:
// it has to beat the 86vw default Button and Input carry for every other
// screen. sm+ is untouched — the components keep their fixed widths there.
const FORM_W = "max-sm:w-[78vw]!";
const ROUTE_FORM_ID = "route-details-form";

const firstAddressSegment = (address) => typeof address === "string"
  ? address.split(",")[0].trim()
  : "";


// Autocomplete state for one address field: debounced Google matches at 3+
// typed chars, recent places when (near-)empty. select() resolves coords
// (recents carry their own; Google picks cost one Details call); manual
// edits clear them.
export function useAddressSuggestions(value, setValue, setCoords, api, exclusiveRef, closeOthers, allowCurrentLocation = false) {
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
    .filter(p => typeof p?.address === "string" && p.address.trim())
    .map(p => ({ id: `saved-${p.id ?? p.label}`, saved: true, name: p.label, label: p.address, lat: p.lat ?? null, lng: p.lng ?? null }));
  const savedAddresses = new Set(saved.map(s => s.label));

  const currentLocationItem = {
    id: "__current_location__",
    get "label"() { return dc("Current location"); },
    name: "Current location",
    isCurrentLocation: true,
  };

  // Keep the empty field useful rather than turning it into history: after the
  // saved places, show one recency answer and one frequency answer. Select from
  // non-saved places so Home/Work cannot appear twice, then de-duplicate when
  // the same address happens to be both the latest and the most booked.
  const recentCandidates = recentPlaces.filter(
    p => typeof p?.label === "string"
      && p.label.trim()
      && !savedAddresses.has(p.label),
  );
  const mostRecent = [...recentCandidates]
    .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))[0];
  const mostBooked = [...recentCandidates]
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0];
  const recents = [mostRecent, mostBooked].filter(
    (place, index, selected) => place
      && selected.findIndex(candidate => candidate?.label === place.label) === index,
  );

  const items = typed
    ? googleSuggestions
      .map(s => ({ id: s.placePrediction?.placeId, label: s.placePrediction?.text?.text }))
      .filter(item => typeof item.label === "string" && item.label.trim())
    : [...(allowCurrentLocation ? [currentLocationItem] : []), ...saved, ...recents.map(p => ({ id: p.label, label: p.label, lat: p.lat, lng: p.lng }))];

  function selectResolvedAddress(label, coords) {
    if (typeof label !== "string" || !label.trim() || !coords) return;
    justSelectedRef.current = true;
    setCoords(coords);
    setValue(label);
    setExpanded(false);
    addRecentPlace(label, coords);
  }

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
        setLookupError(dc("Couldn't load suggestions. You can still type the address in full."));
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
    if (item.isCurrentLocation) {
      if (!navigator.geolocation) {
        setLookupError(dc("Location isn't available on this device."));
        return;
      }

      setLookupError(null);
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;

          let data;
          try {
            data = await api.reverseGeocode(latitude, longitude);
          } catch {
            data = { error: "network" };
          }

          const address = data?.formattedAddress;
          if (data?.error || !address) {
            setLookupError(dc("Couldn't determine your current address."));
            return;
          }

          // Set this immediately before the value changes so the autocomplete
          // effect preserves the coordinates belonging to this selection.
          justSelectedRef.current = true;
          setCoords({
            lat: latitude,
            lng: longitude,
          });
          setValue(address);
          setExpanded(false);
          addRecentPlace(address, {
            lat: latitude,
            lng: longitude,
          });
        },
        () => {
          setLookupError(dc("Couldn't access your current location."));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000,
        },
      );

      return;
    }

    justSelectedRef.current = true;
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
    // The action rows are useful even before a query or recent place exists,
    // so a focused address field always owns an open suggestion region.
    open();
  }

  function onBlur() {
    setExpanded(false);
  }

  return {
    items,
    savedItems: saved,
    dropdown,
    select,
    selectResolvedAddress,
    selectCurrentLocation: () => select(currentLocationItem),
    onFocus,
    onBlur,
    lookupError,
    typed,
  };
}

// Suggestion panel for an address input. `above` opens it over the input and
// reverses rows so the best match stays nearest the input. onMouseDown is
// prevented panel-wide: blur fires before click and would close the panel
// before a row's onClick could run.
export const SuggestionDropdown = ({ anim, items, onSelect, actions = [], above = false, error = null, typed = false, inline = false, className = "", emptyTitle, emptyMessage }) => {
    useCopyLanguage();
  const panelRef = useRef(null);
  const itemsKey = items.map(i => i.id).join("|");
  const animationClass = anim.closing ? "animate-dropdown-out" : "animate-dropdown";
  const panelClass = inline
    ? `${animationClass} relative z-10 w-full max-w-full bg-transparent`
    : `${animationClass} absolute z-10 ${above ? "bottom-13 sm:bottom-15 origin-bottom sm:origin-bottom-left" : "top-13 sm:top-15 sm:origin-top-left"} scale-[1] sm:scale-[1.3] max-sm:w-full sm:w-[290px] max-w-full bg-[var(--background-muted)] rounded-[16px] shadow-[0_4px_20px_2px_rgba(0,0,0,0.5)]`;

  // Opening upward: start scrolled to the bottom, where the best matches sit.
  useEffect(() => {
    if (above && panelRef.current)
      panelRef.current.scrollTop = panelRef.current.scrollHeight;
  }, [above, itemsKey, anim.mounted]);

  if (!anim.mounted) return null;

  // Nothing to list. A typed query still gets a panel — saying "no matches" or
  // why the lookup failed — but an untouched field with no recents stays silent
  // rather than popping an empty box on focus.
  const rows = above ? [...items].reverse() : items;
  const showEmptyState = items.length === 0 && (typed || error || emptyTitle);
  return (
    <div
      ref={panelRef}
      onMouseDown={(e) => e.preventDefault()}
      className={`${className} ${panelClass} ${inline ? "" : "max-h-[200px] overflow-y-auto scrollbar-inset"}`}
    >
      {showEmptyState && (
        <div className="px-4 py-3 text-left">
          <h4 className="text-sm text-[var(--text)]">
            {emptyTitle || (error ? dc("Suggestions unavailable") : dc("No matching places"))}
          </h4>
          <p className="mt-0.5 text-xs leading-snug text-[var(--text-muted)]">
            {emptyMessage || error || dc("Check the spelling, or type the address in full and we'll find it.")}
          </p>
        </div>
      )}

      {rows.length > 0 && <ul className={`flex w-full flex-col items-center justify-center ${inline ? "py-1" : "py-2"}`}>
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
              className={`${inline ? "w-full px-4" : "w-[97%] px-3 rounded-xl"} cursor-pointer transition-colors duration-250 hover:bg-[var(--background-primary)] active:bg-[var(--background-primary)]`}
              onClick={() => onSelect(item)}
              key={item.id}>
              <div
                className={`py-3 ${index !== rows.length - 1
                  ? "border-b border-[var(--foreground)]/20"
                  : ""
                  }`}
              >
                <h4 className={`text-left text-base ${inline ? "font-medium" : ""}`}>{mainLocation}</h4>
                <p className={`text-left text-[var(--text-muted)] ${inline ? "text-sm" : "text-xs"}`}>
                  {item.isCurrentLocation
                    ? dc("Use your current location")
                    : remainingLocation}
                </p>
              </div>
            </li>
          );
        })}
      </ul>}

      {actions.length > 0 && (
        <ul className={`flex w-full flex-col ${rows.length > 0 || showEmptyState ? "border-t border-[var(--foreground)]/15" : ""} ${inline ? "px-4 py-2" : "px-3 py-2"}`}>
          {actions.map((action) => (
            <li key={action.id}>
              <button
                type="button"
                onClick={action.onClick}
                className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl px-1 py-2 text-left transition-colors duration-200 hover:bg-[var(--background-primary)] active:bg-[var(--background-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]/70"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--background-muted)] text-[var(--text)]">
                  <Icon path={action.icon} size={0.9} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-medium text-[var(--text)]">{action.label}</span>
                  {action.description && <span className="block text-xs leading-snug text-[var(--text-muted)]">{action.description}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// The route form uses the same draggable booking sheet as the later vehicle
// stage on phones. From sm upward it stays a regular content column so the
// established form-and-map split is unchanged.
const RoutePanel = ({ sheet, isMobile, className, children, bottomInset = 0, contentKey, fillAvailable = true, onSnapChange }) => {
    useCopyLanguage();
  if (sheet && isMobile) {
    return (
      <BackgroundPanel
        sheet
        fillAvailable={fillAvailable}
        duration={420}
        bottomInset={bottomInset}
        contentKey={contentKey}
        onSnapChange={onSnapChange}
        className={className}
      >
        {children}
      </BackgroundPanel>
    );
  }

  return <div className={`relative ${className}`}>{children}</div>;
};

const ACTIVE_STATUSES = ["pending", "confirmed", "assigned", "en_route", "reached", "started"];
const OUTSTATION_DISTANCE_KM = 200;

const OnBoarding = ({ bookingStage = false, timingStep = false, highlightRideNow = false, onMapPickerChange }) => {
    useCopyLanguage();
  const tr = useWebsiteCopy();
  const { i18n } = useTranslation();
  const dateLocale = i18n.language === "hi" ? "hi-IN" : "en-IN";
  const formWidth = bookingStage ? "max-sm:w-full!" : FORM_W;
  const timing = useData(state => state.timing);
  const setTiming = useData(state => state.setTiming);
  const [expand, setExpand] = useState(false);
  const [expandCalendar, setExpandCalendar] = useState(false);
  const pickupLocation = useData(state => state.pickupLocation);
  const setPickup = useData(state => state.setPickup);
  const dropLocation = useData(state => state.dropLocation);
  const setDrop = useData(state => state.setDrop)
  const pickupCoords = useData(state => state.pickupCoords);
  const dropCoords = useData(state => state.dropCoords);
  const setPickupCoords = useData(state => state.setPickupCoords);
  const setDropCoords = useData(state => state.setDropCoords);
  const setDistanceKm = useData(state => state.setDistanceKm);
  const setDurationMin = useData(state => state.setDurationMin);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scheduledTime = useData(state => state.scheduledTime);
  const setScheduledTime = useData(state => state.setScheduledTime);
  const setBookingId = useData(state => state.setBookingId);
  const setFare = useData(state => state.setFare);
  const setVehicleClass = useData(state => state.setVehicleClass);
  const setStatus = useData(state => state.setStatus);
  const setBookingCode = useData(state => state.setBookingCode);
  const activeBooking = useData(state => state.activeBooking);
  const setActiveBooking = useData(state => state.setActiveBooking);
  const clearActiveBooking = useData(state => state.clearActiveBooking);
  const mergeRecentPlaces = useData(state => state.mergeRecentPlaces);
  const setSavedPlaces = useData(state => state.setSavedPlaces);
  const { isSignedIn } = useAuth();
  const devAuthBypass = useData(state => state.devAuthBypass);
  // Render gate only; the hydration effect stays on real isSignedIn so the
  // dev preview never hits the API.
  const authed = isSignedIn || devAuthBypass;
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
    setDistanceKm(activeBooking.distanceKm ?? null);
    setDurationMin(activeBooking.durationMin ?? null);
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
    // The server is authoritative in both directions. Without this branch a
    // cancelled ride persisted in sessionStorage survived every successful
    // refresh because hydration only ever wrote a found booking.
    if (!active) {
      clearActiveBooking();
      return;
    }
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
      distanceKm: active.distanceKm,
      durationMin: active.durationMin,
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
  const [activeSuggestion, setActiveSuggestion] = useState(null);
  const [editingLocation, setEditingLocation] = useState(null);
  const [savedSuggestionTarget, setSavedSuggestionTarget] = useState(null);
  const [mapPickerTarget, setMapPickerTarget] = useState(null);
  const [mapPickerCoords, setMapPickerCoords] = useState(null);
  const [mapPickerLoading, setMapPickerLoading] = useState(false);
  const [mapPickerError, setMapPickerError] = useState(null);
  const dropInputRef = useRef(null);
  const dropAutoFocusedRef = useRef(false);
  const currentLocationRequested = useRef(false);

  useEffect(() => {
    onMapPickerChange?.(Boolean(mapPickerTarget));
    return () => onMapPickerChange?.(false);
  }, [mapPickerTarget, onMapPickerChange]);

  const selectPickupSuggestion = (item) => {
    document.activeElement?.blur();
    setEditingLocation(null);
    setActiveSuggestion(null);
    setSavedSuggestionTarget(null);
    return pickupAutocomplete.select(item);
  };

  const selectDropSuggestion = (item) => {
    document.activeElement?.blur();
    setEditingLocation(null);
    setActiveSuggestion(null);
    setSavedSuggestionTarget(null);
    return dropAutocomplete.select(item);
  };

  const autocompleteFor = (target) => target === "pickup" ? pickupAutocomplete : dropAutocomplete;

  const startMapPicker = (target) => {
    document.activeElement?.blur();
    closeSuggestions();
    setEditingLocation(null);
    setActiveSuggestion(null);
    setSavedSuggestionTarget(null);
    setMapPickerError(null);
    setMapPickerCoords(
      (target === "pickup" ? pickupCoords : dropCoords)
      ?? pickupCoords
      ?? dropCoords
      ?? { lat: 28.6315, lng: 77.2167 },
    );
    setMapPickerTarget(target);
  };

  const closeMapPicker = () => {
    const target = mapPickerTarget;
    setMapPickerTarget(null);
    setMapPickerError(null);
    window.setTimeout(() => document.getElementById(`${target}-location`)?.focus(), 0);
  };

  const confirmMapPicker = async () => {
    if (!mapPickerTarget || !mapPickerCoords || mapPickerLoading) return;
    setMapPickerLoading(true);
    setMapPickerError(null);
    try {
      const data = await api.reverseGeocode(mapPickerCoords.lat, mapPickerCoords.lng);
      if (data?.error || !data?.formattedAddress) {
        setMapPickerError(dc("Couldn't find an address at this point. Move the map and try again."));
        return;
      }
      autocompleteFor(mapPickerTarget).selectResolvedAddress(data.formattedAddress, mapPickerCoords);
      setMapPickerTarget(null);
    } catch {
      setMapPickerError(dc("Couldn't find an address at this point. Move the map and try again."));
    } finally {
      setMapPickerLoading(false);
    }
  };

  const suggestionActions = (target) => [
    {
      id: `${target}-map`,
      get "label"() { return dc("Set location on map"); },
      get "description"() { return dc("Choose a precise point"); },
      icon: mdiMapMarkerOutline,
      onClick: () => startMapPicker(target),
    },
    {
      id: `${target}-saved`,
      get "label"() { return dc("See saved places"); },
      get "description"() { return dc("Home, Work and saved addresses"); },
      icon: mdiBookmarkOutline,
      onClick: () => setSavedSuggestionTarget(target),
    },
  ];

  const suggestionItemsFor = (target, autocomplete) => {
    if (savedSuggestionTarget === target) return autocomplete.savedItems;
    if (autocomplete.typed) return autocomplete.items;
    const oppositeLocation = target === "pickup" ? dropLocation : pickupLocation;
    return autocomplete.items.filter(item => (
      item.saved || !oppositeLocation?.trim() || item.label !== oppositeLocation
    ));
  };

  // The route step uses the same mobile sheet contract as vehicle selection:
  // the primary action lives in a measured bar below the sheet, and the sheet
  // reports its settled stop so secondary copy can disappear when collapsed.
  const showsCurrentTrip = !!(activeBooking && authed && !activeBooking.scheduledAt);
  const showsRouteForm = !showsCurrentTrip
    && (!(activeBooking && authed && activeBooking.scheduledAt) || showForm);
  const pinPriceBar = bookingStage && isMobile && showsRouteForm && !mapPickerTarget;
  const priceBarRef = useRef(null);
  const [priceBarHeight, setPriceBarHeight] = useState(0);
  const [sheetSnap, setSheetSnap] = useState(INITIAL_SHEET_SNAP);

  useEffect(() => {
    const el = priceBarRef.current;
    if (!el) {
      setPriceBarHeight(0);
      return;
    }
    setPriceBarHeight(el.offsetHeight);
    const observer = new ResizeObserver(([entry]) => {
      setPriceBarHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [pinPriceBar]);

  useEffect(() => {
    if (!pinPriceBar) setSheetSnap(INITIAL_SHEET_SNAP);
  }, [pinPriceBar]);

  const priceBarCollapsed = pinPriceBar && sheetSnap === "collapsed";

  useEffect(() => {
    if (!bookingStage || !isMobile || timingStep || mapPickerTarget || !showsRouteForm || dropAutoFocusedRef.current) return undefined;
    const frame = window.requestAnimationFrame(() => {
      dropInputRef.current?.focus({ preventScroll: true });
      if (document.activeElement === dropInputRef.current) dropAutoFocusedRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [bookingStage, isMobile, timingStep, mapPickerTarget, showsRouteForm]);

  // The route form now follows the destination-first landing bar. A pickup is
  // therefore useful immediately, rather than asking the rider to re-enter
  // where they already are. If permission is unavailable the existing field
  // remains editable and its current-location row provides a retry.
  useEffect(() => {
    if (!bookingStage || pickupLocation?.trim() || currentLocationRequested.current) return;
    currentLocationRequested.current = true;
    pickupAutocomplete.selectCurrentLocation();
  }, [bookingStage, pickupLocation]);

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

  function handleSubmit(e) {
    e.preventDefault();

    if (!pickupLocation?.trim()) {
      setError("No Pickup Location");
      return;
    }

    if (!dropLocation?.trim()) {
      setError("No Drop Location");
      return;
    }

    setError(null);
    if (timing === "Schedule") {
      closeSuggestions();
      setExpand(false);
      navigate("/book", { state: { stage: "timing" } });
      return;
    }

    continueToPrices();
  }

  function handleTimingContinue() {
    if (!scheduledTime) {
      setError("No Scheduled Time");
      return;
    }
    if (scheduledTime.getTime() < Date.now() + 30 * 60 * 1000) {
      setError("Scheduled Time Too Soon");
      return;
    }
    continueToPrices();
  }

  async function continueToPrices() {

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
            ? dc("You already have a ride scheduled around this time")
            : dc("You already have a ride active right now")
        );
        return;
      }

      // Same route at a different time is almost certainly a duplicate.
      if (sameRoute) {
        setError(dc("You already have an active booking for this route"));
        return;
      }
    }

    try {
      setError(null);
      setLoading(true);

      // Distance is decided at the moment the rider asks for prices. Run the
      // route check beside the existing account check so local trips do not pay
      // for two serial network waits. Fare estimation is deliberately best
      // effort here: /book still owns the detailed pricing error state.
      const [estimateResult, accountResult] = await Promise.allSettled([
        api.estimateFare(
          pickupLocation,
          dropLocation,
          "hatchback",
          pickupCoords,
          dropCoords,
          false,
          false,
        ),
        api.getMe(),
      ]);

      const estimate = estimateResult.status === "fulfilled" ? estimateResult.value : null;
      if (Number.isFinite(estimate?.distanceKm) && estimate.distanceKm > OUTSTATION_DISTANCE_KM) {
        navigate("/outstation");
        return;
      }

      if (accountResult.status === "rejected") throw accountResult.reason;
      const data = accountResult.value;

      if (data?.error) {
        navigate("/login");
        return;
      }
      // Vehicle choice belongs to the new request. Both Ride Now and Schedule
      // enter the price screen with the economy class selected initially.
      setVehicleClass("hatchback");
      navigate("/book", {
        state: estimate && !estimate.error
          ? {
              stage: "vehicle",
              fareEstimate: {
                data: estimate,
                pickupLocation,
                dropLocation,
                pickupCoords,
                dropCoords,
                createdAt: Date.now(),
              },
            }
          : { stage: "vehicle" },
      });
    } catch (err) {
      console.error(err);
      setError(tr("Something went wrong"));
    } finally {
      setLoading(false);
    }
  }

  // One action definition serves the desktop form and the mobile bar. The
  // `form` attribute lets the pinned mobile button submit the form inside the
  // sheet, exactly like the vehicle step's Book button.
  const scheduledTimeIsBookable = scheduledTime instanceof Date
    && scheduledTime.getTime() >= Date.now() + 30 * 60 * 1000;

  const priceAction = (
    <div className={`flex w-full shrink-0 flex-col gap-2 sm:items-start sm:gap-5 ${bookingStage ? "items-start" : "items-center"}`}>
      <Button
        onClick={timingStep ? handleTimingContinue : undefined}
        prop={{
          type: timingStep ? "button" : "submit",
          form: timingStep ? undefined : ROUTE_FORM_ID,
          disabled:
            loading ||
            (timingStep && !scheduledTimeIsBookable) ||
            !pickupLocation?.trim() ||
            !dropLocation?.trim(),
        }}
        className={`scale-[1] sm:scale-[1.3] sm:origin-left ${formWidth}`}
      >
        {loading ? tr("Loading...") : tr("See prices")}
      </Button>

      {!priceBarCollapsed && (
        <p className={`relative text-[var(--text-muted)] sm:order-first sm:text-left sm:text-lg ${bookingStage ? "w-full text-center sm:w-auto" : "order-first text-center"}`}>
          {timingStep && error === "Scheduled Time Too Soon"
            ? tr("* Choose a time at least 30 minutes from now")
            : timing === "Now"
            ? tr("* Subject to availability")
            : tr("* 99% guaranteed cab allocation")}
        </p>
      )}
    </div>
  );

  return (
    <div className={`relative flex h-[100dvh] flex-col items-center bg-[var(--background-primary)] sm:flex-row sm:justify-center sm:px-[9%] md:px-[5%] lg:justify-between xl:px-[13%] ${bookingStage ? "overflow-hidden" : "sm:pt-16"}`}>
      <RoutePanel
        key={mapPickerTarget ? `map-${mapPickerTarget}` : timingStep ? "timing" : "details"}
        sheet={bookingStage}
        isMobile={isMobile}
        bottomInset={pinPriceBar ? priceBarHeight : 0}
        contentKey={`${showsRouteForm}-${timingStep}-${timing}-${activeSuggestion ?? "none"}-${mapPickerTarget ?? "form"}`}
        fillAvailable={!mapPickerTarget}
        onSnapChange={setSheetSnap}
        className={`z-10 flex h-[inherit] w-full max-w-[500px] flex-col items-center py-8 sm:h-fit sm:justify-center lg:items-start ${bookingStage ? mapPickerTarget ? "max-sm:h-auto max-sm:items-start max-sm:justify-start max-sm:px-[7vw] max-sm:py-6" : "max-sm:items-start max-sm:justify-start max-sm:px-[7vw] max-[359px]:px-2! max-sm:py-6 max-sm:pb-0" : "justify-end"}`}
      >
        {bookingStage && !mapPickerTarget && (
          <button
            type="button"
            onClick={() => timingStep
              ? navigate("/book", { replace: true })
              : navigate("/")}
            aria-label={timingStep ? tr("Back to route details") : tr("Back to home")}
            className="absolute -top-12 left-4 z-20 my-1 flex h-9 cursor-pointer items-center justify-center rounded-full border border-[var(--foreground)]/30 bg-[var(--background-muted)] px-3 text-[var(--text)] shadow-[0_4px_20px_2px_rgba(0,0,0,0.5)] transition-opacity duration-300 hover:opacity-100 active:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)] sm:hidden"
          >
            <Icon path={mdiKeyboardBackspace} size={1.2} aria-hidden="true" />
          </button>
        )}
        {mapPickerTarget
          ? <div className={`flex w-full flex-col items-start gap-4 ${COL}`}>
              <div className="flex w-full flex-col items-start gap-1">
                <h1 className={`text-left ${TITLE}`}>{tr("Confirm")} {mapPickerTarget === "pickup" ? tr("pickup") : tr("drop")} {tr("location")}</h1>
                <p className="text-left text-base leading-snug text-[var(--text-muted)] sm:text-lg">
                  {tr("Move the map until the pin is exactly where you want it.")}
                </p>
              </div>
              {mapPickerError && <p className="text-left text-sm leading-snug text-red-400">{mapPickerError}</p>}
              <Button
                onClick={confirmMapPicker}
                prop={{ type: "button", width: "100%", disabled: mapPickerLoading || !mapPickerCoords }}
                className="my-0! w-full"
              >
                <span className="text-base sm:text-lg">{mapPickerLoading ? tr("Finding address...") : dc("{{value0}} {{value1}} {{value2}}", {value0: (tr("Confirm")), value1: (mapPickerTarget === "pickup" ? tr("pickup") : tr("drop")), value2: (tr("location"))})}</span>
              </Button>
            </div>
          : (activeBooking && authed && !activeBooking.scheduledAt)
          ? <div className={`flex w-full flex-col items-center justify-center lg:items-start ${TRIP_STEP}`}>
            <div className={`flex flex-col items-center ${COL}`}>
              <h1 className="w-full text-center text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">{tr("Current Trip")}</h1>
            </div>

            <div className={`flex flex-col items-stretch gap-3 text-left ${COL}`}>
              <div className="rounded-2xl bg-[var(--background-muted)] px-5 py-4 text-center" aria-live="polite">
                <p className="text-lg font-semibold leading-tight sm:text-xl">
                  {tr(statusLabels[activeBooking.status] || "On trip")}
                </p>
              </div>
              <Button onClick={openActiveBooking} className="my-0!" prop={{ variant: "", width: "100%" }}>
                <span className="text-base sm:text-lg">{tr("Track Ride")}</span>
              </Button>
            </div>
          </div>
          : <div className={`flex flex-col text-center lg:text-left justify-center items-center lg:items-start gap-1 sm:gap-5 ${bookingStage ? "max-sm:min-h-0 max-sm:w-full max-sm:flex-1 max-sm:items-start max-sm:justify-start max-sm:gap-3 max-sm:text-left" : ""}`}>
            {activeBooking && authed && activeBooking.scheduledAt && !showForm
              ? <div className={`flex w-[86vw] flex-col items-center justify-center sm:w-[377px] ${TRIP_STEP}`}>
                <div className="flex w-full flex-col items-center">
                  <h1 className="w-full text-center text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">{tr("Scheduled Ride")}</h1>
                </div>
                <div className="flex w-full flex-col items-stretch gap-3 text-left">
                  <div className="rounded-2xl bg-[var(--background-muted)] px-5 py-4 text-center" aria-live="polite">
                    <p className="text-sm leading-snug text-[var(--text-muted)] sm:text-base">
                      {new Date(activeBooking.scheduledAt).toLocaleString(dateLocale, {
                        day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
                      })}
                    </p>
                    <p className="mt-1 text-lg font-semibold leading-tight sm:text-xl">
                      {tr(statusLabels[activeBooking.status] || activeBooking.status)}
                    </p>
                  </div>

                  <Button onClick={openActiveBooking} className="my-0!" prop={{ variant: "", width: "100%" }}>
                    <span className="text-base sm:text-lg">{tr("View Ride")}</span>
                  </Button>

                  <Button onClick={() => setShowForm(true)} className="my-0!" prop={{ variant: "input", width: "100%", bg: "var(--background-primary)" }}>
                    <span className="text-base sm:text-lg">{tr("Book another ride")}</span>
                  </Button>
                </div>
              </div>
              : ""}

            {(!(activeBooking && authed && activeBooking.scheduledAt) || showForm) && (timingStep ? (
              <section className={`flex w-full min-h-0 flex-1 flex-col items-center gap-4 sm:w-[377px] sm:flex-none sm:items-start sm:gap-5`}>
                <div className="w-full shrink-0">
                  <h1 className={`text-left ${TITLE}`}>{tr("Choose date & time")}</h1>
                  <p className={`mt-1 text-left ${SUBTITLE}`}>{tr("When should your driver arrive?")}</p>
                </div>

                <div data-sheet-scroll className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain px-1 pb-2 scrollbar-inset sm:flex-none sm:overflow-visible sm:px-0 sm:pb-0">
                  <DateTimeSelector
                    page
                    initial={scheduledTime}
                    showClose={false}
                    showConfirm={false}
                    onChange={(dt) => {
                      setScheduledTime(dt);
                      if (error === "No Scheduled Time" || error === "Scheduled Time Too Soon") setError(null);
                    }}
                  />
                </div>

                {(!bookingStage || !isMobile) && priceAction}
              </section>
            ) : <>
              <h1 className={`shrink-0 text-left ${TITLE} ${formWidth} sm:w-[377px]`}>
                {tr("Find a ride")}
              </h1>
              <form
                id={ROUTE_FORM_ID}
                className={`mt-1 flex flex-col items-start gap-1 sm:mt-1 sm:w-[377px] sm:justify-center sm:gap-5 ${bookingStage ? "max-sm:min-h-0 max-sm:w-full max-sm:flex-1 max-sm:items-start max-sm:overflow-clip" : "justify-center"}`}
                noValidate
                onSubmit={handleSubmit}
              >
                <div className="flex w-full shrink-0 flex-col items-start gap-2 sm:contents">
                {error && (
                  <p className={`${error ? "opacity-[1]" : "opacity-[0]"} relative text-red-400 left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 text-sm`}>
                    {dc(error)}
                  </p>
                )}
                <div className={`mb-2 flex items-center justify-start gap-1 px-1 max-[335px]:flex-wrap max-[335px]:gap-y-2 ${formWidth} sm:mb-0 sm:w-[377px] sm:gap-2 sm:px-0`}>
                  <div className="flex shrink-0 gap-1 rounded-full scale-[0.9] bg-[var(--background-muted)] p-1.5 outline outline-[var(--foreground)]/40 sm:gap-2 sm:p-2 [&>*]:cursor-pointer [&>*]:rounded-full [&>*]:px-3 [&>*]:py-1 [&>*]:text-base [&>*]:sm:px-3 [&>*]:sm:py-2 [&>*]:sm:text-xl">
                    <button type="button" aria-pressed={!isRoundTrip} onClick={() => setIsRoundTrip(false)} className={`transition-colors duration-300 text-[var(--text)] ${isRoundTrip ? "" : "bg-primary"}`}>
                      {tr("One way")}
                    </button>
                    <button type="button" aria-pressed={isRoundTrip} onClick={() => setIsRoundTrip(true)} className={`transition-colors duration-300 text-[var(--text)] ${isRoundTrip ? "bg-primary" : ""}`}>
                      {tr("Round trip")}
                    </button>
                  </div>

                  <div className="relative shrink-0">
                    <Button
                      onClick={() => {
                        closeSuggestions();
                        setExpandCalendar(false);
                        setExpand(!expand);
                      }}
                      prop={{
                        variant: "input",
                        bg: highlightRideNow && timing === "Now"
                          ? "var(--foreground)"
                          : expand ? "var(--background-primary)" : "var(--background-muted)",
                      }}
                      className={`relative my-0! px-2 sm:origin-left scale-[0.9] rounded-full ${highlightRideNow && timing === "Now"
                        ? "text-[var(--text-foreground)]! hover:bg-[var(--foreground)]! active:bg-[var(--foreground)]/90!"
                        : ""
                      }`}
                    >
                      <div className="flex w-full items-center justify-center gap-1 whitespace-nowrap">
                        <Icon path={mdiClockTimeFourOutline} size={isMobile ? 0.8 : 0.9} />
                        {timing === "Schedule" ? tr("Later") : tr(timing)}
                        <Icon
                          className="opacity-70 transition-opacity duration-300 hover:opacity-100"
                          path={mdiChevronDown}
                          size={isMobile ? 0.8 : 0.9}
                          style={{ transform: expand ? "rotate(180deg)" : "rotate(0deg)" }}
                        />
                      </div>
                    </Button>

                    {timingDropdown.mounted && (
                      <Button
                        prop={{ variant: "dropdown", width: "155px" }}
                        className={`absolute right-0 top-12 z-10 block origin-top-right scale-[1] active:opacity-[1] hover:opacity-[1] sm:left-0 sm:right-auto sm:top-14 sm:origin-top-left sm:scale-[1.2] ${timingDropdown.closing ? "animate-dropdown-out" : "animate-dropdown"}`}
                      >
                        <div className="flex flex-col items-start">
                          <div
                            onClick={() => {
                              setTiming("Schedule");
                              setExpandCalendar(false);
                              setExpand(false);
                            }}
                            className={`flex w-full items-center gap-2 border-b border-[var(--foreground)]/40 py-1 pb-2 ${timing === "Schedule" ? "text-white-muted" : "text-white"}`}
                          >
                            {tr("Schedule a ride")}
                          </div>
                          <div
                            onClick={() => {
                              setTiming("Now");
                              setExpand(false);
                              setError(null);
                              setExpandCalendar(false);
                              setScheduledTime(null);
                            }}
                            className={`flex w-full items-center gap-2 py-1 pt-2 ${timing === "Now" ? "text-white-muted" : "text-white"}`}
                          >
                            {tr("Ride now")}
                          </div>
                        </div>
                      </Button>
                    )}
                  </div>
                </div>
                <div className={`relative ${bookingStage ? "max-sm:w-full" : ""}`}>
                  <Input
                    prop={{
                      type: "text",
                      id: "pickup-location",
                      name: "pickup-location",
                      placeholder: tr("Pickup Location"),
                      value: editingLocation === "pickup"
                        ? pickupLocation
                        : firstAddressSegment(pickupLocation),
                      onChangeFn: (value) => {
                        setSavedSuggestionTarget(null);
                        setPickup(value);
                        if (error === "No Pickup Location") {
                          setError(null);
                        }
                      },
                      error: error === "No Pickup Location",
                      bg: "var(--background-muted)",
                      autoComplete: "off",
                      onFocusFn: () => {
                        setEditingLocation("pickup");
                        setActiveSuggestion("pickup");
                        pickupAutocomplete.onFocus();
                      },
                      onBlurFn: () => {
                        setEditingLocation(null);
                        pickupAutocomplete.onBlur();
                      },
                    }}
                    className={`scale-[1] sm:scale-[1.3] sm:origin-left ${formWidth}`}
                    leading={
                      <div className="w-3 h-3 rounded-full bg-[var(--foreground)]" />
                    }
                    trailing={
                      pickupLocation?.trim() ? (
                        <button
                          type="button"
                          aria-label={tr("Clear pickup location")}
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

                  {(!bookingStage || !isMobile) && <SuggestionDropdown
                    anim={pickupAutocomplete.dropdown}
                    items={suggestionItemsFor("pickup", pickupAutocomplete)}
                    onSelect={selectPickupSuggestion}
                    actions={suggestionActions("pickup")}
                    above={isMobile}
                    error={savedSuggestionTarget === "pickup" ? null : pickupAutocomplete.lookupError}
                    typed={savedSuggestionTarget === "pickup" ? false : pickupAutocomplete.typed}
                    emptyTitle={savedSuggestionTarget === "pickup" ? dc("No saved places yet") : undefined}
                    emptyMessage={savedSuggestionTarget === "pickup" ? dc("Save Home, Work or another address from Settings.") : undefined}
                  />}
                </div>


                <div className={`relative ${bookingStage ? "max-sm:w-full" : ""}`}>
                  <Input
                    prop={{
                      type: "text",
                      id: "drop-location",
                      name: "drop-location",
                      placeholder: tr("Drop Location"),
                      value: editingLocation === "drop"
                        ? dropLocation
                        : firstAddressSegment(dropLocation),
                      onChangeFn: (value) => {
                        setSavedSuggestionTarget(null);
                        setDrop(value);
                        if (error === "No Drop Location") {
                          setError(null);
                        }
                      },
                      error: error === "No Drop Location",
                      bg: "var(--background-muted)",
                      inputRef: dropInputRef,
                      autoComplete: "off",
                      onFocusFn: () => {
                        setEditingLocation("drop");
                        setActiveSuggestion("drop");
                        dropAutocomplete.onFocus();
                      },
                      onBlurFn: () => {
                        setEditingLocation(null);
                        dropAutocomplete.onBlur();
                      },
                    }}
                    className={`scale-[1] sm:scale-[1.3] sm:origin-left ${formWidth}`}
                    leading={
                      <div className="w-3 h-3 rounded-full bg-primary relative">
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[var(--background)]" />
                      </div>
                    }
                    trailing={
                      dropLocation?.trim() ? (
                        <button
                          type="button"
                          aria-label={tr("Clear drop location")}
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

                  {(!bookingStage || !isMobile) && <SuggestionDropdown
                    anim={dropAutocomplete.dropdown}
                    items={suggestionItemsFor("drop", dropAutocomplete)}
                    onSelect={selectDropSuggestion}
                    actions={suggestionActions("drop")}
                    above
                    error={savedSuggestionTarget === "drop" ? null : dropAutocomplete.lookupError}
                    typed={savedSuggestionTarget === "drop" ? false : dropAutocomplete.typed}
                    emptyTitle={savedSuggestionTarget === "drop" ? dc("No saved places yet") : undefined}
                    emptyMessage={savedSuggestionTarget === "drop" ? dc("Save Home, Work or another address from Settings.") : undefined}
                  />}
                </div>

                {!bookingStage && timing === "Schedule" && (<div className="relative flex w-full flex-col items-start">
                  <div className={`flex items-center justify-start sm:origin-left sm:scale-[1.3] sm:w-[290px] ${formWidth}`}>
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
                      className="relative px-2 pr-3"
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
                              />{dc("Edit")}</span>
                          ) : (
                            <div className="flex justify-center items-center gap-1">
                              <Icon
                                path={mdiCalendarMonthOutline}
                                size={0.9}
                              />{dc("When")}</div>
                          )}
                        </div>
                      </div>
                    </Button>
                  </div>

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
                </div>)}
                </div>

                {bookingStage && isMobile && (
                  <div data-sheet-scroll className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain scrollbar-inset" aria-live="polite">
                    {activeSuggestion === "pickup" && (
                      <SuggestionDropdown
                        inline
                        anim={pickupAutocomplete.dropdown}
                        items={suggestionItemsFor("pickup", pickupAutocomplete)}
                        onSelect={selectPickupSuggestion}
                        actions={suggestionActions("pickup")}
                        error={savedSuggestionTarget === "pickup" ? null : pickupAutocomplete.lookupError}
                        typed={savedSuggestionTarget === "pickup" ? false : pickupAutocomplete.typed}
                        emptyTitle={savedSuggestionTarget === "pickup" ? dc("No saved places yet") : undefined}
                        emptyMessage={savedSuggestionTarget === "pickup" ? dc("Save Home, Work or another address from Settings.") : undefined}
                      />
                    )}
                    {activeSuggestion === "drop" && (
                      <SuggestionDropdown
                        inline
                        anim={dropAutocomplete.dropdown}
                        items={suggestionItemsFor("drop", dropAutocomplete)}
                        onSelect={selectDropSuggestion}
                        actions={suggestionActions("drop")}
                        error={savedSuggestionTarget === "drop" ? null : dropAutocomplete.lookupError}
                        typed={savedSuggestionTarget === "drop" ? false : dropAutocomplete.typed}
                        emptyTitle={savedSuggestionTarget === "drop" ? dc("No saved places yet") : undefined}
                        emptyMessage={savedSuggestionTarget === "drop" ? dc("Save Home, Work or another address from Settings.") : undefined}
                      />
                    )}
                  </div>
                )}

                {(!bookingStage || !isMobile) && priceAction}
              </form>
            </>)}
          </div>
        }
      </RoutePanel>

      {pinPriceBar && (
        <div
          ref={priceBarRef}
          className="absolute inset-x-0 bottom-0 z-20 flex justify-center border-t border-[var(--foreground)]/10 bg-panel-gradient px-[7vw] pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        >
          <div className={COL}>{priceAction}</div>
        </div>
      )}

      {bookingStage ? <>
        <GoogleMap
          center={mapPickerTarget ? mapPickerCoords : pickupCoords ?? { lat: 28.6315, lng: 77.2167 }}
          zoom={mapPickerTarget ? 17 : 12}
          onIdle={mapPickerTarget ? setMapPickerCoords : undefined}
          className="absolute inset-0 z-0 sm:hidden"
        >
          {mapPickerTarget && <CenterPin target={mapPickerTarget} />}
        </GoogleMap>
        <GoogleMap
          center={mapPickerTarget ? mapPickerCoords : pickupCoords ?? { lat: 28.6315, lng: 77.2167 }}
          zoom={mapPickerTarget ? 17 : 12}
          onIdle={mapPickerTarget ? setMapPickerCoords : undefined}
          className="relative z-0 mr-[2vw] hidden h-[min(76vh,680px)] w-[min(46vw,720px)] overflow-hidden rounded-[24px] shadow-[0_12px_36px_rgba(0,0,0,0.25)] sm:block"
        >
          {mapPickerTarget && <CenterPin target={mapPickerTarget} />}
        </GoogleMap>

        {mapPickerTarget && (
          <button
            type="button"
            onClick={closeMapPicker}
            aria-label={tr("Back to location search")}
            className="absolute left-4 top-[calc(1rem+env(safe-area-inset-top))] z-30 flex h-10 cursor-pointer items-center justify-center rounded-full border border-[var(--foreground)]/30 bg-[var(--background-muted)] px-3 text-[var(--text)] shadow-[0_4px_20px_2px_rgba(0,0,0,0.45)] transition-opacity duration-300 hover:opacity-100 active:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)] sm:left-8 sm:top-8"
          >
            <Icon path={mdiKeyboardBackspace} size={1.2} aria-hidden="true" />
          </button>
        )}
      </> : <>
        <div className="block sm:hidden absolute z-5 inset-x-0 top-0 h-[100dvh] bg-[linear-gradient(to_top,var(--background)_30%,var(--background-primary)_45%,transparent_90%)]" />
        <img
          src={mobileBackgroundIllustration}
          alt={dc("background-illustration")}
          className="absolute block sm:hidden z-0 w-full h-full object-top -top-20 object-cover bg-gradient"
        />
        <img
          src={laptopBackgroundIllustration}
          alt={dc("background-illustration")}
          className="lg:w-[500px] lg:h-[430px] xl:w-[560px] xl:h-[440px] object-cover lg:block hidden rounded-lg"
        />
      </>}
    </div>
  );
};

export default OnBoarding;

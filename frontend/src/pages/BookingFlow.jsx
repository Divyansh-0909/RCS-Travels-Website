import { useLocation } from "react-router-dom";
import Icon from "@mdi/react";
import { mdiKeyboardBackspace } from "@mdi/js";
import { useViewNavigate } from "../hooks/useViewNavigate";
import OnBoarding from "./OnBoarding";
import VehicleSelect from "./VehicleSelect";

// `/book` deliberately owns both stages. The landing bar supplies the drop-off
// first, this map-backed form completes the trip details, and only then does
// the fare/vehicle screen mount. Keeping the route stable preserves protected
// navigation and prevents a half-complete trip from becoming a shareable URL.
const BookingFlow = () => {
  const location = useLocation();
  const navigate = useViewNavigate();
  const vehicleStage = location.state?.stage === "vehicle";

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-[var(--background-primary)]">
      {!vehicleStage && (
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="Back to home"
          className="fixed left-4 top-4 z-30 flex cursor-pointer items-center justify-center text-[var(--text)] transition-opacity duration-300 hover:opacity-100 active:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)] max-sm:h-9 max-sm:px-3 max-sm:rounded-full max-sm:border max-sm:border-[var(--foreground)]/30 max-sm:bg-[var(--background-muted)] max-sm:shadow-[0_4px_20px_2px_rgba(0,0,0,0.5)] sm:left-5 sm:top-6 sm:opacity-80"
        >
          <Icon path={mdiKeyboardBackspace} size={1.2} aria-hidden="true" />
        </button>
      )}
      {vehicleStage
        ? <VehicleSelect />
        : <OnBoarding bookingStage />}
    </div>
  );
};

export default BookingFlow;

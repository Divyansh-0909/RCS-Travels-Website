import IconButton from "../components/ui/IconButton";
import { useTranslation as useCopyLanguage } from "react-i18next";
import { websiteCopy as dc } from "../i18nCopy";
import { useState } from "react";
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
    useCopyLanguage();
  const location = useLocation();
  const navigate = useViewNavigate();
  const vehicleStage = location.state?.stage === "vehicle";
  const timingStage = location.state?.stage === "timing";
  const [mapPickerActive, setMapPickerActive] = useState(false);

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-immersive">
      {!vehicleStage && !mapPickerActive && (
        <IconButton type="button" onClick={() => timingStage
            ? navigate("/book", { replace: true })
            : navigate("/")} aria-label={timingStage ? dc("Back to route details") : dc("Back to home")} className="fixed left-5 top-6 z-30 hidden sm:flex"><Icon path={mdiKeyboardBackspace} size={1.2} aria-hidden="true" /></IconButton>
      )}
      {vehicleStage
        ? <VehicleSelect />
        : <OnBoarding
            bookingStage
            timingStep={timingStage}
            highlightRideNow={location.state?.highlightRideNow === true}
            onMapPickerChange={setMapPickerActive}
          />}
    </div>
  );
};

export default BookingFlow;

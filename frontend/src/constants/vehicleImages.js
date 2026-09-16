import hatchback from "../assets/vehicles-v2/hatchback-panel.webp";
import sedan from "../assets/vehicles-v2/sedan-panel.webp";
import suv from "../assets/vehicles-v2/suv-panel.webp";
import premiumSuv from "../assets/vehicles-v2/suv-premium-panel.webp";

const ANGLED_VEHICLE_IMAGES = {
    hatchback,
    sedan,
    suv,
    suv_premium: premiumSuv,
};

export const angledVehicleImageOf = (vehicleClass) =>
    ANGLED_VEHICLE_IMAGES[vehicleClass] ?? hatchback;

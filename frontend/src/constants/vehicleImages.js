import hatchback from "../assets/angled-view-hatchback.webp";
import sedan from "../assets/angled-view-sedan.webp";
import suv from "../assets/angled-view-SUV.webp";
import premiumSuv from "../assets/angled-view-Premium-SUV.webp";

const ANGLED_VEHICLE_IMAGES = {
    hatchback,
    sedan,
    suv,
    suv_premium: premiumSuv,
};

export const angledVehicleImageOf = (vehicleClass) =>
    ANGLED_VEHICLE_IMAGES[vehicleClass] ?? hatchback;

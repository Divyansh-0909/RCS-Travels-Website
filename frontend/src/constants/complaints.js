import { websiteCopy as dc } from "../i18nCopy";
export const COMPLAINT_OPTIONS = [
    { value: "driver_asked_extra_money", get "label"() { return dc("Driver asked for extra money"); } },
    { value: "driver_asked_to_cancel", get "label"() { return dc("Driver asked me to cancel"); } },
    { value: "dangerous_driving", get "label"() { return dc("Dangerous driving"); } },
    { value: "wrong_vehicle", get "label"() { return dc("Driver arrived with the wrong car"); } },
    { value: "vehicle_or_driver_mismatch", get "label"() { return dc("Driver did not match the profile"); } },
    { value: "rude_or_inappropriate_behaviour", get "label"() { return dc("Rude or inappropriate behaviour"); } },
    { value: "drop_off_problem", get "label"() { return dc("Drop-off problem"); } },
]

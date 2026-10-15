export const CUSTOMER_CANCELLATION_REASONS = Object.freeze([
  { value: "driver_asked_to_cancel", label: "Driver asked me to cancel" },
  { value: "driver_taking_too_long", label: "Driver is taking too long to arrive (10+ min)" },
  { value: "driver_not_moving_to_pickup", label: "Driver is not moving toward pickup" },
  { value: "driver_wrong_pickup", label: "Driver went to the wrong pickup location" },
  { value: "driver_demands_extra_money", label: "Driver demands extra money" },
  { value: "wrong_vehicle", label: "Wrong vehicle arrived" },
  { value: "driver_threatening_abusive_harassing", label: "Driver is threatening, abusive, or harassing" },
  { value: "requested_carrier_unavailable", label: "Requested / confirmed luggage carrier is unavailable" },
]);

export const OTHER_CANCELLATION_REASON = "__other__";
export const cancellationReasonForApi = (choice) => choice && choice !== OTHER_CANCELLATION_REASON ? choice : null;
export const cancellationChargeForChoice = (quotedCharge, choice) => choice && choice !== OTHER_CANCELLATION_REASON ? 0 : (Number(quotedCharge) || 0);

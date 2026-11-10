export const PLACE_NAME_LIMIT = 40;
export const PLACE_ADDRESS_LIMIT = 200;
export const validPlaceCoordinates = value => Boolean(value && Number.isFinite(value.lat) && Number.isFinite(value.lng) && Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180);
export function savedPlaceValidity({ name, address, original, coordinates, resolving = false }) {
  const label = String(name ?? '').trim(), location = String(address ?? '').trim();
  const nameValid = label.length >= 1 && label.length <= PLACE_NAME_LIMIT && String(name ?? '').length <= PLACE_NAME_LIMIT;
  const addressValid = location.length >= 1 && location.length <= PLACE_ADDRESS_LIMIT;
  // Preserve accepted legacy addresses when only the label changes. New or
  // edited locations must be resolved, rather than trusting arbitrary text.
  const unchanged = Boolean(original?.id && location === String(original.address ?? '').trim());
  const locationValid = unchanged || validPlaceCoordinates(coordinates);
  return { nameValid, addressValid, locationValid, valid: nameValid && addressValid && locationValid && !resolving };
}

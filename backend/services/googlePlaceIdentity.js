// Google documents ID refresh for inferred addresses/intersections. Never turn a changed ID into a confirmed location.
export function placeIdentityRefresh(requestedPlaceId, data) {
  if (typeof data.id !== 'string' || data.id.length === 0 || data.id === requestedPlaceId) return null
  if (data.name !== `places/${data.id}` || typeof data.formattedAddress !== 'string' || data.formattedAddress.trim().length === 0) return null
  if (data.movedPlaceId || data.movedPlace) return null
  return { error: 'PLACE_ID_REFRESH_SELECTION_REQUIRED', requestedPlaceId,
    replacement: { placeId: data.id, displayText: data.formattedAddress }, source: 'GOOGLE_DETAILS_ID_REFRESH' }
}

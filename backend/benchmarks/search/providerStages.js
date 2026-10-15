// Development orchestration only. These observations never authorize a form or booking.
export function groundingRoles(parsed, activeField) {
  if (parsed.fallbackRequired || !parsed.draft) return []
  const draft = parsed.draft
  if (draft.queryType === 'UNCLEAR_OR_UNRELATED') return []
  const fields = draft.queryType === 'LOCATION_SEARCH'
    ? activeField === null ? [] : [[activeField, draft.locationSearch]]
    : [['pickup', draft.pickup], ['drop', draft.drop]]
  return fields.filter(([, field]) => field.state === 'RESOLVED' && field.value.kind === 'QUERY_CANDIDATE')
    .map(([role]) => role)
}

export function providerStageStatus(state) {
  for (const name of ['validationFailed', 'otherProviderPending', 'lunaRequired', 'placesRequired', 'placesAvailable', 'groundingComplete']) {
    if (typeof state[name] !== 'boolean') throw new TypeError('PROVIDER_STAGE_STATE_INVALID')
  }
  if (state.validationFailed) return 'VALIDATION_FAILURE'
  if (state.otherProviderPending) return 'OTHER_PROVIDER_PENDING'
  if (state.lunaRequired) {
    return state.placesRequired && !state.placesAvailable ? 'LUNA_AND_PLACES_PENDING' : 'LUNA_PENDING'
  }
  if (state.placesRequired && !state.groundingComplete) return 'PLACES_PENDING'
  return 'COMPLETE'
}

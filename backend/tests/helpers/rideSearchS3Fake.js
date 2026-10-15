import { decisionFake, expressionChoices } from './rideSearchFake.js';
/** @param {string} text
 * @param {{type?: string, complexity?: string, pickup?: string, drop?: string, choices?: Record<string, string>}} options */
export function searchFake(text, { type = 'BOOKING_REQUEST', complexity = 'SIMPLE', pickup, drop, choices = {} } = {}) {
  return decisionFake([
    { query_type: type, booking_complexity: type === 'BOOKING_REQUEST' ? complexity : 'NOT_APPLICABLE' },
    request => {
      const { candidates } = JSON.parse(request.state);
      const id = phrase => candidates.find(value => value.exactText === phrase)?.candidateId ?? 'NONE_OR_UNCLEAR';
      if (type === 'LOCATION_SEARCH') return { location_search_candidate: id(text.trim()) };
      return { ...expressionChoices(request), pickup_candidate: id(pickup), drop_candidate: id(drop),
        pickup_presence: pickup ? 'PRESENT' : 'ABSENT', drop_presence: drop ? 'PRESENT' : 'ABSENT',
        role_consistency: pickup || drop ? 'CONSISTENT' : 'NO_ROLES', ...choices };
    },
  ]);
}
/** @returns {import('../../services/search/locations/places.ts').PlaceSearchProvider & {calls: Array<[string, object]>}} */
export const placesFake = () => ({
  calls: [],
  async searchAutocomplete(request) {
    this.calls.push(['search', request]);
    return [{ placeId: request.input.replaceAll(' ', '_'), displayText: request.input }];
  },
  async getPlaceDetails(request) {
    this.calls.push(['details', request]);
    return { placeId: request.placeId, lat: 28.45, lng: request.placeId.includes('campus') ? 77.4 : 77.5,
      source: 'GOOGLE_PLACES', displayText: request.placeId.replaceAll('_', ' '),
      confirmedAt: '2026-10-02T10:00:00.000Z', confirmedByUser: 'selection' };
  },
  getMetadata() { return { provider: 'google_places', requestCount: this.calls.length,
    autocompleteRequests: this.calls.filter(call => call[0] === 'search').length,
    detailsRequests: this.calls.filter(call => call[0] === 'details').length }; },
});

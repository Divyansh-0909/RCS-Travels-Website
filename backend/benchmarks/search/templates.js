// Proposed labels authored from frozen specifications. Provider responses are never ground truth.
export const places = ['Pari Chowk', 'Jaypee main gate', 'Delta 2', 'Botanical Garden', 'Sector 18 Market', 'North Library',
  'Lakeview Hostel', 'Sunrise Metro', 'Pine Avenue', 'Delta 1', 'Garden Gate 3', 'West Campus', 'Old Bus Stand', 'Lotus Circle',
  'Museum Road', 'Central Station', 'Amber Tower', 'Hilltop Clinic', 'Civic Centre', 'college', 'airport',
  'hostel gate near the tea stall', 'Jaypee main gate near Gate 3', 'IGI', 'campus', 'Delhi', 'Greater Noida', 'Noida Sector 62', 'Knowledge Park II', 'City Centre']
const t = (id, text, fields = {}, review = []) => ({ id, text, fields, review })
const rel = anchor => ({ kind: 'RELATIVE', anchor })
const scheduled = (date, time) => ({ timingMode: 'SCHEDULED', date, time })
const route = { pickup: '{p}', drop: '{d}' }
const tomorrow = scheduled(rel('TOMORROW'), '{clock}')
const vehicle = '{car}'
export const coreGroups = [
  { id: 'standalone', count: 30, templates: [t('bare-place', '{p}', { queryType: 'LOCATION_SEARCH' }), t('standalone-pickup', '{p}', { queryType: 'LOCATION_SEARCH', activeField: 'pickup' }), t('standalone-drop', '{p}', { queryType: 'LOCATION_SEARCH', activeField: 'drop' })] },
  { id: 'complete-simple', count: 30, templates: [t('complete-from-to', 'Book a {car} from {p} to {d} tomorrow at {hour} PM', { ...route, vehicle, ...tomorrow }), t('complete-labelled', 'pickup: {p}; destination: {d}; {car} tomorrow {hour} PM', { ...route, vehicle, ...tomorrow }), t('complete-pick-drop', 'Pick me from {p} and drop me at {d}, {car} tomorrow at {hour} PM', { ...route, vehicle, ...tomorrow })] },
  { id: 'partial', count: 30, templates: [t('partial-vehicle-date', '{car} tomorrow', { vehicle, ...scheduled(rel('TOMORROW'), null) }), t('partial-route', '{p} to {d}', route), t('partial-passengers', '{people} people tomorrow {hour} PM', { passengers: '{people}', unsupported: ['PASSENGER_COUNT'], ...tomorrow }, ['UNSUPPORTED_PASSENGER_ENFORCEMENT']), t('partial-vehicle', '{car}', { vehicle })] },
  { id: 'immediate', count: 15, templates: [t('now-route', 'cab now from {p} to {d}', { ...route, timingMode: 'IMMEDIATE' }), t('now-vehicle', '{car} now', { vehicle, timingMode: 'IMMEDIATE' }), t('now-sharing', 'shared cab now from {p} to {d}', { ...route, timingMode: 'IMMEDIATE', sharing: true })] },
  { id: 'scheduled', count: 20, templates: [t('absolute-complete', '{car} from {p} to {d} on 5 October 2026 at {hour} PM', { ...route, vehicle, ...scheduled({ kind: 'ABSOLUTE', day: 5, month: 10, year: 2026 }, '{clock}') }), t('relative-day-after', '{car} from {p} to {d} day after tomorrow at {hour} PM', { ...route, vehicle, ...scheduled(rel('DAY_AFTER_TOMORROW'), '{clock}') }), t('today-h24', 'cab from {p} to {d} today at 18:00', { ...route, ...scheduled(rel('TODAY'), { kind: 'CLOCK', hour: 18, minute: 0, notation: 'H24', period: null, precision: 'EXACT' }) })] },
  { id: 'date-only', count: 20, templates: [t('date-tomorrow', 'tomorrow from {p}', { pickup: '{p}', ...scheduled(rel('TOMORROW'), null) }), t('date-day-after', 'cab day after tomorrow to {d}', { drop: '{d}', ...scheduled(rel('DAY_AFTER_TOMORROW'), null) }), t('date-absolute', '{car} on 5 October 2026', { vehicle, ...scheduled({ kind: 'ABSOLUTE', day: 5, month: 10, year: 2026 }, null) })] },
  { id: 'time-only', count: 15, templates: [t('time-clock', 'cab at {hour} PM from {p}', { pickup: '{p}', ...scheduled(null, '{clock}') }), t('time-daypart', 'cab in the evening from {p}', { pickup: '{p}', ambiguity: ['EXACT_TIME_REQUIRED'], ...scheduled(null, { kind: 'DAYPART', value: 'EVENING' }) }, ['DAYPART_CLARIFICATION']), t('time-approximate', 'cab around {hour} from {p}', { pickup: '{p}', ambiguity: ['TIME_PERIOD_REQUIRED'], ...scheduled(null, { kind: 'CLOCK', hour: '{hour}', minute: 0, notation: 'H12', period: null, precision: 'APPROXIMATE' }) }, ['AM_PM_CLARIFICATION'])] },
  { id: 'vehicle-preferences', count: 30, templates: [t('vehicle-any', 'any car from {p} to {d}', { ...route, vehicle: { state: 'EXPLICIT_ANY', excluded: [] } }), t('vehicle-excluded-sedan', 'anything except sedan from {p} to {d}', { ...route, vehicle: { state: 'EXCLUDED', excluded: ['sedan'] } }), t('vehicle-required', '{car} only from {p} to {d}', { ...route, vehicle }), t('vehicle-preferred', 'prefer {car} from {p} to {d}', { ...route, vehicle: { state: 'RESOLVED', value: '{car}', strength: 'PREFERRED', excluded: [] } }), t('vehicle-negated-suv', "don't send an SUV from {p} to {d}", { ...route, vehicle: { state: 'EXCLUDED', excluded: ['suv'] }, policy: ['SUV_FAMILY_EXCLUSION_SCOPE'] }, ['PRODUCT_POLICY_UNRESOLVED'])] },
  { id: 'role-order', count: 35, templates: [t('role-hinglish-order', '{d} jaana hai {p} se', route, ['NONTRIVIAL_DIRECTION', 'DETERMINISTIC_MARKER_ONLY']), t('role-at-drop', 'pick me at {p}, drop at {d}', route, ['NONTRIVIAL_DIRECTION']), t('role-drop-before-from', 'drop me at {d} from {p}', route, ['NONTRIVIAL_DIRECTION']), t('role-repeated-place', 'from {p} to {d}; pickup is {p}', route, ['REPEATED_PLACE']), t('role-reversed-clause', 'destination: {d}; pickup: {p}', route, ['NONTRIVIAL_DIRECTION'])] },
  { id: 'multi-stop', count: 15, templates: [t('stop-via', 'from {p} to {d} via {s}', { ...route, stops: ['{s}'], complexity: 'COMPLEX', unsupported: ['STOP'] }, ['UNSUPPORTED_STOP']), t('stop-friend', 'pick me from {p}, pick my friend at {s}, then go to {d}', { ...route, stops: ['{s}'], complexity: 'COMPLEX', unsupported: ['STOP'] }, ['UNSUPPORTED_STOP'])] },
  { id: 'assisted-services', count: 20, templates: [t('return-complicated', 'go from {p} to {d} tomorrow and bring me back in the evening', { ...route, complexity: 'COMPLEX', unsupported: ['RETURN_JOURNEY'], ...scheduled(rel('TOMORROW'), null) }, ['UNSUPPORTED_RETURN']), t('rental-duration', 'rent a {car} for 8 hours from {p}', { pickup: '{p}', vehicle, unsupported: ['RENTAL'] }, ['UNSUPPORTED_RENTAL']), t('outstation-flags', 'outstation {car} from {p} to {d}, safe route, carrier needed, no sharing', { ...route, vehicle, isOutstation: true, preferSafeRoute: true, needsCarrier: true, sharing: false })] },
  { id: 'conditional', count: 15, templates: [t('conditional-alternative', 'from {p} to {d}, but if my flight changes take me to {s}', { ...route, complexity: 'COMPLEX', unsupported: ['CONDITIONAL_PREFERENCE'] }, ['CONDITIONAL_DESTINATION']), t('conditional-ac', 'AC car if available from {p} to {d}', { ...route, complexity: 'COMPLEX', unsupported: ['AC_PREFERENCE', 'CONDITIONAL_PREFERENCE'] }, ['UNSUPPORTED_CONDITIONAL_AC'])] },
  { id: 'ambiguity-conflict', count: 25, templates: [t('conflicting-times', 'from {p} to {d} tomorrow at 6 PM and at 8 PM', { ...route, complexity: 'COMPLEX', ...scheduled(rel('TOMORROW'), null), ambiguity: ['CONFLICTING_TIME'], unresolved: ['time'] }, ['TEMPORAL_AMBIGUITY']), t('weekday-next', 'from {p} to {d} next Friday at {hour} PM', { ...route, ...scheduled({ kind: 'WEEKDAY', weekday: 'FRIDAY', qualifier: 'NEXT' }, '{clock}'), policy: ['WEEKDAY_SEMANTICS'], unresolved: ['resolvedDate'] }, ['PRODUCT_POLICY_UNRESOLVED']), t('omitted-year', 'from {p} to {d} on 5 December at {hour} PM', { ...route, ...scheduled({ kind: 'ABSOLUTE', day: 5, month: 12, year: null }, '{clock}'), policy: ['OMITTED_YEAR_SEMANTICS'], unresolved: ['resolvedDate'] }, ['PRODUCT_POLICY_UNRESOLVED']), t('non-ist', 'from {p} to {d} tomorrow at {hour} PM London time', { ...route, ...tomorrow, policy: ['NON_IST_TIMEZONE'], unresolved: ['resolvedDate', 'resolvedTime'] }, ['PRODUCT_POLICY_UNRESOLVED']), t('vehicle-self-conflict', 'SUV only but no SUV from {p} to {d}', { ...route, vehicle: { state: 'AMBIGUOUS', alternatives: ['suv'] }, complexity: 'COMPLEX', ambiguity: ['VEHICLE_CONFLICT'] }, ['CONFLICTING_PREFERENCE'])] },
  { id: 'unclear-noisy-candidates', count: 20, templates: [t('unrelated-weather', 'what is the weather near {p}?', { queryType: 'UNCLEAR_OR_UNRELATED' }), t('noisy-route', 'cab plz frm {p} 2 {d}', { ...route, unresolved: ['fallbackExpected'] }, ['CANDIDATE_GENERATION_DIFFICULT', 'JUDGMENT_REQUIRED']), t('overlap-location', 'from hostel gate near the tea stall to {d}', { pickup: 'hostel gate near the tea stall', drop: '{d}' }, ['CANDIDATE_OVERLAP']), t('changed-mind', 'from {p} to {d}, actually use {s} as destination', { pickup: '{p}', drop: '{s}', complexity: 'COMPLEX' }, ['CORRECTION_JUDGMENT'])] },
]

export const exploratoryQueries = [
  'campus se delta 2 kal 6 baje', 'pari chowk jaana hai campus se', 'metro se hostel kal', 'airport jaana hai subah',
  'sector 18 se market abhi', 'kal 7 baje cab chahiye', 'suv chahiye par sedan nahi', 'station se lakeview hostel',
  'campus se museum road via market', 'return cab delta 2 se', 'rent ke liye gaadi chahiye', 'ac cab mile to',
  'hostel se gate 3 abhi', 'kal ya parso morning cab', 'north library se central station', 'airport se campus 8 pm',
  'sector 6 se sector 6 nahi', 'cab book karni hai', 'abhi nahi kal ride', 'mall se clinic jaana hai',
  'परी चौक', 'कल शाम छह बजे कॉलेज से एयरपोर्ट', 'अभी कैब चाहिए', 'सेडान मत भेजना', 'डेल्टा 1 से डेल्टा 2',
  'सुबह जाना है', 'तीन लोग हैं', 'अगले शुक्रवार कैब', 'एसी गाड़ी चाहिए', 'रास्ते में दोस्त को लेना है',
  'any gaadi chalegi', 'SUV only kal campus se', 'airport drop chahiye hostel se', '5 December ko Delhi jaana hai',
  'next Friday ya Saturday', 'shaam ko return bhi', 'campus se pari chowk nahi delta 2', 'safe rasta lena please',
  'carrier chahiye luggage hai', 'shared cab nahi chahiye',
]

export function instantiate(template, index, variantIndex = index) {
  const variables = { p: places[index % places.length], d: places[(index + 7) % places.length], s: places[(index + 13) % places.length],
    car: ['hatchback', 'sedan', 'suv', 'suv_premium'][variantIndex % 4], hour: 5 + index % 7, people: 2 + index % 4 }
  const replace = value => {
    if (value === '{clock}') return { kind: 'CLOCK', hour: variables.hour, minute: 0, notation: 'H12', period: 'PM', precision: 'EXACT' }
    if (Array.isArray(value)) return value.map(replace)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, replace(nested)]))
    if (value === '{hour}' || value === '{people}') return variables[value.slice(1, -1)]
    if (typeof value === 'string') return value.replace(/\{(p|d|s|car|hour|people)\}/g, (_match, key) => variables[key])
    return value
  }
  const fields = replace(template.fields)
  if (typeof fields.vehicle === 'string') fields.vehicle = { state: 'RESOLVED', value: fields.vehicle, strength: 'REQUIRED', excluded: [] }
  return { text: replace(template.text), fields }
}

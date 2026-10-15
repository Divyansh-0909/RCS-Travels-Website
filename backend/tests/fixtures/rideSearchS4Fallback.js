// Labels stay outside model input. This is deterministic harness taxonomy,
// not a live model-quality dataset or S5 calibration result.
export const fallbackCohort = [
  { text: 'SUV tomorrow', route: 'FOLLOW_UP_ONLY', luna: false, missing: ['pickup', 'drop', 'timing.time'] },
  { text: 'Pari Chowk', route: 'FOLLOW_UP_ONLY', luna: false, targetRequired: true },
  { text: 'cab now', route: 'FOLLOW_UP_ONLY', luna: false, timing: 'IMMEDIATE' },
  { text: 'college to airport', route: 'FOLLOW_UP_ONLY', luna: false, pickup: 'college', drop: 'airport' },
  { text: 'SUV now from campus to airport', route: 'JEV_SIMPLE', luna: false, pickup: 'campus', drop: 'airport' },
  { text: 'campus to airport via Pari Chowk', route: 'LUNA_COMPLEX', luna: true, unsupported: ['STOP'] },
  { text: 'come back in the evening', route: 'LUNA_COMPLEX', luna: true, unsupported: ['RETURN_JOURNEY'] },
  { text: 'rent a car for 8 hours', route: 'LUNA_COMPLEX', luna: true, unsupported: ['RENTAL'] },
  { text: 'AC car if available', route: 'LUNA_COMPLEX', luna: true, unsupported: ['AC_PREFERENCE', 'CONDITIONAL_PREFERENCE'] },
  { text: 'get my friend from Delta 1 then go to IGI', route: 'LUNA_COMPLEX', luna: true, unsupported: ['STOP'] },
  { text: 'hello', route: 'UNCLEAR', luna: false },
];

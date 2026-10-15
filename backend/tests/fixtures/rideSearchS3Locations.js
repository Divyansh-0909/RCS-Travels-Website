// Evaluation labels stay outside the original query/provider input. These are
// deterministic contract cohorts, not claims about live Jev or Google accuracy.
export const reversalCohort = [
  { id: 'to', input: { text: 'campus to Pari Chowk' }, labels: { pickup: { exactText: 'campus', start: 0, end: 6 }, drop: { exactText: 'Pari Chowk', start: 10, end: 20 } } },
  { id: 'from-to', input: { text: 'from campus to Pari Chowk' }, labels: { pickup: { exactText: 'campus', start: 5, end: 11 }, drop: { exactText: 'Pari Chowk', start: 15, end: 25 } } },
  { id: 'inverted-se', input: { text: 'Pari Chowk jaana hai campus se' }, labels: { pickup: { exactText: 'campus', start: 21, end: 27 }, drop: { exactText: 'Pari Chowk', start: 0, end: 10 } } },
  { id: 'pick-drop', input: { text: 'pick me at campus, drop at Pari Chowk' }, labels: { pickup: { exactText: 'campus', start: 11, end: 17 }, drop: { exactText: 'Pari Chowk', start: 27, end: 37 } } },
  { id: 'inverted-from', input: { text: 'drop me at Pari Chowk from campus' }, labels: { pickup: { exactText: 'campus', start: 27, end: 33 }, drop: { exactText: 'Pari Chowk', start: 11, end: 21 } } },
  { id: 'pick-from-drop', input: { text: 'pick me from campus and drop me at Pari Chowk' }, labels: { pickup: { exactText: 'campus', start: 13, end: 19 }, drop: { exactText: 'Pari Chowk', start: 35, end: 45 } } },
];

export const standaloneCohort = [
  { id: 'pickup', input: { text: 'Pari Chowk', activeField: 'pickup' }, labels: { span: { exactText: 'Pari Chowk', start: 0, end: 10 }, groundingTarget: 'pickup', selectionRequired: true } },
  { id: 'drop', input: { text: 'Pari Chowk', activeField: 'drop' }, labels: { span: { exactText: 'Pari Chowk', start: 0, end: 10 }, groundingTarget: 'drop', selectionRequired: true } },
  { id: 'target-required', input: { text: 'Pari Chowk', activeField: null }, labels: { span: { exactText: 'Pari Chowk', start: 0, end: 10 }, groundingTarget: null, issue: 'LOCATION_TARGET_REQUIRED' } },
];

export const groundingOutcomeLabels = {
  NO_MATCH: { preservesOriginalCandidate: true, inventsCoordinates: false, selectionRequired: false },
  ONE_MATCH: { preservesOriginalCandidate: true, inventsCoordinates: false, selectionRequired: true },
  MULTIPLE_MATCHES: { preservesOriginalCandidate: true, inventsCoordinates: false, selectionRequired: true },
};

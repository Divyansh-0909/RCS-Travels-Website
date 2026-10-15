import { createHash } from 'node:crypto';
import { SEARCH_LIMITS, type LocationCandidate, type Query } from '../contracts.ts';
import { issue, queryRef, type ParseIssue } from '../fields.ts';
import { timeZoneTokens } from '../timezonePolicy.ts';
import { explicitTemporalSuffixBoundary } from './temporalSuffix.ts';
import { locationPrefixEnd } from './requestPrefix.ts';
import { hindiTemporalSuffixStart } from '../hindiTemporal.ts';

const GENERATOR_VERSION = 'ride-search-location-candidates-v4';
const MAX_CANDIDATE_TEXT = SEARCH_LIMITS.aggregateCandidateText;
const MAX_SINGLE_CANDIDATE_TEXT = 500;
const directionalMethod = 'DIRECTIONAL_CLAUSE' as const;

export type LocationCandidateResult = {
  candidates: LocationCandidate[];
  issues: ParseIssue[];
};

type CandidateMethod = LocationCandidate['method'];
type CandidateSpec = { start: number; end: number; method: CandidateMethod };

const mention = /\bfrom\b|\bvia\b|\bpick(?:\s+me)?\s+(?:at|from)\b|\bdrop(?:\s+me)?\s+at\b|\bgo\s+to\b|\bjaana\s+hai\b|\bse\b/i;
const meaninglessLocation = /^(?:from|to|via|pickup|pick|drop|go|cab|ride|taxi|car)$/i;
// In a bare "X to Y" clause, an explicit vehicle/passenger request is not X.
// Labelled/from clauses still preserve landmarks containing vehicle words.
const bookingPrefix = /^(?:(?:prefer|please)\s+)?(?:(?:hatchback|sedan|suv(?:_premium|\s+premium)?)(?:\s+(?:only|preferred))?|any\s+(?:car|vehicle)|anything\s+except\s+(?:hatchback|sedan|suv(?:_premium|\s+premium)?)|\d+\s+(?:people|passengers))$/i;

function isValidQuery(query: Query): boolean {
  return typeof query.id === 'string' && query.id.length > 0
    && Number.isInteger(query.revision) && query.revision >= 0
    && typeof query.text === 'string';
}

function trimRange(text: string, start: number, end: number): CandidateSpec | undefined {
  let left = start;
  let right = end;
  while (left < right && /[\s,;:]/.test(text[left])) left += 1;
  while (right > left && /[\s,;:.!?]/.test(text[right - 1])) right -= 1;
  if (right <= left) return undefined;
  return { start: left, end: right, method: directionalMethod };
}

function withoutSuffix(text: string, start: number, end: number): number {
  const exclusion = text.slice(start, end).search(/,\s*(?:no|not|except|without|don't|do\s+not)\s+(?:an?\s+)?(?:hatchback|sedan|(?:regular|premium)\s+suv|suv(?:_premium)?|XL)\b/i);
  const phraseEnd = exclusion < 0 ? end : start + exclusion;
  const value = text.slice(start, phraseEnd);
  const zone = timeZoneTokens(value).at(-1);
  const marked = zone !== undefined && value.slice(zone.end).trim() === '' ? value.slice(0, zone.start).trimEnd() : value;
  const matched = /(?:\s*(?:,|;|-|—)\s*(?:today|tomorrow|tonight|now|asap|hatchback|sedan|suv(?:\s+premium)?(?:\s+only)?|please|call\s+me|with\s+(?:a\s+)?(?:baby|child))|\s+(?:today|tomorrow|tonight)(?:\s+(?:(?:(?:at|around|about)\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?|(?:in\s+the\s+)?(?:morning|afternoon|evening|night)))?|\s+(?:(?:at|around|about)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}(?::\d{2})?\s+(?:am|pm)))\s*$/i.exec(marked);
  const explicit = explicitTemporalSuffixBoundary(marked);
  const hindi = hindiTemporalSuffixStart(text, start, phraseEnd);
  return Math.min(start + Math.min(matched?.index ?? phraseEnd - start, explicit ?? phraseEnd - start), hindi ?? phraseEnd);
}

function addRange(specs: CandidateSpec[], text: string, start: number, end: number, method: CandidateMethod): void {
  start = Math.max(start, locationPrefixEnd(text, true));
  const usefulEnd = withoutSuffix(text, start, end);
  const trimmed = trimRange(text, start, usefulEnd);
  if (!trimmed || meaninglessLocation.test(text.slice(trimmed.start, trimmed.end))) return;
  specs.push({ ...trimmed, method });
  addNearAlternative(specs, text, trimmed);
}

function addNearAlternative(specs: CandidateSpec[], text: string, range: CandidateSpec): void {
  const nearIndex = text.slice(range.start, range.end).search(/\s+near\s+/i);
  const shorter = nearIndex > 0 ? trimRange(text, range.start, range.start + nearIndex) : undefined;
  if (shorter && !meaninglessLocation.test(text.slice(shorter.start, shorter.end))) specs.push({ ...shorter, method: 'OVERLAPPING_ALTERNATIVE' });
}

function addDelimited(specs: CandidateSpec[], text: string, expression: RegExp, method: CandidateMethod): void {
  for (const matched of text.matchAll(expression)) {
    const phrase = matched[1]!;
    const start = matched.index + matched[0].lastIndexOf(phrase);
    addRange(specs, text, start, start + phrase.length, method);
  }
}

function addDirectionalCandidates(specs: CandidateSpec[], text: string): void {
  addDelimited(specs, text, /\bfrom\s+(.+?)(?=\s+\bto\b|\s+\band\s+\b(?:go|drop)\b|$)/gi, directionalMethod);
  addDelimited(specs, text, /^\s*(?!(?:pickup|pick\s*up)\s*(?:location)?\s*[:=-])(.+?)\s+\bvia\s+/gi, directionalMethod);
  addToCandidates(specs, text);
  addDelimited(specs, text, /\bpick(?:\s+me)?\s+(?:at|from)\s+(.+?)(?=$|\s+(?:and\s+)?\b(?:drop|go|to|via)\b)/gi, directionalMethod);
  addDelimited(specs, text, /\bdrop(?:\s+me)?\s+at\s+(.+?)(?=$|\s+(?:and\s+)?\b(?:from|via)\b)/gi, directionalMethod);
  addDelimited(specs, text, /\bgo\s+to\s+(.+?)(?=$|\s+\b(?:from|via|pickup|pick|drop)\b)/gi, directionalMethod);
  addDelimited(specs, text, /\bvia\s+(.+?)(?=$|\s+\b(?:to|from|pickup|pick|drop|go)\b)/gi, directionalMethod);
  addHinglishCandidates(specs, text);
  addForwardHinglishCandidates(specs, text);
  addSimpleToCandidates(specs, text);
}

function addToCandidates(specs: CandidateSpec[], text: string): void {
  for (const matched of text.matchAll(/\bto\s+(.+?)(?=$|\s+\b(?:from|via|pickup|pick|drop)\b)/gi)) {
    const phrase = matched[1]!;
    if (/^(?:book|reserve|hire|rent)\b/i.test(phrase.trim())) continue;
    const start = matched.index + matched[0].lastIndexOf(phrase);
    addRange(specs, text, start, start + phrase.length, directionalMethod);
  }
}

function addHinglishCandidates(specs: CandidateSpec[], text: string): void {
  for (const matched of text.matchAll(/(?:^|\s)(.+?)\s+jaana\s+hai\s+(.+?)\s+se\b/gi)) {
    const destination = matched[1]!;
    const origin = matched[2]!;
    const destinationStart = matched.index + matched[0].indexOf(destination);
    const originStart = matched.index + matched[0].lastIndexOf(origin);
    addRange(specs, text, destinationStart, destinationStart + destination.length, directionalMethod);
    addRange(specs, text, originStart, originStart + origin.length, directionalMethod);
  }
}

function addForwardHinglishCandidates(specs: CandidateSpec[], text: string): void {
  const matched = /^\s*(.+?)\s+se\s+(.+?)\s*$/i.exec(text);
  if (!matched) return;
  const origin = matched[1]!;
  const destination = matched[2]!;
  const originStart = matched[0].indexOf(origin);
  const destinationStart = matched[0].lastIndexOf(destination);
  addRange(specs, text, originStart, originStart + origin.length, directionalMethod);
  addRange(specs, text, destinationStart, destinationStart + destination.length, directionalMethod);
}

function addSimpleToCandidates(specs: CandidateSpec[], text: string): void {
  const matched = /^\s*(.+?)\s+to\s+(.+?)\s*$/i.exec(text);
  if (!matched?.[1] || !matched[2] || meaninglessLocation.test(matched[1].trim()) || /\b(?:from|via|pickup|pick|drop)\b/i.test(matched[1]) || /^(?:book|reserve|hire|rent)\b/i.test(matched[2].trim())) return;
  const originStart = matched[0].indexOf(matched[1]);
  const originEnd = originStart + matched[1].length;
  const start = Math.max(originStart, locationPrefixEnd(text, true));
  const left = text.slice(start, withoutSuffix(text, start, originEnd)).trim();
  if (bookingPrefix.test(left)) return;
  addRange(specs, text, start, originEnd, directionalMethod);
  const rightStart = matched[0].lastIndexOf(matched[2]);
  addRange(specs, text, rightStart, rightStart + matched[2].length, directionalMethod);
}

function addLabelledCandidates(specs: CandidateSpec[], text: string): void {
  addDelimited(specs, text, /\b(?:pickup|pick\s*up)\s*(?:location)?\s*[:=-]\s*(.+?)(?=;|$|\s+\b(?:drop|destination|from|to|via)\b)/gi, 'LABELLED_FIELD');
  addDelimited(specs, text, /\b(?:drop(?:[\s-]*off)?|destination)\s*(?:location)?\s*[:=-]\s*(.+?)(?=;|$|\s+\b(?:pickup|from|to|via)\b)/gi, 'LABELLED_FIELD');
}

function mergeSpecs(specs: CandidateSpec[]): CandidateSpec[] {
  const merged = new Map<string, CandidateSpec>();
  for (const spec of specs) {
    const key = `${spec.start}:${spec.end}`;
    if (!merged.has(key)) merged.set(key, spec);
  }
  return [...merged.values()].sort((left, right) => left.start - right.start || left.end - right.end);
}

function candidateId(query: Query, spec: CandidateSpec): string {
  const source = JSON.stringify([query.id, query.revision, GENERATOR_VERSION, spec.start, spec.end, spec.method]);
  return `loc_${createHash('sha256').update(source).digest('hex').slice(0, 24)}`;
}

function makeCandidates(query: Query, specs: CandidateSpec[]): { candidates: LocationCandidate[]; exceeded: boolean } {
  const merged = mergeSpecs(specs);
  const totalText = merged.reduce((total, spec) => total + spec.end - spec.start, 0);
  if (merged.length > SEARCH_LIMITS.candidates || totalText > MAX_CANDIDATE_TEXT || merged.some((spec) => spec.end - spec.start > MAX_SINGLE_CANDIDATE_TEXT)) {
    return { candidates: [], exceeded: true };
  }
  return { candidates: merged.map((spec) => {
    const exactText = query.text.slice(spec.start, spec.end);
    return { candidateId: candidateId(query, spec), queryId: query.id, queryRevision: query.revision, exactText,
      normalizedText: exactText.trim().replace(/\s+/g, ' '), start: spec.start, end: spec.end, method: spec.method, generatorVersion: GENERATOR_VERSION };
  }), exceeded: false };
}

export function generateLocationCandidates(query: Query, queryType: 'LOCATION_SEARCH' | 'BOOKING_REQUEST' | 'UNCLEAR_OR_UNRELATED'): LocationCandidateResult {
  if (!isValidQuery(query)) return { candidates: [], issues: [issue('INVALID_QUERY', 'query', 'INVALID')] };
  if (query.text.length > SEARCH_LIMITS.queryLength) return { candidates: [], issues: [issue('LIMIT_EXCEEDED', 'query', 'INVALID')] };
  if (queryType === 'UNCLEAR_OR_UNRELATED') return { candidates: [], issues: [] };
  const specs: CandidateSpec[] = [];
  const whole = trimRange(query.text, locationPrefixEnd(query.text, false), query.text.length);
  if (queryType === 'LOCATION_SEARCH' && whole) specs.push({ ...whole, method: 'WHOLE_LOCATION_QUERY' });
  if (queryType === 'BOOKING_REQUEST') {
    addLabelledCandidates(specs, query.text);
    addDirectionalCandidates(specs, query.text);
  }
  const generated = makeCandidates(query, specs);
  if (generated.exceeded) return { candidates: [], issues: [issue('LIMIT_EXCEEDED', 'candidates', 'INVALID')] };
  const candidates = generated.candidates;
  const failedMention = queryType === 'BOOKING_REQUEST' && mention.test(query.text) && candidates.length === 0;
  return { candidates,
    issues: failedMention ? [issue('LOCATION_CANDIDATE_GENERATION_FAILED', 'candidates', 'DEPENDENCY', [queryRef(query, 0, query.text.length)])] : [] };
}

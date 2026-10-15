// This is an offset boundary in the original query, never rewritten model input.
import { hindiTemporalPrefixEnd } from '../hindiTemporal.ts';
// Explicit from/pickup clauses begin after it, so named landmarks keep their text.
export function locationPrefixEnd(text: string, bookingRequest: boolean): number {
  const courtesy = /^\s*(?:please|pls)(?:\s*:\s*|\s+)/i.exec(text);
  if (courtesy !== null) return courtesy[0].length + (bookingRequest ? hindiTemporalPrefixEnd(text.slice(courtesy[0].length)) : 0);
  if (!bookingRequest) return 0;
  const hindi = /^\s*(?:kripya|कृपया|mujhe|मुझे)(?:\s*:\s*|\s+)/iu.exec(text);
  if (hindi !== null) return hindi[0].length + hindiTemporalPrefixEnd(text.slice(hindi[0].length));
  const request = /^\s*(?:cab\s+please|i\s+need|can\s+you|could\s+you|book\s+me)(?:\s*:\s*|\s+)/i.exec(text);
  return request === null ? hindiTemporalPrefixEnd(text) : request[0].length;
}

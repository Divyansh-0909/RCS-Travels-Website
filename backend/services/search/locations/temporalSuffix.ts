import { observeDates, observeTimes } from '../observations.ts';
import { bookingTailStart } from './bookingTail.ts';

function landmarkNumber(text: string, start: number, token: string): boolean {
  return /^\d{1,2}$/.test(token) && /\b(?:gate|sector|block|terminal|platform)\s*$/i.test(text.slice(0, start));
}

// These lexer references belong only to this local text view. They never enter
// a draft: the generator converts the returned offset into the original span.
export function explicitTemporalSuffixBoundary(text: string): number | undefined {
  const bookingTail = bookingTailStart(text);
  if (bookingTail !== undefined) text = text.slice(0, bookingTail).trimEnd();
  const view = { id: 'candidate-temporal-view', revision: 0, text };
  const clocks = observeTimes(view, []).filter(observed => observed.value.kind === 'CLOCK'
    && !landmarkNumber(text, observed.ref.start, observed.text));
  if (clocks.length === 0) {
    if (bookingTail === undefined) return undefined;
    const trailingDate = observeDates(view, []).find(observed => text.slice(observed.ref.end).trim() === '');
    return trailingDate === undefined ? bookingTail : trailingDate.ref.start;
  }
  const first = clocks[0];
  const last = clocks[clocks.length - 1];
  if (text.slice(last.ref.end).trim() !== '') return undefined;
  const linked = clocks.length > 1 && clocks.slice(1).every((clock, index) =>
    /^\s+(?:and|or)\s*$/.test(text.slice(clocks[index].ref.end, clock.ref.start)));
  const date = observeDates(view, []).find(observed => observed.ref.end <= first.ref.start
    && text.slice(observed.ref.end, first.ref.start).trim() === '');
  const on = date === undefined ? null : /\bon\s*$/i.exec(text.slice(0, date.ref.start));
  if (on !== null) return on.index;
  if (!linked && bookingTail === undefined) return undefined;
  return date === undefined ? first.ref.start : date.ref.start;
}

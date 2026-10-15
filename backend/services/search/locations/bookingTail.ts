import { collectObservations, type Observations } from '../observations.ts';

function closedTail(text: string, start: number, markerLength: number, observed: Observations): boolean {
  const tail = text.slice(start).split('');
  tail.splice(0, markerLength, ...' '.repeat(markerLength));
  for (const field of [...observed.passengers, ...Object.values(observed.flags).flat()]) {
    if (field.ref.start < start) continue;
    tail.splice(field.ref.start - start, field.ref.end - field.ref.start,
      ...' '.repeat(field.ref.end - field.ref.start));
  }
  for (const carrier of observed.flags.needsCarrier) {
    if (carrier.ref.start < start) continue;
    const qualifier = /^\s+(?:needed|required)\b/i.exec(text.slice(carrier.ref.end));
    if (qualifier !== null) tail.splice(carrier.ref.end - start, qualifier[0].length, ...' '.repeat(qualifier[0].length));
  }
  return tail.join('').replace(/[\s,;.!?]/g, '') === '';
}

// Only closed passenger clauses or punctuation-introduced supported flags
// are clipped. Unknown trailing words retain their original geographic span.
export function bookingTailStart(text: string): number | undefined {
  const observed = collectObservations({ id: 'candidate-booking-tail-view', revision: 0, text }, []);
  const marker = /\bfor\s+\d+\s+(?:people|passengers)\b/i.exec(text);
  if (marker !== null && closedTail(text, marker.index, marker[0].length, observed)) return marker.index;
  const flags = Object.values(observed.flags).flat().sort((left, right) => left.ref.start - right.ref.start);
  for (const flag of flags) {
    const separator = /[,;]\s*$/.exec(text.slice(0, flag.ref.start));
    if (separator !== null && closedTail(text, separator.index, 0, observed)) return separator.index;
  }
  return undefined;
}

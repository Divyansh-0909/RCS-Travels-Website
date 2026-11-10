// Bounded original-source assertions. These helpers never rewrite provider text.
export function quotedRanges(text: string): Array<{ start: number; end: number }> {
  return [...text.matchAll(/"[^"\r\n]*"|“[^”\r\n]*”|(?<![\p{L}\p{M}\p{N}])'[^'\r\n]*'(?![\p{L}\p{M}\p{N}])/gu)]
    .map(match => ({ start: match.index, end: match.index + match[0].length }));
}

export function insideQuote(text: string, start: number, end = start + 1): boolean {
  return quotedRanges(text).some(range => start >= range.start && end <= range.end);
}

export function balancedRouteQuotes(text: string): boolean {
  return (text.match(/"/gu)?.length ?? 0) % 2 === 0
    && (text.match(/“/gu)?.length ?? 0) === (text.match(/”/gu)?.length ?? 0);
}

export function negativeRequirementAfter(text: string, end: number): boolean {
  const tail = text.slice(end);
  // A conditional alternative is not an unconditional negative assertion.
  if (/^\s+(?:(?:car|cab)\s+)?(?:nahi|nhi|नहीं)\s+(?:toh?|तो)(?=\s|[,;.!?]|$)/iu.test(tail)) return false;
  return /^\s+(?:(?:car|cab)\s+)?(?:(?:nahi|nhi|नहीं)(?=\s|[,;.!?]|$)|(?:mat|मत)\s+(?:dena|bhejna|दो|देना|भेजना)(?=\s|[,;.!?]|$))/iu.test(tail);
}

export function conditionalVehicleAfter(text: string, end: number): boolean {
  return conditionalVehicleEnd(text, end) !== undefined;
}

// End of the closed availability phrase, in original UTF-16 coordinates. This
// asserts a preference only; it never asserts that a vehicle is available.
export function conditionalVehicleEnd(text: string, end: number): number | undefined {
  if (insideQuote(text, end - 1)) return undefined;
  const match = /^\s+(?:mile\s+toh?\s+theek\s+hai|मिले\s+तो\s+ठीक\s+है)(?=\s|[,;.!?।]|$)/iu.exec(text.slice(end));
  return match ? end + match[0].length : undefined;
}

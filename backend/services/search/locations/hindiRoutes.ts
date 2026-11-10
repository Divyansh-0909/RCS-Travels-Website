import { collectObservations } from '../observations.ts';
import { insideQuote, balancedRouteQuotes } from '../negation.ts';
import { locationPrefixEnd } from './requestPrefix.ts';
import { timeZoneTokens } from '../timezonePolicy.ts';

export type HindiRouteSpan = { start: number; end: number; role: 'pickup' | 'drop' };
const journey = /\s+(?:(?:wapas|वापस)\s+)?(?:(?:jaana|jana|जाना|chalna|चलना)\s+(?:hai|है)|le\s+chalo|ले\s+चलो)(?=\s|[,;.!?]|$)/giu;
const requestTail = /\s+(?:(?:ki|की)\s+(?:cab|gaadi|गाड़ी|कैब)\s+(?:chahiye|चाहिए)|(?:ke\s+liye|के\s+लिए)\s+(?:cab|gaadi|कैब|गाड़ी)|(?:cab|gaadi|कैब|गाड़ी)\s+(?:chahiye|चाहिए)|(?:tak|तक)\s+(?:sedan|सेडान|koi|कोई))(?=\s|[,;.!?]|$)/giu;

function trim(text: string, start: number, end: number): { start: number; end: number } {
  while (start < end && /[\s,;:.!?]/u.test(text[start]!)) start += 1;
  while (end > start && /[\s,;:.!?]/u.test(text[end - 1]!)) end -= 1;
  if (/["“']/u.test(text[start] ?? '') && /["”']/u.test(text[end - 1] ?? '')) { start += 1; end -= 1; }
  return { start, end };
}

function prefixEnd(text: string, end: number): number {
  const observed = collectObservations({ id: 'hindi-route-prefix', revision: 0, text }, []);
  const times = [...[...observed.dates, ...observed.times].map(value => value.ref), ...observed.now]
    .filter(ref => ref.kind === 'QUERY_SPAN').sort((a, b) => a.start - b.start || b.end - a.end);
  let cursor = locationPrefixEnd(text, true);
  for (let attempts = 0; attempts < 16 && cursor < end; attempts += 1) {
    const start = cursor;
    cursor += /^[\s,;:]*/u.exec(text.slice(cursor))![0].length;
    const time = times.find(ref => ref.start === cursor && ref.end <= end && !insideQuote(text, ref.start, ref.end)
      && !/^\s+(?:nagar|cafe|park|road|store|chowk|नगर|कैफे|पार्क|रोड|चौक)(?=\s|[,;.!?]|$)/iu.test(text.slice(ref.end)));
    if (time) {
      cursor = time.end;
      cursor += /^\s+(?:ko|को)(?=\s|$)/iu.exec(text.slice(cursor))?.[0].length ?? 0;
    } else {
      const instruction = /^(?:(?:SUV|sedan|hatchback|सेडान|एसयूवी)\s+(?:only|chahiye|चाहिए|(?:nahi|नहीं)(?:\s+chahiye)?|mat\s+bhejna)|(?:return\s+cab)|(?:koi\s+(?:aur|bhi)\s+gaadi\s+chalegi)|(?:cab\s+chahiye))(?=\s|[,;:]|$)[\s,;:]*/iu.exec(text.slice(cursor));
      if (instruction && !insideQuote(text, cursor)) cursor += instruction[0].length;
    }
    if (cursor === start || cursor === start + /^[\s,;:]*/u.exec(text.slice(start))![0].length && !time) break;
  }
  return Math.min(cursor, end);
}

function destinationEnd(text: string, start: number, end: number): number {
  const segment = text.slice(start, end);
  const commands = [...segment.matchAll(journey), ...segment.matchAll(requestTail)]
    .map(match => start + match.index).filter(offset => !insideQuote(text, offset + 1));
  // A punctuation boundary is a separate clause, never a reason to absorb it.
  const punctuation = /[,;]/u.exec(segment);
  if (punctuation && !insideQuote(text, start + punctuation.index)) commands.push(start + punctuation.index);
  const observed = collectObservations({ id: 'hindi-route-suffix', revision: 0, text }, []);
  const temporal = [...[...observed.dates, ...observed.times].map(value => value.ref), ...observed.now]
    .filter(ref => ref.kind === 'QUERY_SPAN').filter(ref => ref.start >= start && ref.end <= end);
  const zone = timeZoneTokens(text).find(token => token.start >= start && token.end <= end
    && text.slice(token.end, end).trim() === '' && !insideQuote(text, token.start, token.end));
  let boundary = Math.min(zone?.start ?? end, ...commands);
  for (const ref of temporal.sort((a, b) => b.end - a.end || a.start - b.start)) {
    if (/^\d{1,2}$/u.test(text.slice(ref.start, ref.end)) && /(?:gate|sector|block|गेट)\s*$/iu.test(text.slice(0, ref.start))) continue;
    if (ref.end <= boundary && /^[\s,;:]*$/u.test(text.slice(ref.end, boundary)) && !insideQuote(text, ref.start, ref.end)) boundary = ref.start;
  }
  return boundary;
}

function temporalTail(text: string, start: number): boolean {
  const observed = collectObservations({ id: 'hindi-reverse-tail', revision: 0, text }, []);
  const spans = [...[...observed.dates, ...observed.times].map(value => value.ref), ...observed.now]
    .filter(ref => ref.kind === 'QUERY_SPAN').filter(ref => ref.start >= start);
  const tail = text.slice(start).split('');
  for (const ref of [...spans, ...timeZoneTokens(text).filter(zone => zone.start >= start)]) {
    if (insideQuote(text, ref.start, ref.end)) return false;
    tail.fill(' ', ref.start - start, ref.end - start);
  }
  return /^[\s,;:.!?]*$/u.test(tail.join(''));
}

function span(text: string, start: number, end: number, role: HindiRouteSpan['role']): HindiRouteSpan[] {
  const range = trim(text, start, end);
  const value = text.slice(range.start, range.end);
  if (!value || /^(?:from|to|se|से|cab|ride|taxi)$/iu.test(value)) return [];
  return [{ ...range, role }];
}

// Only one unquoted source marker is accepted. Competing routes stay unresolved.
// Plain `ko`, temporal words, and words inside named/quoted places do not split routes.
export function hindiRouteSpans(text: string): HindiRouteSpan[] {
  if (!balancedRouteQuotes(text)) return [];
  // Retain the previously supported explicit reverse commands on separate lines;
  // never mine only the last line of a forward/mixed multiline request.
  if (/[\r\n]/u.test(text)) {
    const lines = [...text.matchAll(/[^\r\n]+/gu)];
    if (!lines.every(line => /\s+(?:(?:jaana|jana)\s+hai|जाना\s+है|drop\s+chahiye)\s+/iu.test(line[0]))) return [];
    return lines.flatMap(line => hindiRouteSpans(line[0]).map(span => ({ ...span, start: line.index + span.start, end: line.index + span.end })));
  }
  const markers = [...text.matchAll(/\s+(?:se|से)(?=\s|[,;.!?]|$)/giu)].filter(match => !insideQuote(text, match.index + 1));
  if (markers.length > 1) return [];
  const marker = markers[0];
  if (!marker) {
    const command = [...text.matchAll(journey)].find(match => !insideQuote(text, match.index + 1));
    if (!command) return [];
    const start = prefixEnd(text, command.index);
    return span(text, start, destinationEnd(text, start, command.index), 'drop');
  }
  const sourceEnd = marker.index;
  const rightStart = marker.index + marker[0].length;
  const left = text.slice(0, sourceEnd);
  // Avoid interpreting an English `from Se Cafe to ...` place name as a Hindi marker.
  if (/\b(?:from|pickup|to)\b/iu.test(left)) return [];
  const reverse = /\s+(?:(?:jaana|jana)\s+hai|जाना\s+है|drop\s+chahiye)\s+/iu.exec(left);
  if (reverse) {
    if (!temporalTail(text, rightStart)) return [];
    const start = prefixEnd(text, reverse.index);
    return [...span(text, start, destinationEnd(text, start, reverse.index), 'drop'),
      ...span(text, reverse.index + reverse[0].length, sourceEnd, 'pickup')];
  }
  return [...span(text, prefixEnd(text, sourceEnd), sourceEnd, 'pickup'),
    ...span(text, rightStart, destinationEnd(text, rightStart, text.length), 'drop')];
}

export function sourceHindiRole(text: string, start: number, end: number): HindiRouteSpan['role'] | undefined {
  const roles = hindiRouteSpans(text).filter(span => span.start === start && span.end === end).map(span => span.role);
  return new Set(roles).size === 1 ? roles[0] : undefined;
}

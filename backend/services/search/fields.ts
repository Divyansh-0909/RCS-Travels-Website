import type { Field, SourceRef } from './contracts.ts';

export const unspecified = (): { state: 'UNSPECIFIED' } => ({ state: 'UNSPECIFIED' });
export const resolved = <T>(value: T, refs: SourceRef[]): Field<T> => ({ state: 'RESOLVED', value, refs });
export const ambiguous = <T>(alternatives: T[], reasonCode: string, refs: SourceRef[]): Field<T> =>
  ({ state: 'AMBIGUOUS', alternatives, reasonCode, refs });

export const queryRef = (query: { id: string; revision: number }, start: number, end: number): Extract<SourceRef, { kind: 'QUERY_SPAN' }> =>
  ({ kind: 'QUERY_SPAN', queryId: query.id, revision: query.revision, start, end });

export type ParseIssue = {
  code: string;
  field: string;
  category: 'MISSING' | 'AMBIGUOUS' | 'INVALID' | 'UNSUPPORTED' | 'POLICY' | 'DEPENDENCY';
  refs: SourceRef[];
  values?: string[];
};

export const issue = (code: string, field: string, category: ParseIssue['category'],
  refs: SourceRef[] = [], values?: string[]): ParseIssue => ({ code, field, category, refs, values });

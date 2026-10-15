import type { RideSearchParseResult } from '../parser.ts';

const eligible = new Set(['COMPLEX_QUERY', 'JEV_TIMEOUT', 'JEV_PROVIDER_ERROR', 'JEV_INVALID_RESPONSE',
  'JEV_SCHEMA_ERROR', 'ROLE_CONFLICT', 'TEMPORAL_CONFLICT', 'EXTRACTION_BINDING_UNRESOLVED', 'LOCATION_CANDIDATE_MISSING']);
const blocked = new Set(['INVALID_INPUT_PROVENANCE', 'LIMIT_EXCEEDED', 'JEV_AUTH_ERROR']);

export function fallbackEligibility(parsed: RideSearchParseResult): string[] {
  if (parsed.issues.some(value => blocked.has(value.code))) return [];
  return [...new Set([...parsed.fallbackReasons, ...parsed.issues.map(value => value.code)])].filter(code => eligible.has(code));
}

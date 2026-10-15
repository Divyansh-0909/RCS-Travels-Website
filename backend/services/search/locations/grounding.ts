import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { parseInputSchema, type LocationCandidate, type QueryIdentity, type LocationRef, type SourceRef } from '../contracts.ts';
import { issue, type ParseIssue } from '../fields.ts';
import { PlaceSearchError, PlaceIdentityRefreshError, placeMatchSchema, type PlaceMatch, type PlaceSearchProvider, type ConfirmedLocation } from './places.ts';

export type LocationTarget = 'pickup' | 'drop';
export type GroundingContext = {
  query: QueryIdentity; candidate: LocationCandidate; target: LocationTarget;
  formRevision: number;
};
export type GroundingResult = GroundingContext & {
  ref: LocationRef; sessionToken: string; matches: PlaceMatch[]; issues: ParseIssue[];
  status: 'NO_MATCH' | 'USER_SELECTION_REQUIRED' | 'RESOLVED' | 'FAILED';
  confirmed?: ConfirmedLocation;
};
export type TrustedLocation = {
  selectionId: string; lat: number; lng: number; displayText: string;
  confirmedAt: string; confirmedByUser: 'selection';
  source: 'GOOGLE_PLACES' | 'USER_CONFIRMED_MAP_PIN' | 'USER_SELECTED_SAVED_PLACE' | 'USER_SELECTED_CURRENT_LOCATION';
  placeId?: string;
};

const nonempty = z.string().trim().min(1);
export const trustedLocationSchema = z.strictObject({
  selectionId: nonempty, lat: z.number().finite().min(-90).max(90), lng: z.number().finite().min(-180).max(180),
  displayText: nonempty, confirmedAt: z.iso.datetime(), confirmedByUser: z.literal('selection'),
  source: z.enum(['GOOGLE_PLACES', 'USER_CONFIRMED_MAP_PIN', 'USER_SELECTED_SAVED_PLACE', 'USER_SELECTED_CURRENT_LOCATION']),
  placeId: nonempty.optional(),
}).refine(value => value.source !== 'GOOGLE_PLACES' || value.placeId !== undefined,
  'Google selections require an authoritative place ID');

function validateContext(context: GroundingContext): void {
  parseInputSchema.parse({ query: context.query, candidates: [context.candidate], timeZone: 'Asia/Kolkata' });
  z.number().int().nonnegative().parse(context.formRevision);
  z.enum(['pickup', 'drop']).parse(context.target);
}

function failure(result: GroundingResult, error: object): GroundingResult {
  const code = error instanceof PlaceSearchError ? `PLACES_${error.code.toUpperCase()}` : 'PLACES_PROVIDER';
  return { ...result, status: 'FAILED', issues: [issue(code, result.target, 'DEPENDENCY')] };
}

// Results carry the exact query, candidate, target and form revision. Application of
// an async result must check all four against the current draft before merging it.
export function createLocationGrounder(provider: PlaceSearchProvider, token = randomUUID) {
  return {
    async search(context: GroundingContext): Promise<GroundingResult> {
      validateContext(context);
      const result: GroundingResult = { ...structuredClone(context),
        ref: { kind: 'QUERY_CANDIDATE', candidateId: context.candidate.candidateId },
        sessionToken: token(), matches: [], issues: [], status: 'NO_MATCH' };
      try {
        const response = await provider.searchAutocomplete({ input: context.candidate.exactText, sessionToken: result.sessionToken });
        const checked = z.array(placeMatchSchema).safeParse(response);
        if (!checked.success) throw new PlaceSearchError('invalid_result');
        const matches = checked.data;
        const ids = matches.map(match => match.placeId);
        if (new Set(ids).size !== ids.length) throw new PlaceSearchError('invalid_result');
        return { ...result, matches, status: matches.length ? 'USER_SELECTION_REQUIRED' : 'NO_MATCH',
          issues: [issue(matches.length ? 'PLACE_SELECTION_REQUIRED' : 'PLACE_NO_MATCH', context.target, 'DEPENDENCY')] };
      } catch (error) { return failure(result, error instanceof Error ? error : {}); }
    },
    async select(result: GroundingResult, placeId: string, currentFormRevision: number): Promise<GroundingResult> {
      validateContext(result);
      if (result.formRevision !== currentFormRevision) throw new Error('STALE_GROUNDING_RESULT');
      if (result.status !== 'USER_SELECTION_REQUIRED' || !result.matches.some(match => match.placeId === placeId)) {
        throw new Error('PLACE_SELECTION_NOT_OFFERED');
      }
      try {
        const confirmed = await provider.getPlaceDetails({ placeId, sessionToken: result.sessionToken });
        if (confirmed.source !== 'GOOGLE_PLACES') throw new PlaceSearchError('invalid_result');
        trustedLocationSchema.parse({ ...confirmed, selectionId: placeId });
        if (confirmed.placeId !== placeId) throw new PlaceSearchError('invalid_result');
        return { ...structuredClone(result), status: 'RESOLVED', confirmed, issues: [] };
      } catch (error) {
        if (error instanceof PlaceIdentityRefreshError && error.requestedPlaceId === placeId
          && !result.issues.some(value => value.code === 'PLACE_ID_REFRESH_SELECTION_REQUIRED')) {
          const replacement = placeMatchSchema.safeParse(error.replacement);
          if (replacement.success && replacement.data.placeId !== placeId) return { ...structuredClone(result),
            status: 'USER_SELECTION_REQUIRED', matches: [replacement.data], confirmed: undefined,
            issues: [issue('PLACE_ID_REFRESH_SELECTION_REQUIRED', result.target, 'DEPENDENCY')] };
        }
        return failure(result, error instanceof Error ? error : {});
      }
    },
  };
}

export function groundingSelection(result: GroundingResult, currentFormRevision: number): TrustedLocation {
  validateContext(result);
  if (result.formRevision !== currentFormRevision) throw new Error('STALE_GROUNDING_RESULT');
  if (result.status !== 'RESOLVED' || result.confirmed === undefined) throw new Error('LOCATION_NOT_RESOLVED');
  const selected = trustedLocationSchema.parse({ ...result.confirmed,
    selectionId: `places:${result.query.id}:${result.query.revision}:${result.candidate.candidateId}:${result.confirmed.placeId}` });
  if (!result.matches.some(match => match.placeId === selected.placeId)) throw new Error('PLACE_SELECTION_NOT_OFFERED');
  return selected;
}

export function standaloneTarget(activeField: LocationTarget | null, choice?: { target: LocationTarget; revision: number }): {
  target?: LocationTarget; refs: SourceRef[]; issues: ParseIssue[];
} {
  if (choice !== undefined) {
    z.strictObject({ target: z.enum(['pickup', 'drop']), revision: z.number().int().nonnegative() }).parse(choice);
    return { target: choice.target, refs: [{ kind: 'USER_FIELD', field: 'locationTarget', revision: choice.revision }], issues: [] };
  }
  if (activeField !== null) {
    z.enum(['pickup', 'drop']).parse(activeField);
    return { target: activeField, refs: [], issues: [] };
  }
  return { refs: [], issues: [issue('LOCATION_TARGET_REQUIRED', 'locationSearch', 'MISSING')] };
}

export function sameGroundedEndpoints(pickup?: TrustedLocation, drop?: TrustedLocation): ParseIssue[] {
  if (pickup === undefined || drop === undefined) return [];
  trustedLocationSchema.parse(pickup); trustedLocationSchema.parse(drop);
  const sameId = pickup.placeId !== undefined && pickup.placeId === drop.placeId;
  const samePoint = pickup.lat === drop.lat && pickup.lng === drop.lng;
  return sameId || samePoint ? [issue('SAME_GROUNDED_ENDPOINTS', 'locations', 'AMBIGUOUS')] : [];
}

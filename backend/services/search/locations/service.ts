import { z } from 'zod';
import { systemClock } from '../../../lib/clock.js';
import { createRideSearchParser, type RideSearchParseResult } from '../parser.ts';
import type { SearchDecisionProvider } from '../provider.ts';
import type { PlaceSearchProvider } from './places.ts';
import { generateLocationCandidates } from './candidates.ts';
import { createLocationGrounder, standaloneTarget, type GroundingResult, type LocationTarget } from './grounding.ts';
import type { ParseIssue } from '../fields.ts';

export type SearchGroundingResult = {
  parse: RideSearchParseResult;
  formRevision: number;
  activeField: LocationTarget | null;
  targetChoice?: { target: LocationTarget; revision: number };
  targetRefs: ReturnType<typeof standaloneTarget>['refs'];
  locations: GroundingResult[];
  issues: ParseIssue[];
};
const contextSchema = z.strictObject({
  formRevision: z.number().int().nonnegative(),
  activeField: z.enum(['pickup', 'drop']).nullable(),
});

function locationContexts(output: SearchGroundingResult) {
  const draft = output.parse.draft;
  if (draft === undefined || output.parse.fallbackRequired) return [];
  const target = standaloneTarget(output.activeField, output.targetChoice);
  const roles: Array<[LocationTarget, typeof draft.pickup]> = draft.queryType === 'LOCATION_SEARCH'
    ? target.target === undefined ? [] : [[target.target, draft.locationSearch]]
    : [['pickup', draft.pickup], ['drop', draft.drop]];
  return roles.flatMap(([role, field]) => {
    if (field.state !== 'RESOLVED' || field.value.kind !== 'QUERY_CANDIDATE') return [];
    const id = field.value.candidateId;
    const candidate = draft.candidates.find(value => value.candidateId === id);
    if (candidate === undefined) throw new Error('UNKNOWN_LOCATION_CANDIDATE');
    return [{ query: draft.query, candidate, target: role, formRevision: output.formRevision }];
  });
}

export function createSearchGroundingService(decisions: SearchDecisionProvider, places: PlaceSearchProvider, clock = systemClock) {
  const parser = createRideSearchParser(decisions, clock, generateLocationCandidates);
  const grounder = createLocationGrounder(places);

  async function ground(output: SearchGroundingResult): Promise<SearchGroundingResult> {
    const draft = output.parse.draft;
    if (draft?.queryType === 'LOCATION_SEARCH' && !output.parse.fallbackRequired) {
      const target = standaloneTarget(output.activeField, output.targetChoice);
      output.targetRefs = target.refs;
      output.issues = target.issues;
    }
    const locations = await Promise.all(locationContexts(output).map(context => grounder.search(context)));
    return { ...output, locations, issues: [...output.issues, ...locations.flatMap(value => value.issues)] };
  }

  return {
    async groundParsed(parsed: RideSearchParseResult, context: { activeField: LocationTarget | null; formRevision: number }): Promise<SearchGroundingResult> {
      const checked = contextSchema.parse(context);
      return ground({ parse: parsed, ...checked, targetRefs: [], locations: [], issues: [] });
    },
    async parse(input: Parameters<typeof parser.parse>[0], context = { activeField: null as LocationTarget | null, formRevision: 0 }): Promise<SearchGroundingResult> {
      const checked = contextSchema.parse(context);
      const parsed = await parser.parse(input);
      return ground({ parse: parsed, ...checked, targetRefs: [], locations: [], issues: [] });
    },
    async chooseLocationTarget(output: SearchGroundingResult, target: LocationTarget, currentFormRevision: number): Promise<SearchGroundingResult> {
      if (output.formRevision !== currentFormRevision) throw new Error('STALE_GROUNDING_RESULT');
      if (output.parse.route !== 'LOCATION_SEARCH' || output.parse.fallbackRequired) throw new Error('NOT_LOCATION_SEARCH');
      const choice = { target, revision: currentFormRevision };
      standaloneTarget(null, choice);
      return ground({ ...structuredClone(output), targetChoice: choice, locations: [], issues: [] });
    },
    selectLocation: grounder.select,
  };
}

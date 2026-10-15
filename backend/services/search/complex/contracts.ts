import { z } from 'zod';
import { bookingDraftSchema, type BookingDraft, type LocationCandidate, type Query } from '../contracts.ts';

export const LUNA_MODEL = 'gpt-6-luna';
export const LUNA_SCHEMA_VERSION = 'ride-search-luna-v1';
export const LUNA_TIMEOUT_MS = 15_000;
// Reuse the domain fields. Transport spans are aliases only: application code
// validates them and supplies candidate identities before constructing a draft.
export const lunaOutputSchema = z.strictObject({
  draft: z.strictObject(bookingDraftSchema.shape).omit({ candidates: true }),
  locations: z.array(z.strictObject({ key: z.string().min(1), start: z.int().nonnegative(),
    end: z.int().nonnegative(), exactText: z.string().min(1).max(240) })).max(24),
});
export type LunaOutput = z.infer<typeof lunaOutputSchema>;
export type ComplexInterpretationInput = {
  query: Query; candidates: LocationCandidate[]; partialDraft: BookingDraft | null;
  fallbackReasons: string[]; now: string; timeZone: string;
  trustedFields: Array<{ field: string; value: object }>;
};
export type ComplexProviderMetadata = {
  provider: 'openai'; model: typeof LUNA_MODEL; schemaVersion: typeof LUNA_SCHEMA_VERSION;
  requestCount: number; latencyMs: number; inputTokens: number | null; outputTokens: number | null;
};
export type ComplexInterpretation = { output: LunaOutput; metadata: ComplexProviderMetadata };
export interface ComplexBookingInterpreter {
  interpret(input: ComplexInterpretationInput, signal?: AbortSignal): Promise<ComplexInterpretation>;
}
export type ComplexProviderCode = 'LUNA_TIMEOUT' | 'LUNA_AUTH_ERROR' | 'LUNA_PROVIDER_ERROR'
  | 'LUNA_SCHEMA_ERROR' | 'LUNA_REFUSAL' | 'LUNA_CANCELLED' | 'LUNA_CONFIG_ERROR';
export class ComplexProviderError extends Error {
  constructor(readonly code: ComplexProviderCode) { super(code); }
}

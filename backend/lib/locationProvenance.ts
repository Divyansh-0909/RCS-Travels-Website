const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const EARLIEST_DEVICE_OBSERVATION_MS = Date.UTC(2000, 0, 1);

export type LocationProvenanceInput = {
  observedAt?: number;
  accuracyMeters?: number | null;
};

export type NormalizedLocationProvenance = {
  observedAt: Date | null;
  receivedAt: Date;
  accuracyMeters: number | null;
};

/**
 * Treat the device clock as evidence, never as authority.
 *
 * Expo timestamps are useful for distinguishing a buffered GPS sample from the
 * time the server received it, but a device clock can be wrong or manipulated.
 * Values before 2000 or more than five minutes in the future are therefore kept
 * as unknown. The server receipt time remains independent and authoritative for
 * arrival ordering.
 */
export function normalizeLocationProvenance(
  input: LocationProvenanceInput,
  receivedAt: Date,
): NormalizedLocationProvenance {
  const rawObservedAt = input.observedAt ?? Number.NaN;
  let observedAt: Date | null = null;

  if (
    rawObservedAt >= EARLIEST_DEVICE_OBSERVATION_MS
    && rawObservedAt <= receivedAt.getTime() + MAX_FUTURE_SKEW_MS
  ) {
    observedAt = new Date(rawObservedAt);
  }

  return {
    observedAt,
    receivedAt,
    accuracyMeters: input.accuracyMeters ?? null,
  };
}

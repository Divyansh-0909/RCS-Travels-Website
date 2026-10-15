// Historical shadow records may lack an envelope. Never substitute a different
// production analysis into the raw/guarded shadow pair.
export function responsibilityInspectionModel(context) {
  if (context.shadowResult) return {
    envelope: context.shadowResult.analysisEnvelope ?? null,
    validation: context.shadowResult.factualValidation ?? null,
  };
  return { envelope: context.analysis?.envelope ?? null, validation: context.analysis?.validation ?? null };
}

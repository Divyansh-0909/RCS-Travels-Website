export function reviewAction(context) {
  if (!context?.case || context.finalDecision) return null;
  if (context.case.state === 'NEEDS_ADMIN_REVIEW') return 'review';
  if (['APPEAL_OPEN', 'APPEAL_REVIEW'].includes(context.case.state) && context.appeal) return 'appeal-review';
  return null;
}

export function reviewPayload(context, { decision, classification, consequenceLevel, reason }) {
  if (!reviewAction(context)) throw new Error('This case is not ready for a decision.');
  if (!['UPHOLD', 'WAIVE'].includes(decision)) throw new Error('Choose a decision.');
  if (typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 2000) {
    throw new Error('Enter a review reason between 3 and 2,000 characters.');
  }
  if (decision === 'UPHOLD' && (classification !== 'DRIVER_CAUSED' || !['LEVEL_1', 'LEVEL_2'].includes(consequenceLevel))) {
    throw new Error('To hold the driver responsible, select Driver responsible and an action level.');
  }
  if (decision === 'WAIVE' && !['PLATFORM_CAUSED', 'EXTERNAL_OR_UNCERTAIN', 'VALID_WAIVED', 'NEEDS_REVIEW'].includes(classification)) {
    throw new Error('Choose a cause that explains why no action should be taken.');
  }
  return { [reviewAction(context) === 'review' ? 'decision' : 'outcome']: decision,
    classification, consequenceLevel: decision === 'WAIVE' ? 'LEVEL_0' : consequenceLevel, reason: reason.trim(),
    evidenceVersion: context.case.evidenceVersion, evidenceHash: context.case.evidenceHash };
}
export const reviewClassificationLabels = Object.freeze({ DRIVER_CAUSED: 'Driver responsible', PLATFORM_CAUSED: 'Service or app problem',
  VALID_WAIVED: 'Valid reason to excuse the driver', EXTERNAL_OR_UNCERTAIN: 'Outside cause or unclear', NEEDS_REVIEW: 'Needs more review' });


export function driverAppealAction(caseId: string, canAppeal: boolean, reason: string) {
    const text = reason.trim();
    if (!caseId.trim() || !canAppeal || text.length < 3 || text.length > 2000) return null;
    return { reason: text, additionalEvidenceRefs: [] };
}

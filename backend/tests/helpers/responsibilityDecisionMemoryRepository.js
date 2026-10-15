const clone = value => structuredClone(value)

export function createResponsibilityDecisionMemoryRepository() {
  const cases = new Map()
  const analyses = new Map()
  const decisions = new Map()
  return {
    stores: { cases, analyses, decisions },
    async findCase(caseId) { return clone(cases.get(caseId) ?? null) },
    async saveCaseEvidence(record) {
      const existing = cases.get(record.id)
      const saved = existing ? { ...clone(record), state: existing.state } : clone(record)
      cases.set(record.id, saved)
      return clone(saved)
    },
    async setCaseState(caseId, state) {
      const existing = cases.get(caseId)
      if (!existing) throw new Error('Missing responsibility case')
      const saved = { ...existing, state }
      cases.set(caseId, saved)
      return clone(saved)
    },
    async findAnalysis(logicalKey) { return clone(analyses.get(logicalKey) ?? null) },
    async saveAnalysis(record) {
      const existing = analyses.get(record.logicalKey)
      if (existing) return clone(existing)
      const saved = clone(record)
      analyses.set(record.logicalKey, saved)
      return clone(saved)
    },
    async findDecision(caseId) { return clone(decisions.get(caseId) ?? null) },
    async saveDecision(record) {
      const existing = decisions.get(record.caseId)
      if (existing) return clone(existing)
      const saved = { id: `decision-${record.caseId}`, ...clone(record) }
      decisions.set(record.caseId, saved)
      return clone(saved)
    },
  }
}

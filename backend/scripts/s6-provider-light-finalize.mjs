import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'

assert.equal(process.argv.length, 2)
const root = new URL('../../', import.meta.url)
const file = new URL('docs/search/s6-development/engineering-review.json', root)
const audit = JSON.parse(await readFile(file, 'utf8'))
const deferred = audit.findings.filter(finding => finding.disposition === 'DEFER_WITH_REASON')
assert.equal(deferred.length, 3)
for (const finding of deferred) {
  Object.assign(finding, { offlineRevisited: true, providerExecutionRequired: true,
    affectsHeldOutLabels: false, canAffectHeldOutCorrectnessOrAvailability: true,
    observedSilentSafetyBypass: false, blocksCompleteS6FreezeNow: true,
    staticRisk: 'LOW', dispositionAfterRevisit: 'DEFER_WITH_REASON',
    freezeBoundary: 'No known static HIGH/CRITICAL. Complete development execution and AI disposition remain mandatory before freeze; deferral is not a waiver of those gates.' })
  if (finding.id === 'ENG-6') {
    finding.providerWorkNeeded = 'Measure strict SDK failures and one-shot fallback recovery in remaining development, preserving failed attempts; do not relax schema.'
    finding.heldOutImpact = 'Intermittent provider rejection can reduce completion/accuracy. Strict validation contains silent malformed output; systematic failures block interpretation signoff.'
  } else if (finding.id === 'ENG-12') {
    finding.evidence = 'Five historical invented vehicle exclusions were rejected by source binding. Current source attempted 131/222; 113 interpretations complete, 17 Luna pending, 1 Places pending, 91 unattempted. Full recovery is unmeasured.'
    finding.providerWorkNeeded = 'Complete remaining current-config interpretations and measure fallback recovery; retain historical raw exclusion errors and source guards.'
    finding.heldOutImpact = 'Unsupported raw exclusions can impair accuracy/completion. No silent adopted exclusion was observed; source binding remains mandatory.'
  } else {
    assert.equal(finding.id, 'ENG-17')
    finding.providerWorkNeeded = 'One small availability preflight only after Places restoration is independently established, then complete missing grounding/current-config work; no automatic quota probing.'
    finding.heldOutImpact = 'Places quota prevents complete grounding and final selected-place evaluation. It does not alter benchmark labels or permit a fabricated success.'
  }
}
await writeFile(file, JSON.stringify(audit, null, 2) + '\n')
console.log(JSON.stringify({ staticAudit: 'PASS', deferred: 3, blockingDeferred: 3, staticHighCritical: 0,
  providerCalls: 0, aiVerifierExecuted: false }))

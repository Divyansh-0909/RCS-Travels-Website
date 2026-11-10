import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ROOT, createWorkbench, VERSION } from './workbench.mjs';

const [repositoryDirectory, outputDirectory] = process.argv.slice(2);
if (!repositoryDirectory || !outputDirectory) throw new Error('Usage: node validate.mjs <repository-root> <existing-export-directory>');
const repository = path.resolve(repositoryDirectory);
const output = path.resolve(outputDirectory);
const call = createWorkbench();
const read = filename => readFile(path.join(repository, filename), 'utf8');
const { documents } = await call('legal_document');
const live = JSON.parse(await read('shared/i18n/locales/en/legal.json')).documents;
const keys = ['terms', 'privacy', 'refunds', 'grievance', 'driver-terms', 'driver-privacy', 'driver-payments', 'driver-grievance'];
const words = value => Object.values(value).flatMap(item => typeof item === 'object' && item !== null ? words(item) : typeof item === 'string' ? [item] : []).join('\n\n');
const comparisons = [];
const scans = [];
for (let index = 0; index < documents.length; index++) {
  const id = documents[index];
  const { text } = await call('legal_document', { id });
  scans.push({ id, ...(await call('legal_policy_review', { text })) });
  const before = live[keys[index]];
  assert.ok(before, `Missing rendered policy: ${keys[index]}`);
  const compared = await call('legal_compare', { currentText: words(before), proposedText: text });
  comparisons.push({ id, comparedWith: `shared/i18n/locales/en/legal.json#documents.${keys[index]}`, removedCount: compared.removedCount, addedCount: compared.addedCount, removedNumericTokens: compared.removedNumericTokens, addedNumericTokens: compared.addedNumericTokens, semanticReview: 'See RESEARCH.md and ADOPTION.md; lexical changes do not determine legal correctness.' });
}
const reviewedPhrases = scans.flatMap(scan => scan.findings.map(finding => ({ document: scan.id, ...finding,
  disposition: scan.id === '05-captain-terms' && finding.excerpt === 'unlimited indemnity' ? 'Reviewed in context: the clause explicitly rejects this obligation.' : 'Requires contextual review',
})));
const evidence = [
  ['customer-cancellation-cap', 'backend/services/cancellationPolicy.js', /CANCELLATION_CHARGE_PCT = 10/u, /CANCELLATION_CHARGE_CAP_PAISE = 10_000/u],
  ['captain-cancellable-states', 'backend/services/driverRideCancellation.js', /\['assigned', 'en_route', 'reached'\]/u],
  ['current-commission', 'backend/services/commission.js', /COMMISSION_PCT = 10/u, /COMMISSION_MIN_FARE = 800/u],
  ['scheduled-captain-hold', 'backend/services/scheduledDeposit.js', /SCHEDULED_ACCEPTANCE_DEPOSIT_PCT = 10/u],
];
const checkedCode = [];
for (const [id, filename, ...patterns] of evidence) {
  const text = await read(filename);
  for (const pattern of patterns) assert.match(text, pattern, `${id} source changed; re-review candidate wording`);
  checkedCode.push({ id, path: filename, sha256: createHash('sha256').update(text).digest('hex'), result: 'scoped-assertions-matched-not-production-verification' });
}
const quotedEvidence = await call('legal_cite_check', { citations: [
  { sourceId: 'IN-DPDP-COMMENCEMENT-2025', quote: 'eighteen months from the date of publication', evidenceText: 'G.S.R. 843(E), clause (c): eighteen months from the date of publication of this gazette', locator: 'English page 2, clause (c); text inspected through official MeitY PDF' },
  { sourceId: 'IN-UP-MARCH-2026-DRAFT', locator: 'Opening page: consultation inviting objections' },
] });
const report = {
  reviewDate: '2026-11-01', packageVersion: VERSION, documents: documents.length,
  scans, contextualReview: reviewedPhrases, comparisons, checkedCode, quotedEvidence,
  sources: await call('legal_sources'), requirements: await call('legal_jurisdiction_matrix'), gaps: await call('legal_gap_report'),
  legalClearance: false, adoptionStatus: 'not-adopted', productionDataAccessed: false,
  limitation: 'Scoped repository checks, mechanical scans and source observations; not legal certification, a complete state-law review, deployed-behaviour verification or a replacement for open decisions.',
};
await writeFile(path.join(output, 'review-report.json'), `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
process.stdout.write(`${JSON.stringify({ documents: documents.length, scopedCodeChecks: checkedCode.length, contextualFindings: reviewedPhrases.length, openFindings: report.gaps.findings.length, legalClearance: false })}\n`);

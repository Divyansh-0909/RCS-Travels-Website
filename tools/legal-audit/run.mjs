import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import './register-resolution.mjs';

const repository = process.cwd();
const auditRoot = path.resolve('legal-review/2026-11-01-audit');
const pluginRoot = path.resolve(process.argv[2] ?? 'tools/legal-workbench');
const { createWorkbench, checkCitations, TOOLS, VERSION } = await import(pathToFileURL(path.join(pluginRoot, 'workbench.mjs')).href);
const call = createWorkbench(pluginRoot);
const { legalDocs, DRAFT, LEGAL_UPDATED } = await import(pathToFileURL(path.resolve('frontend/src/constants/legal.js')).href);
const digest = text => createHash('sha256').update(text).digest('hex');
const slashes = text => text.replace(/\\/gu, '/');
const leaves = (value, location = '') => Object.entries(value).flatMap(([key, item]) => item !== null && typeof item === 'object' ? leaves(item, `${location}/${key}`) : [[`${location}/${key}`, item]]);
const textOf = doc => [`# ${doc.title}`, doc.standfirst, ...doc.sections.flatMap(section => [`## ${section.heading}`, ...(section.body ?? []), ...(section.list ?? []).map(item => `- ${item}`), ...(section.after ?? [])])].filter(Boolean).join('\n\n');
const numericTokens = text => String(text).match(/\d+(?:[,.]\d+)*(?:%|\s*₹)?/gu) ?? [];
await mkdir(path.join(auditRoot, 'snapshots'), { recursive: true });
const documents = [];
async function review(id, source, text) {
  const scan = await call('legal_policy_review', { text });
  const record = { id, source, sha256: digest(text), characters: text.length, findings: scan.findings, legalClearance: scan.legalClearance };
  documents.push(record);
  await writeFile(path.join(auditRoot, 'snapshots', `${id}.md`), text);
}

const catalogs = {};
for (const locale of ['en', 'hi', 'hi-Latn']) catalogs[locale] = JSON.parse(await readFile(`shared/i18n/locales/${locale}/legal.json`, 'utf8'));
const drift = [];
const examples = [];
for (const [route, document] of Object.entries(legalDocs)) {
  const key = route.slice(1);
  await review(`canonical-${key}`, `frontend/src/constants/legal.js#${route}`, textOf(document));
  const original = new Map(leaves(document));
  for (const locale of ['en', 'hi', 'hi-Latn']) {
    const localized = catalogs[locale].documents[key];
    await review(`${locale}-${key}`, `shared/i18n/locales/${locale}/legal.json#documents.${key}`, textOf(localized));
    const translated = new Map(leaves(localized));
    const keys = [...new Set([...original.keys(), ...translated.keys()])];
    const differences = keys.flatMap(leaf => {
      const before = original.get(leaf), after = translated.get(leaf);
      const missing = !original.has(leaf) || !translated.has(leaf);
      const figuresDiffer = !isDeepStrictEqual(numericTokens(before), numericTokens(after));
      const markersDiffer = !isDeepStrictEqual(String(before).match(/\[TO CONFIRM[^\]]*\]/gu) ?? [], String(after).match(/\[TO CONFIRM[^\]]*\]/gu) ?? []);
      const englishDiffer = locale === 'en' && before !== after;
      return missing || figuresDiffer || markersDiffer || englishDiffer ? [{ leaf, missing, figuresDiffer, markersDiffer, englishDiffer, canonical: before ?? null, localized: after ?? null }] : [];
    });
    drift.push({ route, locale, canonicalSections: document.sections.length, localizedSections: localized.sections.length, matchesCanonicalExactly: locale === 'en' ? isDeepStrictEqual(document, localized) : null, differenceCount: differences.length, differences });
    if (locale === 'en') examples.push({ route, canonicalFirst: document.sections[0].body?.[0], renderedFirst: localized.sections[0].body?.[0] });
  }
}
const { documents: candidateIds } = await call('legal_document');
for (const id of candidateIds) {
  const { text } = await call('legal_document', { id });
  await review(`candidate-${id}`, `tools/legal-workbench/documents/${id}.md`, text);
  const exported = await readFile(path.join('legal-review/2026-11-01-candidates/documents', `${id}.md`), 'utf8');
  documents.at(-1).exportMatchesPlugin = exported === text;
}
for (const filename of ['account-and-service-terms.md', 'privacy-policy.md', 'refunds.md', 'cancellation-policy.md', 'fares-and-payments.md', 'support-and-grievances.md', 'compensation-policy.md', 'booking-policy.md', 'shared-and-outstation-rides.md']) {
  const source = `backend/rcs-rag/documents/${filename}`;
  await review(`rag-${filename.slice(0, -3)}`, source, await readFile(source, 'utf8'));
}
for (const [id, filename] of [
  ['pdf-september', 'legal-review/RCS-Travels-Legal-Documents-Lawyer-Review.txt'],
  ['pdf-november-candidate', 'legal-review/2026-11-01-candidates/RCS-Travels-Legal-Candidates.txt'],
]) await review(id, filename.replace(/\.txt$/u, '.pdf'), await readFile(filename, 'utf8'));

const sources = [];
for (const filename of (await readdir(path.join(auditRoot, 'sources'))).filter(name => name.endsWith('.provenance.json'))) {
  const provenance = JSON.parse(await readFile(path.join(auditRoot, 'sources', filename), 'utf8'));
  const contents = await readFile(path.join(auditRoot, 'sources', provenance.filename));
  if (digest(contents) !== provenance.sha256) throw new Error(`Source hash mismatch: ${provenance.filename}`);
  sources.push(provenance);
}
const compared = await call('legal_compare', { currentText: textOf(catalogs.en.documents.terms), proposedText: (await call('legal_document', { id: '01-rider-terms' })).text });
const register = await call('legal_sources');
const primaryChecks = checkCitations([
  { sourceId: 'UP-FINAL-2026', quote: 'maximum of ₹100', evidenceText: await readFile(path.join(auditRoot, 'sources/up-final-order.txt'), 'utf8'), locator: 'Rule 125-V, PDF page 62' },
  { sourceId: 'ECOMMERCE-2020', quote: 'within forty-eight hours', evidenceText: await readFile(path.join(auditRoot, 'sources/consumer-rules-2020.txt'), 'utf8'), locator: 'Rule 4(5), PDF page 9' },
], [
  { id: 'UP-FINAL-2026', primary: true, status: 'final', url: 'https://upmyfleet.com/storage/manual/ViewGOPDF.pdf' },
  { id: 'ECOMMERCE-2020', primary: true, status: 'final', url: 'https://consumeraffairs.gov.in/public/upload/files/E%20commerce%20rules_1732703966.pdf' },
]);
const report = {
  auditDate: '2026-11-01', pluginRoot, pluginVersion: VERSION, toolNames: TOOLS.map(tool => tool.name),
  installedWorkbenchSha256: digest(await readFile(path.join(pluginRoot, 'workbench.mjs'))),
  legalProfile: await call('legal_profile'),
  confirmedTerritories: ['Uttar Pradesh', 'Delhi', 'Haryana', 'Punjab', 'Rajasthan', 'Uttarakhand', 'Himachal Pradesh', 'Jammu and Kashmir'],
  pluginSourceRegister: register,
  pluginJurisdictionMatrix: await call('legal_jurisdiction_matrix'),
  pluginGapRegister: await call('legal_gap_report'),
  pluginCitationExample: await call('legal_cite_check', { citations: [{ sourceId: 'IN-UP-MARCH-2026-DRAFT' }] }),
  freshSourceCitationChecks: primaryChecks,
  citationCheckLimitation: 'Exact quotation matches in locally cached primary text do not establish semantic support, applicability or legal clearance. Fresh-source checks use the audit register; the installed source register remains versioned separately.',
  comparisonExample: { removedCount: compared.removedCount, addedCount: compared.addedCount, removedNumericTokens: compared.removedNumericTokens, addedNumericTokens: compared.addedNumericTokens },
  websiteDraft: DRAFT, websiteEffectiveDate: LEGAL_UPDATED,
  documents, drift, examples, downloadedSourceProvenance: sources,
  counts: { reviewedDocumentUnits: documents.length, canonicalDocuments: Object.keys(legalDocs).length, localizedDocuments: Object.keys(legalDocs).length * 3, candidateDocuments: candidateIds.length, ragDocuments: 9, pdfPacks: 2, englishRoutesWithSourceDrift: drift.filter(row => row.locale === 'en' && !row.matchesCanonicalExactly).length, translatedRoutesWithStructuralOrFigureDrift: drift.filter(row => row.locale !== 'en' && row.differenceCount > 0).length },
  legalClearance: false, productionDataAccessed: false,
};
await writeFile(path.join(auditRoot, 'tool-results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(auditRoot, 'source-register.json'), `${JSON.stringify(sources, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ...report.counts, sourceFilesVerified: sources.length, toolNames: report.toolNames, draft: DRAFT, freshCitationMatches: primaryChecks.map(row => row.quotation), report: slashes(path.relative(repository, path.join(auditRoot, 'tool-results.json'))) }, null, 2)}\n`);

import { readFile, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
export const LIMIT = 80_000;
const normalise = text => text.normalize('NFC').replace(/\s+/gu, ' ').trim();
const string = (value, key, max = LIMIT) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new Error(`${key} must be a nonempty string of at most ${max} characters`);
  }
  return value;
};
const object = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('arguments must be an object');
  return value;
};
const schema = properties => ({ type: 'object', properties, additionalProperties: false });
const textSchema = { type: 'string', minLength: 1, maxLength: LIMIT };

export const TOOLS = [
  { name: 'legal_profile', description: 'Read dated owner-confirmed business facts and unresolved scope. Does not verify legal status or deployment.', inputSchema: schema({}) },
  { name: 'legal_sources', description: 'List the curated source register. Registration is not a live fetch or proof of applicability.', inputSchema: schema({ jurisdiction: { type: 'string', maxLength: 40 } }) },
  { name: 'legal_cite_check', description: 'Check registered source IDs and exact quotations against supplied evidence text. Cannot determine whether a source supports a legal conclusion.', inputSchema: { ...schema({ citations: { type: 'array', minItems: 1, maxItems: 30, items: { ...schema({ sourceId: { type: 'string', minLength: 1, maxLength: 80 }, quote: textSchema, evidenceText: textSchema, locator: { type: 'string', maxLength: 300 } }), required: ['sourceId'] } } }), required: ['citations'] } },
  { name: 'legal_jurisdiction_matrix', description: 'Compare researched requirements and gaps across India and operating jurisdictions; unknown state coverage remains unknown.', inputSchema: schema({ topic: { type: 'string', maxLength: 100 } }) },
  { name: 'legal_policy_review', description: 'Mechanically flag placeholders, draft markers and risky assurances in supplied policy text. An empty result is not legal clearance.', inputSchema: { ...schema({ text: textSchema }), required: ['text'] } },
  { name: 'legal_compare', description: 'Show paragraph additions/removals and changed numeric tokens between two supplied policy versions. Not a semantic or legal comparison.', inputSchema: { ...schema({ currentText: textSchema, proposedText: textSchema }), required: ['currentText', 'proposedText'] } },
  { name: 'legal_gap_report', description: 'Read unresolved evidence, business, implementation and jurisdiction findings. Does not close them automatically.', inputSchema: schema({ category: { type: 'string', maxLength: 60 } }) },
  { name: 'legal_document', description: 'List or read bundled completed legal-document candidates. They are not adopted policies or certified legal advice.', inputSchema: schema({ id: { type: 'string', pattern: '^[a-z0-9-]{1,80}$' } }) },
];

function validateShape(input, definition, label = 'arguments') {
  object(input);
  for (const key of Object.keys(input)) {
    const field = definition.properties[key];
    if (!field) throw new Error(`Unknown ${label} field: ${key}`);
    const value = input[key];
    if (field.type === 'string') {
      if (typeof value !== 'string' || value.length > (field.maxLength ?? LIMIT) || (field.minLength && !value.trim()) || (field.pattern && !new RegExp(field.pattern).test(value))) throw new Error(`Invalid ${label}.${key}`);
    } else if (field.type === 'array') {
      if (!Array.isArray(value) || value.length < field.minItems || value.length > field.maxItems) throw new Error(`Invalid ${label}.${key}`);
      value.forEach((item, i) => validateShape(item, field.items, `${key}[${i}]`));
    }
  }
  for (const key of definition.required ?? []) {
    if (!Object.hasOwn(input, key)) throw new Error(`Missing ${label}.${key}`);
  }
}

export function reviewPolicy(text) {
  string(text, 'text');
  const findings = [];
  const rules = [
    ['unresolved-marker', /\[(?:TO CONFIRM|TO IMPLEMENT|TO ALIGN|PLACEHOLDER)[^\]]*\]/giu],
    ['placeholder', /\b(?:TBD|TODO|INSERT HERE)\b|\{\{[^}]+\}\}/giu],
    ['unsupported-assurance', /\b(?:fully compliant|legally certified|legally cleared|lawyer[- ]approved|100% secure|guaranteed secure)\b/giu],
    ['rights-restriction', /\b(?:waive all rights|no refunds under any circumstances|sole and exclusive jurisdiction|unlimited indemnity)\b/giu],
    ['review-date', /\bAs of\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/giu],
  ];
  for (const [code, expression] of rules) {
    for (const match of text.matchAll(expression)) {
      findings.push({ code, line: text.slice(0, match.index).split('\n').length, excerpt: match[0].slice(0, 240) });
      if (findings.length >= 100) break;
    }
    if (findings.length >= 100) break;
  }
  return {
    kind: 'mechanical-text-review', findings, truncated: findings.length >= 100,
    legalClearance: false,
    limitation: 'No legal conclusion, factual verification, coverage guarantee or approval follows from these checks. Independently review law, implementation and business commitments.',
  };
}

export function comparePolicies(currentText, proposedText) {
  string(currentText, 'currentText'); string(proposedText, 'proposedText');
  const paragraphs = text => text.split(/\n\s*\n/u).map(normalise).filter(Boolean);
  const before = paragraphs(currentText), after = paragraphs(proposedText);
  const oldSet = new Set(before), newSet = new Set(after);
  const removed = before.filter(text => !newSet.has(text));
  const added = after.filter(text => !oldSet.has(text));
  const numbers = text => [...new Set(text.match(/(?:₹\s*)?\d+(?:[,.]\d+)*(?:\s*%|\s*(?:metres|meters|days|hours|minutes))?/gu) ?? [])];
  const oldNumbers = numbers(currentText), newNumbers = numbers(proposedText);
  return {
    kind: 'lexical-paragraph-comparison',
    removedCount: removed.length, addedCount: added.length,
    removed: removed.slice(0, 30).map(text => text.slice(0, 2000)),
    added: added.slice(0, 30).map(text => text.slice(0, 2000)),
    removedNumericTokens: oldNumbers.filter(value => !newNumbers.includes(value)),
    addedNumericTokens: newNumbers.filter(value => !oldNumbers.includes(value)),
    limitation: 'Wording and number differences only. Equivalent numbers may be formatted differently. Read both documents to assess legal and behavioural significance.',
  };
}

export function checkCitations(citations, sources) {
  return citations.map(citation => {
    const source = sources.find(item => item.id === citation.sourceId);
    const result = { sourceId: citation.sourceId, sourceRegistered: Boolean(source), semanticSupportVerified: false };
    if (!source) return { ...result, status: 'unknown-source', quotation: 'not-checked' };
    result.sourceStatus = source.status;
    result.url = source.url;
    result.primary = source.primary;
    result.status = source.status === 'draft' ? 'draft-not-operative-authority' : 'requires-applicability-review';
    result.locatorProvided = Boolean(citation.locator?.trim());
    if (!citation.quote) result.quotation = 'not-requested';
    else if (!citation.evidenceText) result.quotation = 'missing-evidence';
    else {
      result.quotation = normalise(citation.evidenceText).includes(normalise(citation.quote)) ? 'exact-normalised-match' : 'no-exact-match';
      result.evidenceProvenance = 'caller-supplied-not-authenticated';
    }
    return result;
  });
}

export function createWorkbench(root = ROOT) {
  const data = async name => JSON.parse(await readFile(path.join(root, 'data', `${name}.json`), 'utf8'));
  const documentList = async () => (await readdir(path.join(root, 'documents'))).filter(name => /^[a-z0-9-]+\.md$/u.test(name)).sort();
  return async function call(name, args = {}) {
    const definition = TOOLS.find(tool => tool.name === name);
    if (!definition) throw new Error('Unknown tool');
    validateShape(args, definition.inputSchema);
    switch (name) {
      case 'legal_profile': return data('profile');
      case 'legal_sources': {
        const register = await data('sources');
        return { ...register, sources: args.jurisdiction ? register.sources.filter(source => source.jurisdictions.includes(args.jurisdiction)) : register.sources };
      }
      case 'legal_cite_check': {
        const results = checkCitations(args.citations, (await data('sources')).sources);
        return { results, legalClearance: false, limitation: 'A quotation match only compares caller-supplied text. It does not authenticate the evidence, check commencement, validate a URL or establish that the source supports a legal proposition.' };
      }
      case 'legal_jurisdiction_matrix': {
        const register = await data('requirements');
        return { ...register, rows: args.topic ? register.rows.filter(row => row.topic.toLowerCase().includes(args.topic.toLowerCase())) : register.rows };
      }
      case 'legal_policy_review': return reviewPolicy(args.text);
      case 'legal_compare': return comparePolicies(args.currentText, args.proposedText);
      case 'legal_gap_report': {
        const register = await data('gaps');
        return { ...register, findings: args.category ? register.findings.filter(finding => finding.category === args.category) : register.findings };
      }
      case 'legal_document': {
        const documents = await documentList();
        if (!args.id) return { status: 'completed-drafting-candidates-not-adopted', documents: documents.map(name => name.slice(0, -3)) };
        const filename = `${args.id}.md`;
        if (!documents.includes(filename)) throw new Error('Unknown document ID');
        return { id: args.id, status: 'candidate-not-adopted', text: await readFile(path.join(root, 'documents', filename), 'utf8') };
      }
    }
  };
}

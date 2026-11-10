import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

export const fields = ['id','platform','role','parent_id','screen','kind','route','aliases','source_file','source_line','source_token','state','theme_policy','theme_basis','targets','entry_path','reachability','preview_path','preview_actor','navigation_steps','audit_status','audit_dimensions','issue_ids','issue_severity','owner_decision','implementation_status','verification_status','verification_levels','inventory_phase','last_review_phase','last_review_date','evidence_urls','blocker','next_action'];
export const lists = ['aliases','targets','navigation_steps','audit_dimensions','issue_ids','verification_levels','evidence_urls'];
export const vocabulary = {
  platform: ['website','android'],
  kind: ['route','subscreen','dialog','state_group','shared_surface','section','redirect','fixture'],
  audit_status: ['NOT_REVIEWED','AUDITED','BLOCKED','NOT_APPLICABLE'],
  owner_decision: ['NOT_APPLICABLE','OWNER_REVIEW_REQUIRED','APPROVED_FOR_FIX','OWNER_DEFERRED'],
  issue_severity: ['NOT_APPLICABLE','UNRATED','LOW','MEDIUM','HIGH','CRITICAL'],
  implementation_status: ['NOT_CHANGED','APPROVED_FOR_FIX','FIXED_UNVERIFIED','VERIFIED','OWNER_DEFERRED','NOT_APPLICABLE'],
  verification_status: ['NOT_RUN','VERIFIED','FAIL','BLOCKED','NOT_APPLICABLE'],
  theme_policy: ['LEGACY_FIXED','BOTH','LIGHT_FIXED','DARK_FIXED','UNKNOWN'],
  reachability: ['SOURCE_DISCOVERED','SYNTHETIC_REACHABLE','DEVICE_OFFLINE','DEVICE_OBSERVED','FIXTURE_REQUIRED','DEV_ONLY','EXTERNAL_HANDOFF','REDIRECT','UNREACHABLE'],
  verification_levels: ['SOURCE_ONLY','FIXTURE_RENDER','BROWSER_INTERACTION','LIVE_MANUAL','KEYBOARD','AXE','MAESTRO_DEVICE','NATIVE_NODE','ISOLATED_BACKEND','PRODUCTION_ACCEPTANCE'],
};
export function serialize(rows) {
  const cell = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  return fields.join(',') + '\n' + rows.map(row => fields.map(field => cell(lists.includes(field) ? JSON.stringify(row[field] || []) : row[field])).join(',')).join('\n') + '\n';
}
export function parse(csv) {
  const records = []; let record = [], value = '', quoted = false;
  csv = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') { if (quoted && csv[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { record.push(value); value = ''; }
    else if (c === '\n' && !quoted) { record.push(value.replace(/\r$/, '')); if (record.some(Boolean)) records.push(record); record = []; value = ''; }
    else value += c;
  }
  assert(!quoted, 'Unterminated CSV quote');
  if (value || record.length) { record.push(value); records.push(record); }
  const header = records.shift(), legacy = !header.includes('issue_severity');
  assert.deepEqual(header, legacy ? fields.filter(f=>f!=='issue_severity') : fields, 'Coverage schema/header mismatch');
  return records.map(record => {
    assert.equal(record.length, header.length, 'CSV column count');
    const row = Object.fromEntries(header.map((key, i) => [key, lists.includes(key) ? JSON.parse(record[i]) : record[i]]));
    if(legacy)row.issue_severity=row.issue_ids.length?'UNRATED':'NOT_APPLICABLE';
    row.source_line = Number(row.source_line); return row;
  });
}
export function validate(rows, { root = process.cwd(), issues = [], routes = [], checkSources = true } = {}) {
  const ids = new Set(), logical = new Set(), issueMap = new Map(issues.map(i => [i.id, i]));
  for (const row of rows) {
    assert(/^[WA]\.[A-Z0-9_.-]+$/.test(row.id), 'Stable semantic ID: ' + row.id);
    assert(!ids.has(row.id), 'Duplicate ID: ' + row.id); ids.add(row.id);
    for (const [key, values] of Object.entries(vocabulary)) {
      const actual = Array.isArray(row[key]) ? row[key] : [row[key]];
      assert(actual.every(v => values.includes(v)), 'Invalid ' + key + ': ' + row.id);
    }
    for (const key of lists) assert(Array.isArray(row[key]), key + ' must be an array');
    const key = [row.platform,row.kind,row.source_file,row.route,row.state].join('|');
    assert(!logical.has(key), 'Duplicate logical surface: ' + row.id); logical.add(key);
    assert(row.role && row.screen && row.route && row.entry_path && row.next_action, 'Missing discovery details: ' + row.id);
    assert(row.targets.length && Number.isInteger(row.source_line) && row.source_line > 0, 'Missing target/source: ' + row.id);
    if (checkSources) {
      const source = path.resolve(root, row.source_file);
      assert(source.startsWith(path.resolve(root) + path.sep) && !row.source_file.includes('node_modules'), 'Source outside repository');
      const line = fs.readFileSync(source, 'utf8').split(/\r?\n/)[row.source_line - 1];
      assert(row.source_token && line?.includes(row.source_token), 'Stale or missing real code evidence: ' + row.id);
    }
    assert(row.issue_ids.every(id => issueMap.has(id)), 'Orphan issue: ' + row.id);
    if (row.verification_status === 'VERIFIED') {
      assert(row.evidence_urls.some(url => /^https:\/\/drive\.google\.com\//.test(url)), 'Verified without exact Drive evidence: ' + row.id);
      assert(row.last_review_phase && row.last_review_date && row.audit_dimensions.length, 'Verified without bounded history: ' + row.id);
      assert(row.verification_levels.some(v => ['BROWSER_INTERACTION','KEYBOARD','AXE','MAESTRO_DEVICE','NATIVE_NODE','ISOLATED_BACKEND'].includes(v)), 'A source/screenshot alone is not functional verification: ' + row.id);
    }
    if (row.owner_decision === 'OWNER_DEFERRED') assert(row.verification_status === 'FAIL' && row.implementation_status === 'OWNER_DEFERRED', 'Owner deferral must retain failure: ' + row.id);
    if (row.verification_levels.includes('PRODUCTION_ACCEPTANCE')) throw Error('No P01-P05 production acceptance is authorized');
    if (row.verification_levels.includes('NATIVE_NODE')) assert(!row.audit_dimensions.includes('spoken_talkback'), 'Native node state is not spoken TalkBack');
    if (row.platform === 'android' && row.reachability === 'DEVICE_OBSERVED') assert(row.evidence_urls.some(url=>/^https:\/\/drive\.google\.com\//.test(url))&&row.verification_levels.includes('FIXTURE_RENDER'),'Observed native reachability requires exact device evidence: '+row.id);
  }
  for (const row of rows) {
    assert(!row.parent_id || ids.has(row.parent_id), 'Unresolved parent: ' + row.id);
    const seen = new Set([row.id]); let parent = row.parent_id;
    while (parent) { assert(!seen.has(parent), 'Parent cycle'); seen.add(parent); parent = rows.find(r => r.id === parent)?.parent_id; }
  }
  for (const route of routes) assert(rows.some(r => r.platform === route.platform && [r.route,...r.aliases].includes(route.path)), 'Discovered route omitted: ' + route.platform + ' ' + route.path);
  for (const issue of issues) assert(rows.some(r => r.issue_ids.includes(issue.id)), 'Issue silently omitted: ' + issue.id);
  assert.deepEqual(parse(serialize(rows)), rows, 'CSV round trip must preserve all records');
  return { rows: rows.length, uniqueIds: ids.size, duplicateIds: 0, orphanParents: 0, orphanIssues: 0, missingRoutes: 0, sourceTraces: checkSources ? rows.length : 'not checked', roundTrip: true };
}
export function summarize(rows) {
  const count = key => Object.fromEntries([...new Set(rows.map(r => r[key]))].sort().map(value => [value, rows.filter(r => r[key] === value).length]));
  return { total: rows.length, platform: count('platform'), role: count('role'), kind: count('kind'), audit: count('audit_status'), owner: count('owner_decision'), implementation: count('implementation_status'), verification: count('verification_status'), reachability: count('reachability'), dimensions: Object.fromEntries([...new Set(rows.flatMap(r => r.audit_dimensions))].sort().map(dim => [dim,rows.filter(r => r.audit_dimensions.includes(dim)).length])), unknownTheme: rows.filter(r => r.theme_policy === 'UNKNOWN').length };
}

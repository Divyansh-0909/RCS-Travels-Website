import fs from 'node:fs';
import path from 'node:path';
import { readJson, hash } from '../../handoff/core.mjs';

export const auditDirectory = 'output/handoff/website-consistency-2026-10-26';
export const auditBatch = 'VC-B02-2026-10-26';
const scopes = [
  ['W.SETTINGS.APPEARANCE', 'W.SETTINGS.LANGUAGE', 'W.SAFETY.CONTACT'],
  ['W.ACCOUNT.PROFILE'],
  ['W.ADMIN.BOOKINGS', 'W.ADMIN.DRIVERS', 'W.ADMIN.USERS'],
  ['W.LOGIN', 'W.SIGNUP', 'W.BOOKING.ROUTE', 'W.SETTINGS.SAVED-PLACES', 'W.SAFETY.CONTACT', 'W.ADMIN.BOOKINGS', 'W.RESPONSIBILITY'],
  ['W.LOGIN', 'W.SIGNUP', 'W.BOOKING.ROUTE', 'W.SETTINGS.SAVED-PLACES', 'W.SAFETY.CONTACT', 'W.ADMIN.BOOKINGS'],
  ['W.BOOKING.ROUTE'],
  ['W.BOOKING.ROUTE', 'W.BOOKING.VEHICLES', 'W.ADMIN.BOOKINGS', 'W.ACCOUNT.DETAIL', 'W.HOME'],
  ['W.SETTINGS.NOTIFICATIONS', 'W.SAFETY.LOCATION', 'W.BOOKING.VEHICLES'],
  ['W.ADMIN.DRIVER-DETAIL'],
  ['W.SETTINGS.SAVED-PLACES', 'W.SAFETY.CONTACT', 'W.LOGIN', 'W.BOOKING.TIMING', 'W.BOOKING.VEHICLES', 'W.ACCOUNT.PROFILE'],
  ['W.LOGIN', 'W.SIGNUP', 'W.SETTINGS.SAVED-PLACES', 'W.SAFETY.CONTACT', 'W.ADMIN.DRIVER-DETAIL'],
  ['W.ADMIN.DRIVER-DETAIL', 'W.RESPONSIBILITY', 'W.ADMIN.FARES', 'W.ACCOUNT.PROFILE'],
  ['W.BOOKING.VEHICLES', 'W.RESPONSIBILITY', 'W.ACCOUNT.PROFILE', 'W.ACCOUNT.DETAIL'],
  ['W.LOGIN', 'W.SETTINGS.SAVED-PLACES'],
];
const names = ['Focus states', 'Account editor crash', 'Filter backdrop', 'Input sizes', 'Input colours and borders', 'Compact trip and timing pills', 'Other pill styles', 'Switch styles', 'Finance button contrast', 'Close, back and delete controls', 'Invalid-field feedback', 'Selects and other fields', 'Primary action sizes', 'Loading fields'];
const summaries = [
  'Some focused controls show no visible focus change.', 'Account edit panels crash before their fields render.',
  'A backdrop intercepts clicks on admin filters.', 'Fields use 38–54.6px heights and different desktop scaling.',
  'Fill, border, placeholder and focus rules differ.', 'The trip group is 60px tall; Later is 48px.',
  'Pills use different sizing rules across the site.', 'Settings and ride options use different switch designs.',
  'Finance pairs an adaptive ink background with fixed white text.', 'Icon controls differ in size, naming and keyboard support.',
  'Invalid fields use different border and message treatments.', 'Selects, numbers and textareas define their own field styles.',
  'Primary-action sizing is not shared across all actions.', 'Busy fields differ in editability and visual feedback.',
];
const genericChoices = [
  { id: 'PROPOSAL', label: 'Use the suggested direction', shortLabel: 'Use proposal' },
  { id: 'VARIANTS', label: 'Keep purpose-specific variants', shortLabel: 'Keep variants' },
  { id: 'REVIEW', label: 'Review this later', shortLabel: 'Decide later' },
];
export function auditCatalog(root) {
  const file = path.join(root, auditDirectory, 'audit.json');
  const data = readJson(file, null);
  if (!data) return null;
  const supplement = readJson(path.join(root, auditDirectory, 'supplement.json'), { pending: [] });
  const families = data.findings.map((finding, index) => {
    const choices = index === 5 ? [
      { id: 'A', label: '36px pill face / 14px text / 40px visible group', shortLabel: '36px pills' },
      { id: 'B', label: '40px pill face / 16px text / 44px visible group', shortLabel: '40px pills' },
      { id: 'REVIEW', label: 'Review this later', shortLabel: 'Decide later' },
    ] : index === 3 ? [
      { id: 'A', label: '48px standard fields with 16px text', shortLabel: '48px fields' },
      { id: 'B', label: '42px standard fields with 16px text', shortLabel: '42px fields' },
      { id: 'VARIANTS', label: 'Standard and deliberately dense field variants', shortLabel: 'Size variants' },
      { id: 'REVIEW', label: 'Review this later', shortLabel: 'Decide later' },
    ] : [1, 2, 8].includes(index) ? [genericChoices[0], genericChoices[2]] : genericChoices;
    return {
      ...finding, audit: true, name: names[index], summary: summaries[index], choices,
      screens: scopes[index], rationale: finding.detail, cascade: finding.proposal,
      sourceSamples: finding.sources.slice(0, 2).map(reference => {
        const split = reference.lastIndexOf(':'), source = reference.slice(0, split), line = Number(reference.slice(split + 1));
        const text = fs.readFileSync(path.join(root, source), 'utf8');
        return { source, line, code: text.split(/\r?\n/).slice(Math.max(0, line - 2), line + 2).join('\n'), sha256: hash(text) };
      }),
    };
  });
  return {
    batch: auditBatch, families, labels: data.labels, observations: data.observations,
    pending: supplement.pending, catalogRevision: hash(JSON.stringify({ evidence: hash(fs.readFileSync(file)), families })),
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { savedPlaceValidity, validPlaceCoordinates } from '../src/lib/savedPlaceValidation.js';

const base = { name: 'Home', address: 'Synthetic Aster Road', coordinates: { lat: 28.61, lng: 77.21 } };
test('new saved locations require resolved coordinates rather than just plausible address text', () => {
  assert.equal(savedPlaceValidity({ ...base, coordinates: null }).valid, false);
  assert.equal(savedPlaceValidity(base).valid, true);
  for (const coordinates of [{ lat: NaN, lng: 77 }, { lat: 28, lng: Infinity }, { lat: 91, lng: 0 }, { lat: 0, lng: -181 }]) assert.equal(savedPlaceValidity({ ...base, coordinates }).valid, false);
});
test('place names enforce the existing 1–40 character contract', () => {
  for (const name of ['', '   ', 'A'.repeat(41)]) assert.equal(savedPlaceValidity({ ...base, name }).nameValid, false);
  for (const name of ['A', 'A'.repeat(40), ' Parents ']) assert.equal(savedPlaceValidity({ ...base, name }).nameValid, true);
});
test('legacy addresses can be renamed without fabricating Google verification', () => {
  const original = { id: 'synthetic-home', address: base.address };
  assert.equal(savedPlaceValidity({ ...base, name: 'Parents', coordinates: null, original }).valid, true);
  assert.equal(savedPlaceValidity({ ...base, address: 'Different street', coordinates: null, original }).valid, false);
  assert.equal(savedPlaceValidity({ ...base, coordinates: null, original: { address: base.address } }).valid, false);
});
test('an in-flight location resolution cannot enable saving', () => {
  assert.equal(savedPlaceValidity({ ...base, resolving: true }).valid, false);
});
test('address length and coordinate boundaries remain explicit', () => {
  assert.equal(savedPlaceValidity({ ...base, address: 'A'.repeat(200) }).valid, true);
  assert.equal(savedPlaceValidity({ ...base, address: 'A'.repeat(201) }).valid, false);
  assert.equal(savedPlaceValidity({ ...base, address: '  ' }).valid, false);
  assert.equal(validPlaceCoordinates({ lat: 0, lng: 0 }), true);
  assert.equal(validPlaceCoordinates({ lat: -90, lng: 180 }), true);
  assert.equal(validPlaceCoordinates({ lat: '28', lng: 77 }), false);
});

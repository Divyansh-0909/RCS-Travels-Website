import test from 'node:test';
import assert from 'node:assert/strict';
import { isMaestroStartupFailure } from '../../tools/phase9-native/maestro-startup.mjs';

test('only a Maestro driver startup timeout before any flow can retry', () => {
  assert.equal(isMaestroStartupFailure('Maestro AndroidDriverTimeoutException\n at maestro.drivers.AndroidDriver.awaitLaunch'), true);
  assert.equal(isMaestroStartupFailure('Maestro driver started'), false);
  assert.equal(isMaestroStartupFailure(' > Flow acceptance\nAndroidDriverTimeoutException'), false);
  assert.equal(isMaestroStartupFailure(' > Flow acceptance\nTap Accept completed\nHTTP 503'), false);
  assert.equal(isMaestroStartupFailure(''), false);
});

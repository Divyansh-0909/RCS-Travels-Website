export const criticalFiles = [
  'backend/services/driverResponsibilityNotices.js',
  'backend/tests/helpers/phase9NativeGateway.js',
  'backend/tests/helpers/phase9UiSources.js',
  'tools/phase9-cross/ui-reproduction.mjs',
  'frontend/src/lib/requestSequence.js',
  'frontend/src/lib/bookingTiming.js',
  'driver-app/src/lib/driverAppealAction.ts',
  'driver-app/src/lib/driverCancellationView.ts',
  'driver-app/src/lib/offerAcknowledgement.ts',
  'frontend/src/lib/bookingReadSafety.js',
];
export const criticalTests = [
  'backend/tests/driverResponsibilityNotices.test.js',
  'backend/tests/phase9NativeTransport.test.js',
  'backend/tests/phase9NativeAcknowledgement.test.js',
  'backend/tests/phase9UiSources.test.js',
  'backend/tests/phase9UiReproduction.test.js',
  'frontend/tests/requestSequence.test.js',
  'frontend/tests/bookingTiming.test.js',
  'driver-app/tests/driverAppealAction.test.mjs',
  'driver-app/tests/driverCancellationView.test.mjs',
  'driver-app/tests/offerAcknowledgement.test.mjs',
  'frontend/tests/bookingReadSafety.test.js',
];
export const mutationGroups = {
  notices: { files: [criticalFiles[0]], tests: [criticalTests[0]] },
  gateway: { files: [criticalFiles[1]], tests: criticalTests.slice(1, 3) },
  sources: { files: [criticalFiles[2]], tests: [criticalTests[3]] },
  reproduction: { files: [criticalFiles[3]], tests: [criticalTests[4]] },
  customer: { files: [...criticalFiles.slice(4, 6), criticalFiles[9]], tests: [...criticalTests.slice(5, 7), criticalTests[10]] },
  captain: { files: criticalFiles.slice(6, 9), tests: criticalTests.slice(7, 10) },
};

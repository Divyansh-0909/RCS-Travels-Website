import js from '@eslint/js'
import globals from 'globals'
export default [{
  files: ['services/scheduledOfferAcceptance.js', 'services/driverRideCancellation.js', 'services/driverAssignment.js',
    'services/scheduledOffers.js', 'services/assignScheduledRides.js', 'routes/payments.js',
    'tests/helpers/phase9*.js', 'tests/phase9Safety.test.js',
    'services/responsibilityShadowDiagnostics.js', 'services/responsibilityShadowAdjudication.js',
    'services/scheduledDepositLifecycle.js', 'services/customerCancellation.js', 'services/rideSettlement.js',
    'services/refundProviderState.js', 'services/walletKeys.js', 'services/commission.js', 'services/driverCancellations.js',
    'services/paymentStatus.js', 'services/razorpayWebhook.js',
    'tests/integration/phase9*.test.js', 'tests/phase9*.test.js', 'tests/run-phase9.js',
    'services/lifecycleIncidentEvidence.js', 'services/customerLifecycleIncidents.js', 'services/scheduledReservationHandoff.js',
    'services/driverLocationUpdate.js', 'services/driverDispatchOffers.js', 'services/driverDispatchCandidates.js',
    'services/driverDelay.js', 'services/cancellationLocationEvidence.js', 'services/googleRoutes.js'],
  languageOptions: { globals: globals.node },
  rules: { ...js.configs.recommended.rules, complexity: ['error', 24],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] },
}, {
  files: ['services/scheduledDepositLifecycle.js', 'services/scheduledOfferAcceptance.js', 'services/customerCancellation.js',
    'services/rideSettlement.js', 'services/refundProviderState.js', 'services/commission.js', 'services/walletKeys.js',
    'services/driverCancellations.js', 'services/driverRideCancellation.js', 'services/paymentStatus.js',
    'services/razorpayWebhook.js', 'services/lifecycleIncidentEvidence.js', 'services/customerLifecycleIncidents.js',
    'services/scheduledReservationHandoff.js', 'services/driverLocationUpdate.js', 'services/driverDispatchOffers.js',
    'services/driverDispatchCandidates.js', 'services/driverDelay.js', 'services/cancellationLocationEvidence.js',
    'services/googleRoutes.js', 'tests/helpers/phase9Replay*.js', 'tests/helpers/phase9ControlledTime.js'],
    rules: { complexity: ['error', 21] },
}]

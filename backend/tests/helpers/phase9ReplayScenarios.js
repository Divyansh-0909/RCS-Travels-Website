const START = '2026-10-09T06:00:00.000Z'
const at = minutes => new Date(Date.parse(START) + minutes * 60_000).toISOString()
const e = (type, minute, rest = {}) => ({ type, at: at(minute), ...rest })
const capture = e('capture', 0, { expected: 200 })
const assign = [capture, e('offer', 61), e('accept', 61, { expected: 'claimed' })]
const replacement = [...assign, e('snapshot', 62, { name: 'original' }), e('driver_cancel', 62), e('offer', 62),
  e('accept', 62, { driver: 'partner', expected: 'claimed' })]
const complete = driver => [e('ride', 63, { to: 'reached', driver, expected: true }),
  e('ride', 64, { to: 'started', driver, expected: true }), e('snapshot', 64, { name: 'started' }),
  e('ride', 65, { to: 'completed', driver, expected: true })]
const cancel = [capture, e('customer_cancel', 1)]
const refund = [e('refund', 66), e('refund_callback', 67)]
const shadow = [e('forbid', 68), e('shadow', 68), e('shadow', 69)]
const recipe = (id, events, initial = {}) => ({ id, initial: { at: START, fare: 1000, ...initial },
  events: events.map((event, index) => ({ ...event, sequence: index + 1 })) })

/** Explicit input recipes for the 23 historical financial identities, plus observed-world regressions. */
export const phase9FinancialReplayRecipes = [
  recipe('replacement-refund', [...replacement, e('driver_cancel', 63, { snapshot: 'original', expected: null }),
    e('customer_cancel', 64), ...refund, e('customer_cancel', 70), e('refund', 70)]),
  recipe('replacement-completion-cash', [...replacement, ...complete('partner'), e('stale_ride', 66, { to: 'completed',
    driver: 'partner', snapshot: 'started', expected: false }), e('cash', 66), e('cash', 66)]),
  recipe('stale-original-ownership', [...replacement, e('stale_ride', 63, { to: 'en_route', snapshot: 'original', expected: false }),
    e('stale_cancel', 63, { snapshot: 'original' })]),
  recipe('occupied-replacement-retry', [...assign, e('driver_cancel', 62), e('offer', 62), e('capacity', 62, { driver: 'partner', value: 0 }),
    e('accept', 63, { driver: 'partner', expected: 'no_room' }), e('capacity', 64, { driver: 'partner', value: 4 }),
    e('accept', 64, { driver: 'partner', expected: 'claimed' })]),
  recipe('replacement-cancellation-race', [...assign, e('driver_cancel', 62), e('offer', 62),
    e('race', 63, { mode: 'replacement_cancel', expected: ['claimed', false] })]),
  recipe('refund-lost-response', [...cancel, e('provider_fault', 2, { outcome: 'LOST_RESPONSE' }), e('refund', 2),
    e('restart', 3), e('refund', 3), e('refund_callback', 4), e('refund', 5)]),
  recipe('refund-timeout', [...cancel, e('provider_fault', 2, { outcome: 'TIMEOUT' }), e('refund', 2, { expectError: 'timed out' }),
    e('restart', 3), e('refund', 3), e('refund_callback', 4)]),
  recipe('refund-crash-before-ack', [...cancel, e('refund', 2, { crashBeforeAck: true, expectError: 'SYNTHETIC_CRASH' }),
    e('restart', 3), e('refund', 3), e('refund_callback', 4)]),
  recipe('refund-terminal-callback-order', [...cancel, e('refund', 2), e('refund_callback', 3), e('refund_ack', 4),
    e('refund_callback', 5, { status: 'failed' })]),
  recipe('refund-provider-failure', [...cancel, e('refund', 2), e('refund_callback', 3, { status: 'failed' })]),
  recipe('delayed-payment-failure', [...cancel, e('refund', 2), e('payment_failed', 3), e('refund_callback', 4)]),
  recipe('partial-arrival-refund', [...assign, e('ride', 62, { to: 'reached', expected: true }), e('customer_cancel', 63),
    e('refund', 64, { excess: true }), e('refund_callback', 65)], { fare: 2000 }),
  recipe('authorized-arrival-waiver', [...assign, e('ride', 62, { to: 'reached', expected: true }),
    e('customer_cancel', 63, { reason: 'driver_asked_to_cancel' }), ...refund]),
  recipe('cancel-before-delayed-capture', [e('customer_cancel', 0), e('capture', 1), e('capture', 1), e('refund_callback', 2)]),
  recipe('duplicate-completion-race', [...assign, e('ride', 62, { to: 'reached' }), e('ride', 63, { to: 'started' }),
    e('race', 64, { mode: 'duplicate_completion', expected: [true, false] })]),
  recipe('signed-final-platform-capture', [...assign, ...complete('rcs'), e('final_capture', 66, { expected: 200 })]),
  recipe('below-floor-terminal-shadow', [...replacement, ...complete('partner'), ...shadow], { fare: 700 }),
  recipe('competing-replacement-drivers', [...assign, e('driver_cancel', 62), e('capacity', 62, { driver: 'admin', value: 4, group: 'partner' }),
    e('offer', 62), e('race', 63, { mode: 'replacement_drivers', expected: ['claimed', 'booking_taken'] })]),
  recipe('foreign-booking-reservation', [...assign, e('driver_cancel', 62), e('offer', 62), e('foreign_hold', 63),
    e('accept', 64, { driver: 'partner', expectError: 'DEPOSIT_OWNER_CONFLICT', expected: 'DEPOSIT_OWNER_CONFLICT' })]),
  recipe('completion-customer-cancellation-race', [...assign, e('ride', 62, { to: 'reached' }), e('ride', 63, { to: 'started' }),
    e('race', 64, { mode: 'completion_cancel', expected: [true, false] })]),
  recipe('confirmation-transaction-crash', [e('confirmation_fault', 0, { enabled: true }), e('capture', 0, { expected: 500 }),
    e('restart', 1), e('confirmation_fault', 1, { enabled: false }), e('capture', 1, { expected: 200 }), e('capture', 1, { expected: 200 })]),
  recipe('preexisting-compensation-cancellation', [...assign, e('ride', 62, { to: 'reached' }), e('customer_cancel', 63)], { compensation: true }),
  recipe('preexisting-compensation-completion', [...assign, ...complete('rcs'), e('cash', 66)], { compensation: true }),
]

export const phase9ObservedReplayRecipes = [
  ...[ ['stale', { ageMs: 120_000 }], ['unknown-time', { unknownTime: true }], ['inaccurate', { accuracy: 150 }],
    ['missing', { missing: true }], ['fresh', {}] ].map(([name, gps]) => recipe(`gps-${name}-rider-cancellation`,
      [...assign, e('gps', 62, gps), e('customer_cancel', 62), ...shadow])),
  recipe('stale-arrival-actions', [...assign, e('ride', 62, { to: 'reached', ageMs: 30_001, expected: 'LOCATION_REQUIRED' }),
    e('ride', 62, { to: 'reached', accuracy: 101, expected: 'LOCATION_REQUIRED' }),
    e('ride', 62, { to: 'reached', expected: true }), e('customer_cancel', 63), ...shadow]),
  recipe('offline-and-failed-notification', [...assign, e('online', 62, { value: false }),
    e('notification', 62, { failed: true }), e('gps', 62, { missing: true }), e('driver_cancel', 63), ...shadow]),
  recipe('traffic-worsens-after-acceptance', [...assign, e('gps', 62), e('route', 62, { seconds: 360 }),
    e('route', 64, { seconds: 1800 }), e('commitment', 65, { scheduledAt: at(125) }),
    e('driver_cancel', 66), ...shadow]),
  recipe('ten-minute-late-recovery-and-replacement', [...assign, e('snapshot', 129, { name: 'late' }),
    e('recovery', 129, { expected: false }), e('recovery', 130, { expected: true }), e('recovery', 130, { expected: false }),
    e('gps', 131, { driver: 'partner' }), e('redispatch', 131, { expected: 'offered' }),
    e('accept', 131, { driver: 'partner', expected: 'claimed' }), e('customer_cancel', 132),
    e('refund', 133), e('refund_callback', 134), e('forbid', 135), e('shadow', 135)]),
  recipe('late-assignment-route-at-acceptance', [capture, e('offer', 61), e('gps', 121),
    e('accept', 121, { expected: 'claimed' }), e('driver_cancel', 122), e('forbid', 123), e('shadow', 123)]),
  recipe('delivery-after-cancellation', [...assign, e('notification', 62), e('customer_cancel', 63),
    e('delivery', 64, { status: 'read', observedAt: at(62) }), e('delivery', 65, { status: 'sent', expected: false }), ...shadow]),
  recipe('exhausted-observed-capacity', [...assign, e('driver_cancel', 62), e('offer', 62), e('capacity', 62, { driver: 'partner', value: 0 }),
    e('accept', 63, { driver: 'partner', expected: 'no_room' }), e('offer', 130), e('forbid', 131), e('shadow', 131)]),
  recipe('completion-driver-cancellation-race', [...assign, e('ride', 62, { to: 'reached' }), e('ride', 63, { to: 'started' }),
    e('race', 64, { mode: 'completion_driver_cancel', expected: [true, null] })]),
]

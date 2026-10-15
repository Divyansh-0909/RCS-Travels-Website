# Phase 2 mutation sign-off

The completed broad run (`coverage/phase2-5-mutation.json`) generated 890
mutants: 678 killed, 211 survived, and one timed out. Its production files have
not changed since that run. A later payment run generated 461 mutants: 398
killed, 57 survived, and six timed out. These reports overlap, so their counts
must not be added together.

The focused reports under `coverage/` retested every recorded survivor and
timeout. Matching uses file, source start/end, mutator, and replacement; the
same line alone is insufficient. Of the broad run's 211 survivors, 203 were
killed by later focused runs and eight are equivalent for valid inputs. All
seven recorded timeouts were killed by focused tests, including the injected
database and captured-payment effect boundaries. The provider-fake report
(`phase2-mutation.json`) independently killed all 313 of its mutants.

The eight remaining equivalent mutants are:

| Source | Mutation | Why application behavior is unchanged |
| --- | --- | --- |
| `services/payments.js:70` | Optional `getTime` call becomes a direct call | Prisma's nullable DateTime is either `Date` or `null`; both forms handle `null`, and `Date` always has `getTime`. |
| `services/payments.js:116` | Reconciliation catch returns `undefined` instead of `null` | The result is only tested for truthiness before error handling. |
| `services/payments.js:201` | Refund lookup catch returns `undefined` instead of `null` | The result is only tested for truthiness before rethrowing the provider error. |
| `services/payments.js:206` | The outer refund lookup method check becomes `true` | `findExisting()` repeats the same method check and returns `null` if it is absent. |
| `services/payments.js:218` | Synthesized provider status `pending` becomes empty | Neither is `processed` or `failed`; `applyRefundProviderState` records `provider_identified` for both. |
| `services/payments.js:219` | Synthesized refund notes become empty | The provider request already carried the notes; `applyRefundProviderState` does not read notes from the returned object. |
| `services/payments.js:250` | The refund-pending status check becomes `true` | Full refunds pass a normalized `refund_pending` payment. Partial scheduled and debt refunds pass `captured`; on definite failure, adding `captured` to an already captured payment does not change state. Unknown outcomes still skip the restoration. |
| `services/providerReconciliation.js:6` | Optional entity access becomes direct | Each caller first matches a required field on the entity; a null entity fails that guard before `notesMatch` is called. |

The focused reports `phase2-payments-gaps-mutation.json`,
`phase2-payment-errors-mutation.json`, `phase2-payment-debt-mutation.json`,
`phase2-signoff-mutation.json`, `phase2-payout-db-boundary-mutation.json`, and
`phase2-payment-effect-boundary-mutation.json` preserve the executable evidence.
The large broad rerun was stopped after approximately 30 minutes without a
report; this sign-off uses the completed broad report plus the focused reports,
not a claim that a new monolithic run passed.

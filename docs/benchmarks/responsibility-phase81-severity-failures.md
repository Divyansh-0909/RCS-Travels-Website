# Responsibility Phase 8.1 — four Jev severity failures

Development-only diagnostic. No model output is ground truth; the deterministic gate and production analyst were not tuned.

| Case | Type | Truth | Jev | Score | P(LOW/MODERATE/HIGH) | Gate |
|---|---|---|---|---|---|---|
| failed_pickup-ordinary_driver_evidence | FAILED_PICKUP | DRIVER_CAUSED/LEVEL_1 | DRIVER_CAUSED/HIGH | 1.56 | 0.04/0.36/0.6 | NEEDS_ADMIN_REVIEW |
| failed_pickup-available_driver_unresponsive | FAILED_PICKUP | DRIVER_CAUSED/LEVEL_1 | DRIVER_CAUSED/HIGH | 1.6 | 0.04/0.33/0.63 | NEEDS_ADMIN_REVIEW |
| driver_late-ordinary_driver_evidence | DRIVER_LATE | DRIVER_CAUSED/LEVEL_1 | DRIVER_CAUSED/HIGH | 1.51 | 0.09/0.3/0.61 | NEEDS_ADMIN_REVIEW |
| driver_late-available_driver_unresponsive | DRIVER_LATE | DRIVER_CAUSED/LEVEL_1 | DRIVER_CAUSED/HIGH | 1.55 | 0.07/0.3/0.63 | NEEDS_ADMIN_REVIEW |

The ordered score rubric names LOW/MODERATE/HIGH but supplies no frozen Level 2 criteria. SDK index mapping and midpoint cutoffs were applied correctly; their calibration is unproven. Every failing bundle contains ordinary avoidable driver_action and baseline present:true evidence. None supplies repeated refusal, deliberate unavailability, conflicting commitments or abandonment. The available_driver_unresponsive scenario name is outside the model input and does not add unresponsiveness evidence.

The four raw false Level 2 predictions are genuine errors against frozen synthetic labels. Prompt wording/criteria and sparse synthetic evidence context are defects in the evaluation design; this observational run cannot isolate which factor caused the model errors. No observed adapter mapping bug. The severity allowlist routed all four to review. Independent tests now verify that responsibility, sufficiency, human-review and contradiction checks each block adverse automation even under a test-only policy permitting HIGH.

Full supplied timeline values and documented raw score/probability fields are preserved in output/phase81/jev-four-severity-failures.json. No production consequence or finalization was invoked.

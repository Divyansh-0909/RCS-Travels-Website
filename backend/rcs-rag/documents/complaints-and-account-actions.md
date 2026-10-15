---
document_id: complaints-and-account-actions
audience: rider-and-captain
status: operational-reference-with-pending-launch-policy
verified_on: 2026-10-10
sources:
  - backend/services/complaints.js
  - backend/services/driverCancellations.js
  - backend/routes/bookings.js
  - frontend/src/constants/legal.js
  - CONTEXT.md
  - docs/benchmarks/phase9-financial-lifecycle-checkpoint-2026-10-09.md
---
# Complaints, responsibility review, and account actions

## Customer complaint reporting

Customer conduct feedback uses structured categories such as extra money, pressure to cancel, dangerous driving, wrong vehicle, identity mismatch, inappropriate conduct, and drop-off problems. The supported booking complaint flow uses one complaint row per booking, which may be updated. Use support for additional context or an urgent safety issue.

## Complaint financial and conduct consequences

The current complaint summary marks review required and consequence applied as false. A factual report is not authorization for a fine, strike, account block, refund, or compensation. Do not promise an immediate automatic ₹200 fine or suspension based on historical complaint-count text.

## Captain cancellation incident review

Captain cancellation records include the reason and create a responsibility case requiring admin review. Recorded evidence and an advisory recommendation are distinct from a reviewed final decision. A cancellation count alone does not prove unjustified conduct.

## Pending launch conduct-strike policy

**Pending launch policy:** the owner-selected model is 5 upheld conduct strikes for a 7-day temporary block and 7 upheld strikes for an indefinite admin-removable block. It is not established as an active automatic outcome by current incident collectors. Do not present the historical 3-record/3-day policy or the selected 5-upheld/7-day model as a guaranteed current account action. Moderation, authority, and applicable launch controls require reconciliation.

## Responsibility analysis and human authority

The current checkpoint keeps production shadow, automatic adjudication, and production consequences off. An AI classification or confidence score is not monetary or conduct authorization. Unsupported failed-pickup, late-arrival, offline, replacement-failure, and liability paths must remain unresolved or manual until approved.

## Disputes and existing restrictions

Raise disputed deductions, reports, eligibility restrictions, or suspensions with support and provide the booking reference and relevant evidence. Existing restrictions can affect access or offers; a FAQ cannot determine whether a particular account is restricted. Formal notice, appeal timelines, and final deactivation rules remain draft terms requiring approval.

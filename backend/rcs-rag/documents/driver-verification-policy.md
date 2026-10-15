---
document_id: driver-verification-policy
audience: captain
status: operational-reference
verified_on: 2026-10-10
sources:
  - backend/constants/driverDocuments.js
  - backend/services/driverDocuments.js
  - backend/routes/driver.ts
  - docs/compliance/rcs-policy-code-audit.md
---
# Captain and vehicle verification policy

## Required captain documents

The configured required captain-owned documents are a profile photo and driving licence. Captain-owned documents follow the person across vehicles. The profile photo has no expiry field; the licence does.

## Required vehicle documents

Each vehicle has its own registration certificate, insurance, road tax, fitness certificate, and All India permit. These configured required documents have expiry dates. Documents for one vehicle do not automatically approve another vehicle.

## Conditional and optional vehicle documents

The configuration also supports a one-year permit, CNG cylinder test, and front/back vehicle photos. Their absence does not universally block onboarding through the configured required list. Applicable legal documentation for the actual vehicle must still be reviewed. A CNG document is relevant to a CNG vehicle, not every car. The current required list does not include a separate PUC or police-verification document type; do not invent an upload requirement from older draft text.

## Upload, scan, and approval

Submit documents through the supported application flow. Upload and technical file scanning do not mean approval or prove issuer authenticity. Required documents must pass the application's review process. Incorrect, rejected, missing, or expired documents may require correction or renewal before eligibility is restored.

## Renewal and multiple vehicles

Keep documents and expiry dates accurate. Use the supported renewal and review flow for replacements. Maintain vehicle-specific records for each car and select the correct eligible active vehicle. The presence of an old approved upload does not justify treating an expired document as current.

## Pending verification guarantees

**Pending:** no universal approval turnaround, automated government-issuer verification, background-check certification, induction completion, or insurance-cover guarantee is established here. Legal review may require additional eligibility controls before launch. For an individual approval status, use the authenticated document screen or support.

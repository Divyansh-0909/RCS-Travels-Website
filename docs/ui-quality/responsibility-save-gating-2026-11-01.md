# Responsibility review - save eligibility

1 November 2026 IST. Save decision and Save appeal decision remain disabled until the existing validation considers every required field valid: Decision, Cause of the issue, Action level when holding the driver responsible, and a trimmed reason of 3-2,000 characters. Clearing a required field or changing Decision disables saving again. The button also remains disabled during a save.

The change reuses the form's existing invalid-field flags. Submission validation, payloads and backend behavior are unchanged. Six browser scenarios pass across Chromium, Firefox and WebKit, including light/dark phone and desktop review forms and appeal forms. Checks cover empty/partial drafts, whitespace and short reasons, required action levels, dependent-choice resets, busy/double-submit prevention and retry after a synthetic rejected save. Screenshots of disabled/enabled states were inspected; the website build passes. Rejected responses were simulated in the browser; no live backend save is claimed.

Evidence: `output/handoff/responsibility-save-gating-2026-11-01/verification.json`.

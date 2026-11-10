# Responsibility review - compact information summaries

1 November 2026 IST. The Evidence, AI assessment and Decisions summaries retain the approved layout, colors, type scale and detail popups while grouping information into shorter status rows and badges.

- Timeline previews replace the actor label/value box with a **By Synthetic captain** style badge. Short narrative fields such as a reported reason appear as a paragraph. Other structured fields retain their existing renderer, and longer preview text can still be read in full in the record popup.
- Missing and unavailable information appear as distinct badges. Conflict and history counts no longer repeat the same information in a second sentence. Rows with no additional detail are plain status rows rather than empty dropdowns.
- AI suggestions and service-rule results retain separate labels. The information-check result remains distinct from completeness, with the warning that passing checks does not confirm every statement.
- Decision outcomes sit beside their stage, followed by the saved reason and time. A classification without a saved outcome is explicitly labelled **Assessment**, and an absent final decision remains **Not recorded**. Appeal status and the appeal-period state are grouped without repeated empty-state sentences.

Full-record composition is unchanged. All ten raw record groups retain their original JSON, free text and metadata. This is a presentation change; review policy, API payloads, form eligibility and stored records are unchanged.

Validation: website build and **100 frontend tests PASS**, including four new summary tests. **Twelve browser/viewport/theme configurations** cover Chromium at 320, 390, 768 and 1440px in both themes, with Firefox and WebKit phone/desktop checks. Four accessibility audits report zero violations; no runtime errors. Actor badges, collapse/reopen state, empty static rows, long names, nested fields, missing/unavailable records, contradictory completeness flags, legacy AI isolation and 200% text were checked. All **40 raw JSON comparisons** across ten record groups and four configurations pass. Browser-only synthetic responses were used for record variants; no live save was submitted.

The selected desktop synthetic case's summary row measures **602px**, down from **790px**, with the same initial timeline expansion. This observation applies to that fixture, not every possible record. Both themes and phone/desktop screenshots were visually inspected.

Evidence and source hashes: `output/handoff/responsibility-compact-summaries-2026-11-01/verification.json`.

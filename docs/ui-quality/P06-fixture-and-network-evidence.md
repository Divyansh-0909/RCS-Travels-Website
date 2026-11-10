# P06 — Approved-fix fixture and network proof

24 October 2026 IST. **STATUS: OUTPUT_READY — four explicitly approved P06 fixes VERIFIED in the local synthetic renderer.** Broader booking QA remains incomplete. Owner aesthetic acceptance is separate from technical verification.

The existing loopback-only preview and in-memory place/estimate fixture remain the test boundary. POST /api/fare/estimate is explicitly read-only and returns constant sample fares plus P06_SYNTHETIC_NOT_VALID_FOR_BOOKING. Every other mutating API is denied; current booking, payment and account DELETE probes returned HTTP409/P06_SYNTHETIC_READ_ONLY. No Book ride UI action occurred. Browser request projections contain only synthetic inputs; no authorization headers/cookies/tokens are published.

The new /p06-compare endpoint maps only four explicit IDs and before/after PNG filenames inside the owned run directory. It rejects unknown IDs, traversal, an unrelated run root, non-GET methods and external Host headers. Its HTTP test and eight actual-image browser checks pass. It cannot expose arbitrary local files.

Original raw browser trace archives remain private; the prior allowlisted trace projection remains historical audit evidence. No new unredacted trace was uploaded. New browser interaction/network proof is in the regression, focus, controls, matrix and viewer JSON files.

Retained harness attempts: the first vehicle test incorrectly anchored the accessible name ahead of the image alt text; the fixture control read coordinates before asynchronous details settled; the first corrected replay checked aria-pressed before React committed. Selectors/waits were corrected, the same actual outcomes passed, and the earlier failure JSON files remain in the new evidence set. An initial strict Git whitespace check treated Windows CRLF as trailing whitespace; the scoped CRLF-aware check passes without rewriting unrelated owner files. The raw timing contrast observation and clean settled follow-up are both retained.

Testing used only loopback synthetic places, constant sample prices and an unusable quote. No Maps/provider/GPS, real quote, customer/account mutation, booking creation, checkout, payment, dispatch or notification was exercised. No backend/native source was changed or deployed. No spoken screen-reader/mobile-OS-keyboard acceptance, complete contrast pass, full role journey or untested child-state acceptance is claimed. W.BOOKING remains NOT_REVIEWED / NOT_RUN. Home/Outstation KEEP CURRENT and the earlier bounded P04 native acceptance are preserved. No commit, push, merge or P07.

Historical fixture contract and controls: [23 October baseline P06-fixture-and-network-evidence.md](https://drive.google.com/file/d/1vpvT1R4pshSdZA6nEpPvZ9DBfTPpiTCO/view?usp=drivesdk).


Visual QA caught an off-screen iframe painting blank in a mobile full-page screenshot after the evidence accordion scrolled the page. The actual frame DOM/replay was valid. Capture tooling now restores the top viewport and waits for repaint before recording; the eight viewer captures were regenerated and visually inspected. The supplementary offscreen-iframe PNG is a corrected reference capture, not the original white observation. That observation is recorded here and in the conversation; it was a developer screenshot issue, not a product UI change.


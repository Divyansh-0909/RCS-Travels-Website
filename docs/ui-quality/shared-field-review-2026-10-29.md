# Shared field styling — owner review

29 October2026 IST. The owner postponed the shared WebSocket channel. Issue01 stays FAIL/OWNER_DEFERRED; no polling or socket implementation changed.02A/03A/04A remain verified.

Later owner decision: the whole Responsibility page now has an explicitly authorized [shadcn redesign](responsibility-redesign-2026-10-29.md). Use its full-page Light/Dark links for that review. The Responsibility screenshots in the compare gallery have been refreshed. The remaining Finance/Fare Item12 review holds are unchanged; the original preparation observations below remain historical.

[Open all current field screenshots and live links](http://127.0.0.1:4317/?mode=website&review=VCB02&finding=12&width=390&theme=dark). Screenshots were captured from the current actual React pages in12 page/width/theme combinations. Use the bottom dock for theme and width; open a live page to interact. All data is synthetic and every API write is denied locally.

| Live page | What to review |
|---|---|
| [Responsibility review form](http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-review&fieldReview=review&theme=dark) | Choose Uphold, then inspect the classification and consequence dropdowns. Check placeholder/selected/disabled states, arrow alignment, focus border and the review-reason textarea's wrapping, padding and resize behavior. |
| [Captain finance](http://127.0.0.1:1575/dashboard?fieldReview=finance&theme=dark) | Type a positive or negative decimal amount, then try note/reference fields. Compare label spacing, text baseline, padding, normal/focused borders and alignment. Financial actions cannot be applied in this preview. |
| [Fare editor](http://127.0.0.1:1575/dashboard?fieldReview=fares&theme=dark) | Compare fare/toll number fields with the notes textarea. Check number-entry arrows, width, wrapping, spacing and focused appearance. Map tiles are unavailable in the isolated preview; the map is not part of this field review. |

Across all three: standard single-line fields use48px height,16px text,12px corners; textareas intentionally stay taller. Compare input fill/border/placeholder color within each supported theme and a single blue focus edge without a separated extra outline. The browser controls the opened native select menu. Review phone390 and desktop1440 from the dock, and both Light/Dark.

This is Item12's visual review, not a new implementation or automatic approval. Existing product sources are unchanged (304/304 recorded frontend/driver/shared inputs). No financial writes, production data, auth changes, deployment, commit, push or merge.

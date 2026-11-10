# Reviewer controls and walkthrough

25 October 2026 IST. Owner-requested follow-up to the [reviewer refresh](2026-10-25-preview-reviewer-refresh.md). The visual reference is the actual dropdown and black inspector in the sibling `graphicUI_clone` workbench. That repository was read only.

All reviewer selects now share dark menus, selected checkmarks, hover and keyboard focus states, and viewport-aware positioning. The website issue and coverage controls use the same inspector styling as Compare. Instructions are shorter; measurements and history remain under Details and Activity. Phone comparisons remain side by side; tablet and laptop comparisons remain stacked at their actual iframe viewport sizes.

The walkthrough found and corrected menus moving the page, iframe autofocus dismissing an open menu, wheel scrolling escaping the inspector, and a wrapping counter on narrow screens. Website previews now fit the available canvas while retaining their selected viewport; laptop content no longer disappears beyond a cropped frame. Menus support keyboard navigation, typeahead, touch, outside-click dismissal and Escape. A failed save keeps the draft and offers a clear retry message. Custom choices require a note, and pending saves cannot be submitted twice. Automated save checks intercepted the request; they did not record an owner choice.

Validation covers all reviewer modes: all three comparison families, all nine website issues, Home and Outstation, coverage search and all filters, four additional safe website surfaces, unavailable states, and the Android browser status view. Screenshots cover mobile, desktop, short windows and touch landscape. This is a reviewer walkthrough, not a new audit of every product inventory entry. The Android stream was offline, so no fresh device interaction or native visual acceptance is claimed.

Evidence is retained in `output/handoff/reviewer-controls-2026-10-25/`:

- `walkthrough.json`: 14 browser test groups pass; earlier failed attempts remain in `attempts.json`.
- `tool-tests-final.txt`: 49 pass, zero failures, one skip.
- `comparison-axe.json`, `website-axe.json`, `native-status-axe.json`: no violations in the tested browser samples. Embedded product frames are outside the reviewer accessibility sample.
- `quality.json`: changed JavaScript syntax and scoped whitespace checks pass.
- Adjacent PNG files show menus, comparisons, each website issue, coverage, save states and offline Android status.

Concurrent work changed eight protected product inputs during this task. Those changes were preserved; this reviewer work edited no product source. Fourteen stale coverage source locators were refreshed against the current source, retaining all 351 inventory IDs and every audit, verification, implementation and owner-decision field. The before/after observations are in `source-observation.json` and `source-locator-refresh.json`. Earlier published audit evidence remains unchanged.

[Open the reviewer](http://127.0.0.1:4317/?view=consistency&width=390&theme=light).

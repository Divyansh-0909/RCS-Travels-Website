# P07 — live review board

29 October 2026 IST. **APPROVAL_REQUIRED. Audit complete within the stated fixture scope; product fixes NOT_CHANGED.**

Approved prompt: [handoff document](https://docs.google.com/document/d/1mfFSj9kbob7mAE5CuUW9aR1LBnoHjVS0vb6w91KvzJ8). [Drive evidence folder](https://drive.google.com/drive/folders/1qP4Ig18YTCtjqNGqbXWoSPbrEoTW30lz). Local raw evidence: `output/handoff/P07-2026-10-29/`. This is P07, separate from the earlier unnumbered consistency work.

[Open P07 live comparison board](http://127.0.0.1:4317/p07?issue=P07-B02-01&width=390). The existing loopback issue reviewer remains at http://127.0.0.1:4317/?mode=website&issue=P07-B02-01&width=390&theme=dark. The dedicated /p07 board contains all four findings, including the later enlarged-text issue; the already-running main queue contains the first three. No watcher, dispatch, choices POST or automatic implementation is running.

The inspector uses the existing Mori type/theme assets and black reference-panel treatment. Choose Phone for side-by-side comparison; tablet/laptop previews stack to preserve readable size. On a narrow host, the side-by-side preview rail scrolls horizontally without overflowing the document. Screenshots are evidence; the iframes are actual current React routes/components with synthetic data. Screens320/390/768/1440 are selectable. The broader audit includes360/1280 too.

## P07-B02-01

[Open Partial refund status stops refreshing](http://127.0.0.1:4317/p07?issue=P07-B02-01&width=390).

1. Open the partial-refund fixture
2. Wait 7 seconds: it still says Partial refund pending
3. Compare full refund pending, which updates after its next poll
4. Refresh payment status manually to observe the queued processed fixture

- A: include the already-supported partial pending state in the refresh predicate; retain backoff and stop on processed state.
- B: keep the current manual-refresh behavior and approve explicit copy for it.

## P07-B02-02

[Open Failed settlement confirmation has no visible feedback](http://127.0.0.1:4317/p07?issue=P07-B02-02&width=390).

1. Open completed ride
2. Click Pay with cash: the local fixture returns a denied request
3. Observe the temporary disabled state then unchanged payment choices
4. Compare the actual advance component in its failed state

- A: retain UPI/cash choices, add an announced failure and safe status refresh; approve final wording without claiming payment collection.
- B: adapt the existing failure-card presentation and give an explicit way back to method choices.

## P07-B02-03

[Open Recovered update notice leaves an invisible Tab stop](http://127.0.0.1:4317/p07?issue=P07-B02-03&width=390).

1. Open and wait for two 5-second poll cycles
2. The middle fixture read fails; the next succeeds
3. The notice disappears visually
4. Use Tab to reach its invisible Dismiss control; Locate marks its actual bounds

- A: preserve the exit animation, remove the hidden notice afterwards and restore focus if it held focus.
- B: retain mounting but remove hidden descendants from focus/accessibility while leaving visible notices usable.

## P07-B02-04

[Open Large text puts Contact support under the receipt](http://127.0.0.1:4317/p07?issue=P07-B02-04&width=1440).

1. Choose Laptop 1440px
2. The observed example applies 200% text; the reference uses normal text
3. In the completed ride, inspect Contact support in the left column
4. Its centre is covered by the receipt; the normal-text control remains usable

- A: constrain/wrap the existing support row without changing its copy or action.
- B: approve an adaptive stacked terminal layout at enlarged text sizes, preserving receipt and action order.

The actual/reference frames are not “before/after fixes”: all product sources are unchanged. For03, wait two poll cycles (~10s), then Tab; Locate in the existing reviewer can mark the real hidden bounds. For04, select Laptop1440; observed frame applies200% root text and reference uses normal text. A phone-width04 view is not the reproduced desktop condition. Restart both examples reloads synthetic read sequences only; it does not retry a real payment.

After reviewing, give exact issue IDs plus A/B in the chat, or explicitly defer an issue. Recommended choices are01A,02A,03A,04A. Those recommendations are not saved approvals. P07 safe-replay items4–5 explicitly require these exact future decisions before product edits. Item12 is not part of this request. No P08 starts automatically.

Runtime: final app http://127.0.0.1:1578, audit app1577 retained, reviewer4317 GET-only. Tools: node tools/ui-quality/p07/serve.mjs with P07_PREVIEW_PORT=1578, then node tools/ui-quality/p07/reviewer.mjs if not already listening. On Windows launch background processes hidden. Do not create duplicate listeners or run document watcher/dispatcher. Local links require this machine’s services; the Drive evidence is durable. Runtime PIDs and timestamps are snapshots, not an uptime guarantee.

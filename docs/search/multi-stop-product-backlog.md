# Future product workstream: multi-stop rides

Owner-requested planned feature (2026-10-06). Not implemented in Search S5/S6 and not assigned a phase number that conflicts with S6/S7. Base one-way rollout may proceed later if multi-stop requests remain visibly blocked and never flattened.

Today Search preserves STOP source clauses, ordering and candidate references with `PLANNED_PRODUCT_FEATURE`. Form resolution prevents unsupported submission. Interpretation/grounding of an endpoint never discards the requested intermediate pickup/stop. No promise of operational stop support is made.

Future scope:

| Area | Required design/implementation |
|---|---|
| Journey contract/persistence | Versioned ordered stops with stable stop IDs, grounded location references/Place IDs, dwell semantics, immutable booking journey snapshot, migration/backward compatibility for two-endpoint bookings. |
| Customer form/review | Add/remove/edit/reorder stops, explicit confirmation of all locations and order, clear pricing/ETA changes, maximum-stop policy decided separately. |
| Routing/fare | Route through every ordered stop, authoritative fare inputs/quotes and invalidation, distance/time/dwell and ETA impact, no endpoint-only quotation. |
| Scheduling/dispatch | Scheduled feasibility/commitment compatibility, dispatch journey representation and driver acceptance of the complete route. |
| Driver/lifecycle | Driver-facing stop instructions, arrival/completion sequence, edits after acceptance, failed intermediate pickup, cancellation/recovery behavior. |
| Payment/WhatsApp | Revised quote/payment authorization implications, clear confirmed stop itinerary in controlled notification templates, no invented fees or responsibility semantics. |
| Validation/testing | Stop grounding/order limits, duplicate locations, reordering/invalidation, fare/route parity, immediate/scheduled regression, cancellation and migration compatibility. |

Search contract changes will require a supported ordered-stop member in BookingDraft/session provenance, explicit grounding targets for stop IDs, structured condition/stop semantics in Luna output, readiness validation aware of backend capability version, benchmark labels and UI projections. Existing `unsupportedRequests` STOP entries remain audit evidence through migration; do not reinterpret historical one-way records as supporting stops.

Fare amounts, stop limits, dwell charges, post-acceptance edit rules and scheduling behavior are future product decisions. No such policies are invented here.

# Search routing owner decisions — 2026-11-02

The owner answered **“keep it simple for both”** after being shown the two routing decisions in the [offline alignment checkpoint](../benchmarks/search-v1-decision-contract-alignment-checkpoint-2026-11-02.md).

1. **R1 — RENTAL_ROUTING: SIMPLE.** Rental-only intent remains SIMPLE, including a four-hour car-rental request without endpoints. Preserve RENTAL as unsupported material semantics and require the existing form/review controls. SIMPLE does not make rentals bookable.
2. **R2 — VEHICLE_AVAILABILITY_ROUTING: SIMPLE.** A single preferred vehicle “if available,” including an exclusion of another class, remains SIMPLE when there is no branching journey or material conflict. Preserve the vehicle preference and exclusions. Availability is not confirmed, and existing material-preference review and submission restrictions remain.

These decisions supplement the [frozen owner form contract](search-owner-decisions-2026-10-06.md). They resolve the routing conflicts for development cases `hh-v1-added-007` (R1), `hh-v1-added-004` and `hh-v1-added-033` (R2). Their revised comparison complexity labels are SIMPLE under a new proposal identity. Other fields remain unchanged.

Original approved v4 labels, predictions and scores, and the earlier masked v5 proposal remain historical evidence. The decisions do not resolve separate Hindi extraction-binding limitations, expand unsupported booking capabilities, or authorize provider calls, a live comparison or rollout.

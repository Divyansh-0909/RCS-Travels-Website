# Search Benchmark V1 — frozen labels and split

Frozen under product-owner authorization `c52050c7-1861-4959-96e3-df23fd28feca` at **6 October 2026, 16:11:52 IST** (`2026-10-06T10:41:52.319Z`).

The [immutable snapshot](dataset.json) contains 320 approved core records: **222 development / 98 held-out**, with zero template-family leakage. Forty exploratory Hindi/Hinglish records remain outside scored V1 in the earlier approved overlay, with EXPLORATORY_UNSCORED status.

Dataset hash: `2c2a0d7099c4b65be9495d08d5049e72fb44b6d49f84b82c65dbaf643ca61296`.

Split hash: `aea66b52ac37ddea99d4bb1c2861d63c70c7e7a3e84f7946a9c0a1a5414ef5de`.

The earlier `51c6b04...` hash identifies the 360-record approved overlay, including exploratory records; it is preserved as `approvedOverlayHash`. It is not the scored-core hash. Schema, fixture, owner-policy and split-seed versions are recorded separately. Original 178 approved labels and all 19 approved family decisions remain intact.

This freeze does **not** establish execution-contract freeze, development benchmark success, held-out permission before objective gates, or rollout approval. The loader exposes development only and rejects changed hashes/splits. The freeze script uses exclusive creation and refuses to replace a different frozen snapshot.

The legacy `missingFields` label tracks absent concrete booking values. Explicit ANY and exclusion-only constraints may leave a concrete class unspecified while requiring **no user vehicle clarification**. Form-resolution requirements therefore remain distinct from the legacy field list; no positive requirement is invented.

Held-out inference remains NOT RUN. Customer rollout remains off.

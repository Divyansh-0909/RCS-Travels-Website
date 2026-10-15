# Owner policy overlay — not a frozen benchmark

This is the current review proposal. The original `../proposed.json` and independent class certificate are immutable historical inputs, not newly regenerated ground truth from provider outputs.

The receipt approves exactly 178 original cases with their existing expected-label hashes. The approval status is `APPROVED_AS_SPEC_DERIVED_CLASS`. No approved label was changed. The other 21 policy-only cases have deterministic updated proposals; they are not falsely marked as members of that original approved class. Original/new truth and the owner policy ID are retained in `policy-change-audit.json`.

P2: nearest future stated month/day; understood dates outside >30-minute / ≤168-hour bounds remain understood but not bookable. P3: BARE nearest upcoming, THIS current calendar week, NEXT following calendar week; ambiguous same-day timing requires clarification. P4: default Asia/Kolkata, explicit recognized zones convert in application code and remain reviewable; ambiguous wording requires clarification. P5: generic SUV/XL exclusion covers suv and suv_premium, explicit regular/premium subtype exclusions stay specific.

The five omitted-year fixtures resolve to December 5, 2026 and are outside the supported scheduling window. Five London fixtures preserve their original source date/time expressions and use the runtime ICU zone database for their fixed October 2026 conversion, including IST midnight rollover. This fixture derivation is not a general DST resolver or a claim that the production temporal parser has been updated.

Five additional `vehicle-self-conflict` records also use frozen P5 context: the negative clause excludes both SUV classes, but the required/excluded conflict remains ambiguous. They are retained in the 121-case family review, with both clauses captured in `policy-context-still-review.json`. Their AMBIGUOUS vehicle labels were not silently turned into resolved exclusions. Thus 21 policy-only cases leave review; five other P5-context cases still require judgment.

Five next-Friday fixtures have approved qualifier meanings but retain unscored resolved dates: the existing application has no established calendar-week origin. No hidden ISO-Monday or locale-Sunday rule was inserted. All other original labels are retained.

Review **121 cases in 19 families** using [FAMILY_REVIEW.md](FAMILY_REVIEW.md). The 40 Hindi/Hinglish records remain exploratory and unscored. The proposed family-isolated split is still 222 development / 98 held-out; leakage is zero. Labels never enter provider requests. No dataset freeze or held-out evaluation is authorized yet.

Production policy integration remains an engineering follow-up: the existing temporal/vehicle parser still carries earlier policy-clarification behavior. It must be updated and verified against these owner decisions before claiming complete S5 system evaluation. No customer search behavior was changed by this review overlay.

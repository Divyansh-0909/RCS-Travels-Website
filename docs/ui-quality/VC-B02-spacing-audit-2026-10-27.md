# Auth and booking spacing — measured audit and proposal

27 October 2026 IST. Read-only review of the owner's request to verify login/signup and booking spacing using Apple design guidance. Product spacing is unchanged. Thirty actual rendered states were observed at 390×844, 768×1000 and 1440×1000 using synthetic local actors and API responses.

Apple's [Layout guidance](https://developer.apple.com/design/human-interface-guidelines/layout) supports alignment, clear grouping and layouts that adapt to available space and text size. Its [Text fields guidance](https://developer.apple.com/design/human-interface-guidelines/text-fields) recommends evenly spaced field stacks and organised widths. For this website, exact CSS pixel values remain RCS design choices. The repository's existing four-pixel rhythm is the appropriate basis for those choices.

Login and signup already match in their normal name/phone stages. The useful remaining review concerns the gaps used for particular relationships, their desktop variants, and spacing around feedback. These measurements use visible field/card borders and pill faces; text uses its CSS line box. They describe the rendered result, including margins and wrapper gaps.

| Relationship | 390px mobile | 768px / 1440px |
| --- | --- | --- |
| Auth heading → supporting copy, normal name/phone stages | 4px | 12px |
| Supporting copy → first auth field | 24px | 32px |
| Auth field → primary button, no error | 12px | 28px |
| Login field → validation message | 8px | 8px |
| Login validation message → primary button | 4px | 20px |
| Login primary button → consent copy | 16px | 24px |
| Signup phone primary button → Log in paragraph | 16px | 28px |
| Booking mode pill face → pickup field | 16px | 28px |
| Pickup field → drop field, route and home booking | 16px | 28px |
| Adjacent Hatchback/Sedan card borders | 16px | 16px |
| Ride options target → Book ride button | 20px | 20px |
| Pinned/inline booking caption → primary action | 12px | 24px |

The 28px auth field-to-button gap comes from the field wrapper's 8px bottom margin plus the button wrapper's 20px desktop top margin. The booking field stack similarly combines container gaps and field margins. These are good candidates for giving one layout owner responsibility for each gap.

Context matters when comparing larger distances. OTP boxes sit 56px above Submit because an expiry row occupies that region: 12px to the row, a 20px row, then 24px to Submit. The large route-field-to-button distance on a phone includes flexible page space and the pinned footer. Compare spacing inside that footer rather than forcing the button to sit directly below the address field. The timing wheel's internal layout also needs its own spacing treatment.

Proposed common defaults, pending a layout implementation decision:

| Relationship | Proposed RCS CSS spacing |
| --- | --- |
| Heading → supporting copy | 8px |
| Intro group → first field | 24px mobile / 32px larger layouts |
| Mode pills → first field; field → next field | 16px |
| Field → its hint or validation message | 8px |
| Completed field/helper/error group → primary action | 16px mobile / 24px larger layouts |
| Primary action → secondary/help copy | 16px mobile / 24px larger layouts |
| Independent content groups | 24px mobile / 32px larger layouts |
| Adjacent vehicle cards | Keep 16px |
| Ride options → Book ride | 16px outside the trigger; retain its existing size |

These values are a proposed RCS scale informed by Apple's principles. They are not Apple-mandated web pixel measurements. If implemented, use explicit layout gaps, retain the approved input/button sizing and single-border focus, preserve error presentation and button behaviour, and check narrow layouts, long text and enlarged text. Keep the booking action bar pinned and keep its safe-area padding.

Representative actual screenshots: [mobile login](../../output/handoff/VC-B02-spacing-audit-2026-10-27/login-390.png), [login with feedback](../../output/handoff/VC-B02-spacing-audit-2026-10-27/login-error-390.png), [tablet signup OTP](../../output/handoff/VC-B02-spacing-audit-2026-10-27/signup-otp-768.png), [desktop route](../../output/handoff/VC-B02-spacing-audit-2026-10-27/route-1440.png), [desktop timing](../../output/handoff/VC-B02-spacing-audit-2026-10-27/timing-1440.png), and [mobile vehicle selection](../../output/handoff/VC-B02-spacing-audit-2026-10-27/vehicles-390.png).

Evidence lives in `output/handoff/VC-B02-spacing-audit-2026-10-27/observations.json` and its screenshots. The initial observation pass is retained: the final pass waits for footer copy, measures the nearest visible secondary paragraph, and measures vehicle-card outer borders rather than their inset native buttons. All thirty final cases completed without a page error. Eleven product/design source files retain their starting hashes. No product code, review decisions, backend/native implementation or production data changed; no build was needed for this read-only audit. Scope is normal-size English UI with Light preference and the booking pages' existing theme policy; enlarged text and translated layouts remain implementation-time checks.

# test-matrix

AUTHOR: CODEX
PHASE: P01
DATE: 21 October 2026 (Asia/Kolkata)
EVIDENCE SNAPSHOT: 2026-10-21T07:44:01.430Z
GIT BASE: 2ff51e7d9dade932cd21dfe5d836488d4b9a700a

Passing controlled pilot: 3 meaningful tests × 5 widths × 2 themes = 30. The tests verify notification keyboard/focus/request/reload behavior + axe/responsiveness, loading/error rollback, and real theme selection/persistence. Before/after capture pairs separately cover 390/1440px. Storybook switch interaction and axe ran in both themes. Frontend build and 68 existing tests passed. No screenshot alone is treated as functional verification.

Baseline/backend/native/cloud limitations are documented in P01-execution-report.md. Native verification: FAILED: Isolated native startup/journey verification — accept-failure-and-retry Maestro exit 1 — failed assertion: "Controlled acceptance outage. Please retry." is visible. Evidence: P01-native-verification.json. USB keep-awake remains enabled at the owner’s request. Unlisted native routes, per-screen light/dark policies, maps/gestures/keyboards and iOS remain NOT RUN; Android preflight alone is not a flow pass. Unlisted real backend booking/payment/dispatch/admin-action journeys remain NOT RUN. Chromatic cloud is NOT RUN without its project token.

Every website registry route/variant is included below. CAPTURED_NOT_APPROVED only proves rendering/capture, with the stated axe result; it is not a journey pass. Unknown/missing cells remain NOT RUN. Legacy routes ignore a light account preference by design.

| Route / variant | Preference | Width | Verdict |
|---|---|---|---|
| / | light | 360 | NOT RUN |
| / | dark | 360 | NOT RUN |
| / | light | 390 | NOT RUN |
| / | dark | 390 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| / | light | 768 | NOT RUN |
| / | dark | 768 | NOT RUN |
| / | light | 1280 | NOT RUN |
| / | dark | 1280 | NOT RUN |
| / | light | 1440 | NOT RUN |
| / | dark | 1440 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| /login | light | 360 | NOT RUN |
| /login | dark | 360 | NOT RUN |
| /login | light | 390 | NOT RUN |
| /login | dark | 390 | NOT RUN |
| /login | light | 768 | NOT RUN |
| /login | dark | 768 | NOT RUN |
| /login | light | 1280 | NOT RUN |
| /login | dark | 1280 | NOT RUN |
| /login | light | 1440 | NOT RUN |
| /login | dark | 1440 | NOT RUN |
| /signup | light | 360 | NOT RUN |
| /signup | dark | 360 | NOT RUN |
| /signup | light | 390 | NOT RUN |
| /signup | dark | 390 | NOT RUN |
| /signup | light | 768 | NOT RUN |
| /signup | dark | 768 | NOT RUN |
| /signup | light | 1280 | NOT RUN |
| /signup | dark | 1280 | NOT RUN |
| /signup | light | 1440 | NOT RUN |
| /signup | dark | 1440 | NOT RUN |
| /book | light | 360 | NOT RUN |
| /book | dark | 360 | NOT RUN |
| /book | light | 390 | NOT RUN |
| /book | dark | 390 | NOT RUN |
| /book | light | 768 | NOT RUN |
| /book | dark | 768 | NOT RUN |
| /book | light | 1280 | NOT RUN |
| /book | dark | 1280 | NOT RUN |
| /book | light | 1440 | NOT RUN |
| /book | dark | 1440 | NOT RUN |
| /booking/:id | light | 360 | NOT RUN |
| /booking/:id | dark | 360 | NOT RUN |
| /booking/:id | light | 390 | NOT RUN |
| /booking/:id | dark | 390 | NOT RUN |
| /booking/:id | light | 768 | NOT RUN |
| /booking/:id | dark | 768 | NOT RUN |
| /booking/:id | light | 1280 | NOT RUN |
| /booking/:id | dark | 1280 | NOT RUN |
| /booking/:id | light | 1440 | NOT RUN |
| /booking/:id | dark | 1440 | NOT RUN |
| /t/:token | light | 360 | NOT RUN |
| /t/:token | dark | 360 | NOT RUN |
| /t/:token | light | 390 | NOT RUN |
| /t/:token | dark | 390 | NOT RUN |
| /t/:token | light | 768 | NOT RUN |
| /t/:token | dark | 768 | NOT RUN |
| /t/:token | light | 1280 | NOT RUN |
| /t/:token | dark | 1280 | NOT RUN |
| /t/:token | light | 1440 | NOT RUN |
| /t/:token | dark | 1440 | NOT RUN |
| /captains/rides/:id | light | 360 | NOT RUN |
| /captains/rides/:id | dark | 360 | NOT RUN |
| /captains/rides/:id | light | 390 | NOT RUN |
| /captains/rides/:id | dark | 390 | NOT RUN |
| /captains/rides/:id | light | 768 | NOT RUN |
| /captains/rides/:id | dark | 768 | NOT RUN |
| /captains/rides/:id | light | 1280 | NOT RUN |
| /captains/rides/:id | dark | 1280 | NOT RUN |
| /captains/rides/:id | light | 1440 | NOT RUN |
| /captains/rides/:id | dark | 1440 | NOT RUN |
| /captains/delete-account | light | 360 | NOT RUN |
| /captains/delete-account | dark | 360 | NOT RUN |
| /captains/delete-account | light | 390 | NOT RUN |
| /captains/delete-account | dark | 390 | NOT RUN |
| /captains/delete-account | light | 768 | NOT RUN |
| /captains/delete-account | dark | 768 | NOT RUN |
| /captains/delete-account | light | 1280 | NOT RUN |
| /captains/delete-account | dark | 1280 | NOT RUN |
| /captains/delete-account | light | 1440 | NOT RUN |
| /captains/delete-account | dark | 1440 | NOT RUN |
| /manage-account | light | 360 | NOT RUN |
| /manage-account | dark | 360 | NOT RUN |
| /manage-account | light | 390 | NOT RUN |
| /manage-account | dark | 390 | NOT RUN |
| /manage-account | light | 768 | NOT RUN |
| /manage-account | dark | 768 | NOT RUN |
| /manage-account | light | 1280 | NOT RUN |
| /manage-account | dark | 1280 | NOT RUN |
| /manage-account | light | 1440 | NOT RUN |
| /manage-account | dark | 1440 | NOT RUN |
| /settings | light | 360 | NOT RUN |
| /settings | dark | 360 | NOT RUN |
| /settings | light | 390 | NOT RUN |
| /settings | dark | 390 | NOT RUN |
| /settings | light | 768 | NOT RUN |
| /settings | dark | 768 | NOT RUN |
| /settings | light | 1280 | NOT RUN |
| /settings | dark | 1280 | NOT RUN |
| /settings | light | 1440 | NOT RUN |
| /settings | dark | 1440 | NOT RUN |
| /help | light | 360 | NOT RUN |
| /help | dark | 360 | NOT RUN |
| /help | light | 390 | NOT RUN |
| /help | dark | 390 | NOT RUN |
| /help | light | 768 | NOT RUN |
| /help | dark | 768 | NOT RUN |
| /help | light | 1280 | NOT RUN |
| /help | dark | 1280 | NOT RUN |
| /help | light | 1440 | NOT RUN |
| /help | dark | 1440 | NOT RUN |
| /outstation | light | 360 | NOT RUN |
| /outstation | dark | 360 | NOT RUN |
| /outstation | light | 390 | NOT RUN |
| /outstation | dark | 390 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| /outstation | light | 768 | NOT RUN |
| /outstation | dark | 768 | NOT RUN |
| /outstation | light | 1280 | NOT RUN |
| /outstation | dark | 1280 | NOT RUN |
| /outstation | light | 1440 | NOT RUN |
| /outstation | dark | 1440 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| /safety | light | 360 | NOT RUN |
| /safety | dark | 360 | NOT RUN |
| /safety | light | 390 | NOT RUN |
| /safety | dark | 390 | NOT RUN |
| /safety | light | 768 | NOT RUN |
| /safety | dark | 768 | NOT RUN |
| /safety | light | 1280 | NOT RUN |
| /safety | dark | 1280 | NOT RUN |
| /safety | light | 1440 | NOT RUN |
| /safety | dark | 1440 | NOT RUN |
| /dashboard | light | 360 | NOT RUN |
| /dashboard | dark | 360 | NOT RUN |
| /dashboard | light | 390 | NOT RUN |
| /dashboard | dark | 390 | NOT RUN |
| /dashboard | light | 768 | NOT RUN |
| /dashboard | dark | 768 | NOT RUN |
| /dashboard | light | 1280 | NOT RUN |
| /dashboard | dark | 1280 | NOT RUN |
| /dashboard | light | 1440 | NOT RUN |
| /dashboard | dark | 1440 | NOT RUN |
| /dashboard/responsibility | light | 360 | NOT RUN |
| /dashboard/responsibility | dark | 360 | NOT RUN |
| /dashboard/responsibility | light | 390 | NOT RUN |
| /dashboard/responsibility | dark | 390 | NOT RUN |
| /dashboard/responsibility | light | 768 | NOT RUN |
| /dashboard/responsibility | dark | 768 | NOT RUN |
| /dashboard/responsibility | light | 1280 | NOT RUN |
| /dashboard/responsibility | dark | 1280 | NOT RUN |
| /dashboard/responsibility | light | 1440 | NOT RUN |
| /dashboard/responsibility | dark | 1440 | NOT RUN |
| /dev | light | 360 | NOT RUN |
| /dev | dark | 360 | NOT RUN |
| /dev | light | 390 | NOT RUN |
| /dev | dark | 390 | NOT RUN |
| /dev | light | 768 | NOT RUN |
| /dev | dark | 768 | NOT RUN |
| /dev | light | 1280 | NOT RUN |
| /dev | dark | 1280 | NOT RUN |
| /dev | light | 1440 | NOT RUN |
| /dev | dark | 1440 | NOT RUN |
| /dev/:view | light | 360 | NOT RUN |
| /dev/:view | dark | 360 | NOT RUN |
| /dev/:view | light | 390 | NOT RUN |
| /dev/:view | dark | 390 | NOT RUN |
| /dev/:view | light | 768 | NOT RUN |
| /dev/:view | dark | 768 | NOT RUN |
| /dev/:view | light | 1280 | NOT RUN |
| /dev/:view | dark | 1280 | NOT RUN |
| /dev/:view | light | 1440 | NOT RUN |
| /dev/:view | dark | 1440 | NOT RUN |
| * | light | 360 | NOT RUN |
| * | dark | 360 | NOT RUN |
| * | light | 390 | NOT RUN |
| * | dark | 390 | NOT RUN |
| * | light | 768 | NOT RUN |
| * | dark | 768 | NOT RUN |
| * | light | 1280 | NOT RUN |
| * | dark | 1280 | NOT RUN |
| * | light | 1440 | NOT RUN |
| * | dark | 1440 | NOT RUN |
| /terms | light | 360 | NOT RUN |
| /terms | dark | 360 | NOT RUN |
| /terms | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /terms | dark | 390 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| /terms | light | 768 | NOT RUN |
| /terms | dark | 768 | NOT RUN |
| /terms | light | 1280 | NOT RUN |
| /terms | dark | 1280 | NOT RUN |
| /terms | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /terms | dark | 1440 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| /privacy | light | 360 | NOT RUN |
| /privacy | dark | 360 | NOT RUN |
| /privacy | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /privacy | dark | 390 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| /privacy | light | 768 | NOT RUN |
| /privacy | dark | 768 | NOT RUN |
| /privacy | light | 1280 | NOT RUN |
| /privacy | dark | 1280 | NOT RUN |
| /privacy | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /privacy | dark | 1440 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| /refunds | light | 360 | NOT RUN |
| /refunds | dark | 360 | NOT RUN |
| /refunds | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /refunds | dark | 390 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| /refunds | light | 768 | NOT RUN |
| /refunds | dark | 768 | NOT RUN |
| /refunds | light | 1280 | NOT RUN |
| /refunds | dark | 1280 | NOT RUN |
| /refunds | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /refunds | dark | 1440 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| /grievance | light | 360 | NOT RUN |
| /grievance | dark | 360 | NOT RUN |
| /grievance | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /grievance | dark | 390 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| /grievance | light | 768 | NOT RUN |
| /grievance | dark | 768 | NOT RUN |
| /grievance | light | 1280 | NOT RUN |
| /grievance | dark | 1280 | NOT RUN |
| /grievance | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /grievance | dark | 1440 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| /driver-terms | light | 360 | NOT RUN |
| /driver-terms | dark | 360 | NOT RUN |
| /driver-terms | light | 390 | NOT RUN |
| /driver-terms | dark | 390 | NOT RUN |
| /driver-terms | light | 768 | NOT RUN |
| /driver-terms | dark | 768 | NOT RUN |
| /driver-terms | light | 1280 | NOT RUN |
| /driver-terms | dark | 1280 | NOT RUN |
| /driver-terms | light | 1440 | NOT RUN |
| /driver-terms | dark | 1440 | NOT RUN |
| /driver-privacy | light | 360 | NOT RUN |
| /driver-privacy | dark | 360 | NOT RUN |
| /driver-privacy | light | 390 | NOT RUN |
| /driver-privacy | dark | 390 | NOT RUN |
| /driver-privacy | light | 768 | NOT RUN |
| /driver-privacy | dark | 768 | NOT RUN |
| /driver-privacy | light | 1280 | NOT RUN |
| /driver-privacy | dark | 1280 | NOT RUN |
| /driver-privacy | light | 1440 | NOT RUN |
| /driver-privacy | dark | 1440 | NOT RUN |
| /driver-payments | light | 360 | NOT RUN |
| /driver-payments | dark | 360 | NOT RUN |
| /driver-payments | light | 390 | NOT RUN |
| /driver-payments | dark | 390 | NOT RUN |
| /driver-payments | light | 768 | NOT RUN |
| /driver-payments | dark | 768 | NOT RUN |
| /driver-payments | light | 1280 | NOT RUN |
| /driver-payments | dark | 1280 | NOT RUN |
| /driver-payments | light | 1440 | NOT RUN |
| /driver-payments | dark | 1440 | NOT RUN |
| /driver-grievance | light | 360 | NOT RUN |
| /driver-grievance | dark | 360 | NOT RUN |
| /driver-grievance | light | 390 | NOT RUN |
| /driver-grievance | dark | 390 | NOT RUN |
| /driver-grievance | light | 768 | NOT RUN |
| /driver-grievance | dark | 768 | NOT RUN |
| /driver-grievance | light | 1280 | NOT RUN |
| /driver-grievance | dark | 1280 | NOT RUN |
| /driver-grievance | light | 1440 | NOT RUN |
| /driver-grievance | dark | 1440 | NOT RUN |
| /dev/hero | light | 360 | NOT RUN |
| /dev/hero | dark | 360 | NOT RUN |
| /dev/hero | light | 390 | NOT RUN |
| /dev/hero | dark | 390 | NOT RUN |
| /dev/hero | light | 768 | NOT RUN |
| /dev/hero | dark | 768 | NOT RUN |
| /dev/hero | light | 1280 | NOT RUN |
| /dev/hero | dark | 1280 | NOT RUN |
| /dev/hero | light | 1440 | NOT RUN |
| /dev/hero | dark | 1440 | NOT RUN |
| /dev/home | light | 360 | NOT RUN |
| /dev/home | dark | 360 | NOT RUN |
| /dev/home | light | 390 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| /dev/home | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/home | light | 768 | NOT RUN |
| /dev/home | dark | 768 | NOT RUN |
| /dev/home | light | 1280 | NOT RUN |
| /dev/home | dark | 1280 | NOT RUN |
| /dev/home | light | 1440 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| /dev/home | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle | light | 360 | NOT RUN |
| /dev/vehicle | dark | 360 | NOT RUN |
| /dev/vehicle | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle | light | 768 | NOT RUN |
| /dev/vehicle | dark | 768 | NOT RUN |
| /dev/vehicle | light | 1280 | NOT RUN |
| /dev/vehicle | dark | 1280 | NOT RUN |
| /dev/vehicle | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?fare=formula | light | 360 | NOT RUN |
| /dev/vehicle?fare=formula | dark | 360 | NOT RUN |
| /dev/vehicle?fare=formula | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?fare=formula | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?fare=formula | light | 768 | NOT RUN |
| /dev/vehicle?fare=formula | dark | 768 | NOT RUN |
| /dev/vehicle?fare=formula | light | 1280 | NOT RUN |
| /dev/vehicle?fare=formula | dark | 1280 | NOT RUN |
| /dev/vehicle?fare=formula | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?fare=formula | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?safe=1 | light | 360 | NOT RUN |
| /dev/vehicle?safe=1 | dark | 360 | NOT RUN |
| /dev/vehicle?safe=1 | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?safe=1 | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?safe=1 | light | 768 | NOT RUN |
| /dev/vehicle?safe=1 | dark | 768 | NOT RUN |
| /dev/vehicle?safe=1 | light | 1280 | NOT RUN |
| /dev/vehicle?safe=1 | dark | 1280 | NOT RUN |
| /dev/vehicle?safe=1 | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?safe=1 | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?options=1 | light | 360 | NOT RUN |
| /dev/vehicle?options=1 | dark | 360 | NOT RUN |
| /dev/vehicle?options=1 | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?options=1 | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?options=1 | light | 768 | NOT RUN |
| /dev/vehicle?options=1 | dark | 768 | NOT RUN |
| /dev/vehicle?options=1 | light | 1280 | NOT RUN |
| /dev/vehicle?options=1 | dark | 1280 | NOT RUN |
| /dev/vehicle?options=1 | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?options=1 | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?safe=1&options=1 | light | 360 | NOT RUN |
| /dev/vehicle?safe=1&options=1 | dark | 360 | NOT RUN |
| /dev/vehicle?safe=1&options=1 | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?safe=1&options=1 | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?safe=1&options=1 | light | 768 | NOT RUN |
| /dev/vehicle?safe=1&options=1 | dark | 768 | NOT RUN |
| /dev/vehicle?safe=1&options=1 | light | 1280 | NOT RUN |
| /dev/vehicle?safe=1&options=1 | dark | 1280 | NOT RUN |
| /dev/vehicle?safe=1&options=1 | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?safe=1&options=1 | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?step=confirmLocation | light | 360 | NOT RUN |
| /dev/vehicle?step=confirmLocation | dark | 360 | NOT RUN |
| /dev/vehicle?step=confirmLocation | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?step=confirmLocation | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?step=confirmLocation | light | 768 | NOT RUN |
| /dev/vehicle?step=confirmLocation | dark | 768 | NOT RUN |
| /dev/vehicle?step=confirmLocation | light | 1280 | NOT RUN |
| /dev/vehicle?step=confirmLocation | dark | 1280 | NOT RUN |
| /dev/vehicle?step=confirmLocation | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?step=confirmLocation | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?step=searching | light | 360 | NOT RUN |
| /dev/vehicle?step=searching | dark | 360 | NOT RUN |
| /dev/vehicle?step=searching | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?step=searching | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?step=searching | light | 768 | NOT RUN |
| /dev/vehicle?step=searching | dark | 768 | NOT RUN |
| /dev/vehicle?step=searching | light | 1280 | NOT RUN |
| /dev/vehicle?step=searching | dark | 1280 | NOT RUN |
| /dev/vehicle?step=searching | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?step=searching | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=noDriver | light | 360 | NOT RUN |
| /dev/vehicle?panel=noDriver | dark | 360 | NOT RUN |
| /dev/vehicle?panel=noDriver | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=noDriver | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=noDriver | light | 768 | NOT RUN |
| /dev/vehicle?panel=noDriver | dark | 768 | NOT RUN |
| /dev/vehicle?panel=noDriver | light | 1280 | NOT RUN |
| /dev/vehicle?panel=noDriver | dark | 1280 | NOT RUN |
| /dev/vehicle?panel=noDriver | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=noDriver | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1 | light | 360 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1 | dark | 360 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1 | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1 | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1 | light | 768 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1 | dark | 768 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1 | light | 1280 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1 | dark | 1280 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1 | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1 | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=verifying | light | 360 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=verifying | dark | 360 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=verifying | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=verifying | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=verifying | light | 768 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=verifying | dark | 768 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=verifying | light | 1280 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=verifying | dark | 1280 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=verifying | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=verifying | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=cancelled | light | 360 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=cancelled | dark | 360 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=cancelled | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=cancelled | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=cancelled | light | 768 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=cancelled | dark | 768 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=cancelled | light | 1280 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=cancelled | dark | 1280 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=cancelled | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=cancelled | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=failed | light | 360 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=failed | dark | 360 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=failed | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=failed | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=failed | light | 768 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=failed | dark | 768 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=failed | light | 1280 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=failed | dark | 1280 | NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=failed | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=payment&scheduled=1&payment=failed | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=confirmed&scheduled=1&payment=success | light | 360 | NOT RUN |
| /dev/vehicle?panel=confirmed&scheduled=1&payment=success | dark | 360 | NOT RUN |
| /dev/vehicle?panel=confirmed&scheduled=1&payment=success | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=confirmed&scheduled=1&payment=success | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=confirmed&scheduled=1&payment=success | light | 768 | NOT RUN |
| /dev/vehicle?panel=confirmed&scheduled=1&payment=success | dark | 768 | NOT RUN |
| /dev/vehicle?panel=confirmed&scheduled=1&payment=success | light | 1280 | NOT RUN |
| /dev/vehicle?panel=confirmed&scheduled=1&payment=success | dark | 1280 | NOT RUN |
| /dev/vehicle?panel=confirmed&scheduled=1&payment=success | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=confirmed&scheduled=1&payment=success | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/cancellation?charge=150 | light | 360 | NOT RUN |
| /dev/cancellation?charge=150 | dark | 360 | NOT RUN |
| /dev/cancellation?charge=150 | light | 390 | NOT RUN |
| /dev/cancellation?charge=150 | dark | 390 | NOT RUN |
| /dev/cancellation?charge=150 | light | 768 | NOT RUN |
| /dev/cancellation?charge=150 | dark | 768 | NOT RUN |
| /dev/cancellation?charge=150 | light | 1280 | NOT RUN |
| /dev/cancellation?charge=150 | dark | 1280 | NOT RUN |
| /dev/cancellation?charge=150 | light | 1440 | NOT RUN |
| /dev/cancellation?charge=150 | dark | 1440 | NOT RUN |
| /dev/vehicle?panel=confirmed&scheduled=1 | light | 360 | NOT RUN |
| /dev/vehicle?panel=confirmed&scheduled=1 | dark | 360 | NOT RUN |
| /dev/vehicle?panel=confirmed&scheduled=1 | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=confirmed&scheduled=1 | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=confirmed&scheduled=1 | light | 768 | NOT RUN |
| /dev/vehicle?panel=confirmed&scheduled=1 | dark | 768 | NOT RUN |
| /dev/vehicle?panel=confirmed&scheduled=1 | light | 1280 | NOT RUN |
| /dev/vehicle?panel=confirmed&scheduled=1 | dark | 1280 | NOT RUN |
| /dev/vehicle?panel=confirmed&scheduled=1 | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?panel=confirmed&scheduled=1 | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=assigned | light | 360 | NOT RUN |
| /dev/tracking?status=assigned | dark | 360 | NOT RUN |
| /dev/tracking?status=assigned | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=assigned | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=assigned | light | 768 | NOT RUN |
| /dev/tracking?status=assigned | dark | 768 | NOT RUN |
| /dev/tracking?status=assigned | light | 1280 | NOT RUN |
| /dev/tracking?status=assigned | dark | 1280 | NOT RUN |
| /dev/tracking?status=assigned | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=assigned | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=pending&driverCancelled=1 | light | 360 | NOT RUN |
| /dev/tracking?status=pending&driverCancelled=1 | dark | 360 | NOT RUN |
| /dev/tracking?status=pending&driverCancelled=1 | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=pending&driverCancelled=1 | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=pending&driverCancelled=1 | light | 768 | NOT RUN |
| /dev/tracking?status=pending&driverCancelled=1 | dark | 768 | NOT RUN |
| /dev/tracking?status=pending&driverCancelled=1 | light | 1280 | NOT RUN |
| /dev/tracking?status=pending&driverCancelled=1 | dark | 1280 | NOT RUN |
| /dev/tracking?status=pending&driverCancelled=1 | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=pending&driverCancelled=1 | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=en_route&driver=1 | light | 360 | NOT RUN |
| /dev/tracking?status=en_route&driver=1 | dark | 360 | NOT RUN |
| /dev/tracking?status=en_route&driver=1 | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=en_route&driver=1 | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=en_route&driver=1 | light | 768 | NOT RUN |
| /dev/tracking?status=en_route&driver=1 | dark | 768 | NOT RUN |
| /dev/tracking?status=en_route&driver=1 | light | 1280 | NOT RUN |
| /dev/tracking?status=en_route&driver=1 | dark | 1280 | NOT RUN |
| /dev/tracking?status=en_route&driver=1 | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=en_route&driver=1 | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=en_route | light | 360 | NOT RUN |
| /dev/tracking?status=en_route | dark | 360 | NOT RUN |
| /dev/tracking?status=en_route | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=en_route | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=en_route | light | 768 | NOT RUN |
| /dev/tracking?status=en_route | dark | 768 | NOT RUN |
| /dev/tracking?status=en_route | light | 1280 | NOT RUN |
| /dev/tracking?status=en_route | dark | 1280 | NOT RUN |
| /dev/tracking?status=en_route | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=en_route | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=reached | light | 360 | NOT RUN |
| /dev/tracking?status=reached | dark | 360 | NOT RUN |
| /dev/tracking?status=reached | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=reached | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=reached | light | 768 | NOT RUN |
| /dev/tracking?status=reached | dark | 768 | NOT RUN |
| /dev/tracking?status=reached | light | 1280 | NOT RUN |
| /dev/tracking?status=reached | dark | 1280 | NOT RUN |
| /dev/tracking?status=reached | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=reached | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=on_trip | light | 360 | NOT RUN |
| /dev/tracking?status=on_trip | dark | 360 | NOT RUN |
| /dev/tracking?status=on_trip | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=on_trip | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=on_trip | light | 768 | NOT RUN |
| /dev/tracking?status=on_trip | dark | 768 | NOT RUN |
| /dev/tracking?status=on_trip | light | 1280 | NOT RUN |
| /dev/tracking?status=on_trip | dark | 1280 | NOT RUN |
| /dev/tracking?status=on_trip | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=on_trip | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=on_trip&fare=formula | light | 360 | NOT RUN |
| /dev/tracking?status=on_trip&fare=formula | dark | 360 | NOT RUN |
| /dev/tracking?status=on_trip&fare=formula | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=on_trip&fare=formula | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=on_trip&fare=formula | light | 768 | NOT RUN |
| /dev/tracking?status=on_trip&fare=formula | dark | 768 | NOT RUN |
| /dev/tracking?status=on_trip&fare=formula | light | 1280 | NOT RUN |
| /dev/tracking?status=on_trip&fare=formula | dark | 1280 | NOT RUN |
| /dev/tracking?status=on_trip&fare=formula | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=on_trip&fare=formula | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed | light | 360 | NOT RUN |
| /dev/tracking?status=completed | dark | 360 | NOT RUN |
| /dev/tracking?status=completed | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed | light | 768 | NOT RUN |
| /dev/tracking?status=completed | dark | 768 | NOT RUN |
| /dev/tracking?status=completed | light | 1280 | NOT RUN |
| /dev/tracking?status=completed | dark | 1280 | NOT RUN |
| /dev/tracking?status=completed | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed&fare=formula | light | 360 | NOT RUN |
| /dev/tracking?status=completed&fare=formula | dark | 360 | NOT RUN |
| /dev/tracking?status=completed&fare=formula | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed&fare=formula | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed&fare=formula | light | 768 | NOT RUN |
| /dev/tracking?status=completed&fare=formula | dark | 768 | NOT RUN |
| /dev/tracking?status=completed&fare=formula | light | 1280 | NOT RUN |
| /dev/tracking?status=completed&fare=formula | dark | 1280 | NOT RUN |
| /dev/tracking?status=completed&fare=formula | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed&fare=formula | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed&safe=1 | light | 360 | NOT RUN |
| /dev/tracking?status=completed&safe=1 | dark | 360 | NOT RUN |
| /dev/tracking?status=completed&safe=1 | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed&safe=1 | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed&safe=1 | light | 768 | NOT RUN |
| /dev/tracking?status=completed&safe=1 | dark | 768 | NOT RUN |
| /dev/tracking?status=completed&safe=1 | light | 1280 | NOT RUN |
| /dev/tracking?status=completed&safe=1 | dark | 1280 | NOT RUN |
| /dev/tracking?status=completed&safe=1 | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed&safe=1 | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=failed | light | 360 | NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=failed | dark | 360 | NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=failed | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=failed | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=failed | light | 768 | NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=failed | dark | 768 | NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=failed | light | 1280 | NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=failed | dark | 1280 | NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=failed | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=failed | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=cancelled | light | 360 | NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=cancelled | dark | 360 | NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=cancelled | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=cancelled | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=cancelled | light | 768 | NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=cancelled | dark | 768 | NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=cancelled | light | 1280 | NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=cancelled | dark | 1280 | NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=cancelled | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=cancelled | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=success | light | 360 | NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=success | dark | 360 | NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=success | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=success | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=success | light | 768 | NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=success | dark | 768 | NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=success | light | 1280 | NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=success | dark | 1280 | NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=success | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=completed&scheduled=1&payment=success | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=payment_pending&scheduled=1 | light | 360 | NOT RUN |
| /dev/tracking?status=payment_pending&scheduled=1 | dark | 360 | NOT RUN |
| /dev/tracking?status=payment_pending&scheduled=1 | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=payment_pending&scheduled=1 | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=payment_pending&scheduled=1 | light | 768 | NOT RUN |
| /dev/tracking?status=payment_pending&scheduled=1 | dark | 768 | NOT RUN |
| /dev/tracking?status=payment_pending&scheduled=1 | light | 1280 | NOT RUN |
| /dev/tracking?status=payment_pending&scheduled=1 | dark | 1280 | NOT RUN |
| /dev/tracking?status=payment_pending&scheduled=1 | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=payment_pending&scheduled=1 | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=confirmed&scheduled=1 | light | 360 | NOT RUN |
| /dev/tracking?status=confirmed&scheduled=1 | dark | 360 | NOT RUN |
| /dev/tracking?status=confirmed&scheduled=1 | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=confirmed&scheduled=1 | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=confirmed&scheduled=1 | light | 768 | NOT RUN |
| /dev/tracking?status=confirmed&scheduled=1 | dark | 768 | NOT RUN |
| /dev/tracking?status=confirmed&scheduled=1 | light | 1280 | NOT RUN |
| /dev/tracking?status=confirmed&scheduled=1 | dark | 1280 | NOT RUN |
| /dev/tracking?status=confirmed&scheduled=1 | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=confirmed&scheduled=1 | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=confirmed&scheduled=1&driverCancelled=1 | light | 360 | NOT RUN |
| /dev/tracking?status=confirmed&scheduled=1&driverCancelled=1 | dark | 360 | NOT RUN |
| /dev/tracking?status=confirmed&scheduled=1&driverCancelled=1 | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=confirmed&scheduled=1&driverCancelled=1 | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=confirmed&scheduled=1&driverCancelled=1 | light | 768 | NOT RUN |
| /dev/tracking?status=confirmed&scheduled=1&driverCancelled=1 | dark | 768 | NOT RUN |
| /dev/tracking?status=confirmed&scheduled=1&driverCancelled=1 | light | 1280 | NOT RUN |
| /dev/tracking?status=confirmed&scheduled=1&driverCancelled=1 | dark | 1280 | NOT RUN |
| /dev/tracking?status=confirmed&scheduled=1&driverCancelled=1 | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=confirmed&scheduled=1&driverCancelled=1 | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=assigned&scheduled=1 | light | 360 | NOT RUN |
| /dev/tracking?status=assigned&scheduled=1 | dark | 360 | NOT RUN |
| /dev/tracking?status=assigned&scheduled=1 | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=assigned&scheduled=1 | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=assigned&scheduled=1 | light | 768 | NOT RUN |
| /dev/tracking?status=assigned&scheduled=1 | dark | 768 | NOT RUN |
| /dev/tracking?status=assigned&scheduled=1 | light | 1280 | NOT RUN |
| /dev/tracking?status=assigned&scheduled=1 | dark | 1280 | NOT RUN |
| /dev/tracking?status=assigned&scheduled=1 | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=assigned&scheduled=1 | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=assigned&scheduled=1&fare=formula | light | 360 | NOT RUN |
| /dev/tracking?status=assigned&scheduled=1&fare=formula | dark | 360 | NOT RUN |
| /dev/tracking?status=assigned&scheduled=1&fare=formula | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=assigned&scheduled=1&fare=formula | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=assigned&scheduled=1&fare=formula | light | 768 | NOT RUN |
| /dev/tracking?status=assigned&scheduled=1&fare=formula | dark | 768 | NOT RUN |
| /dev/tracking?status=assigned&scheduled=1&fare=formula | light | 1280 | NOT RUN |
| /dev/tracking?status=assigned&scheduled=1&fare=formula | dark | 1280 | NOT RUN |
| /dev/tracking?status=assigned&scheduled=1&fare=formula | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=assigned&scheduled=1&fare=formula | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/trip?scheduled=1 | light | 360 | NOT RUN |
| /dev/trip?scheduled=1 | dark | 360 | NOT RUN |
| /dev/trip?scheduled=1 | light | 390 | NOT RUN |
| /dev/trip?scheduled=1 | dark | 390 | NOT RUN |
| /dev/trip?scheduled=1 | light | 768 | NOT RUN |
| /dev/trip?scheduled=1 | dark | 768 | NOT RUN |
| /dev/trip?scheduled=1 | light | 1280 | NOT RUN |
| /dev/trip?scheduled=1 | dark | 1280 | NOT RUN |
| /dev/trip?scheduled=1 | light | 1440 | NOT RUN |
| /dev/trip?scheduled=1 | dark | 1440 | NOT RUN |
| /dev/ride-details | light | 360 | NOT RUN |
| /dev/ride-details | dark | 360 | NOT RUN |
| /dev/ride-details | light | 390 | NOT RUN |
| /dev/ride-details | dark | 390 | NOT RUN |
| /dev/ride-details | light | 768 | NOT RUN |
| /dev/ride-details | dark | 768 | NOT RUN |
| /dev/ride-details | light | 1280 | NOT RUN |
| /dev/ride-details | dark | 1280 | NOT RUN |
| /dev/ride-details | light | 1440 | NOT RUN |
| /dev/ride-details | dark | 1440 | NOT RUN |
| /dev/ride-details?safe=1 | light | 360 | NOT RUN |
| /dev/ride-details?safe=1 | dark | 360 | NOT RUN |
| /dev/ride-details?safe=1 | light | 390 | NOT RUN |
| /dev/ride-details?safe=1 | dark | 390 | NOT RUN |
| /dev/ride-details?safe=1 | light | 768 | NOT RUN |
| /dev/ride-details?safe=1 | dark | 768 | NOT RUN |
| /dev/ride-details?safe=1 | light | 1280 | NOT RUN |
| /dev/ride-details?safe=1 | dark | 1280 | NOT RUN |
| /dev/ride-details?safe=1 | light | 1440 | NOT RUN |
| /dev/ride-details?safe=1 | dark | 1440 | NOT RUN |
| /dev/vehicle?route=none | light | 360 | NOT RUN |
| /dev/vehicle?route=none | dark | 360 | NOT RUN |
| /dev/vehicle?route=none | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?route=none | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?route=none | light | 768 | NOT RUN |
| /dev/vehicle?route=none | dark | 768 | NOT RUN |
| /dev/vehicle?route=none | light | 1280 | NOT RUN |
| /dev/vehicle?route=none | dark | 1280 | NOT RUN |
| /dev/vehicle?route=none | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/vehicle?route=none | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=none | light | 360 | NOT RUN |
| /dev/tracking?status=none | dark | 360 | NOT RUN |
| /dev/tracking?status=none | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=none | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=none | light | 768 | NOT RUN |
| /dev/tracking?status=none | dark | 768 | NOT RUN |
| /dev/tracking?status=none | light | 1280 | NOT RUN |
| /dev/tracking?status=none | dark | 1280 | NOT RUN |
| /dev/tracking?status=none | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/tracking?status=none | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/states | light | 360 | NOT RUN |
| /dev/states | dark | 360 | NOT RUN |
| /dev/states | light | 390 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| /dev/states | dark | 390 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| /dev/states | light | 768 | NOT RUN |
| /dev/states | dark | 768 | NOT RUN |
| /dev/states | light | 1280 | NOT RUN |
| /dev/states | dark | 1280 | NOT RUN |
| /dev/states | light | 1440 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| /dev/states | dark | 1440 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| /dev/rides | light | 360 | NOT RUN |
| /dev/rides | dark | 360 | NOT RUN |
| /dev/rides | light | 390 | NOT RUN |
| /dev/rides | dark | 390 | NOT RUN |
| /dev/rides | light | 768 | NOT RUN |
| /dev/rides | dark | 768 | NOT RUN |
| /dev/rides | light | 1280 | NOT RUN |
| /dev/rides | dark | 1280 | NOT RUN |
| /dev/rides | light | 1440 | NOT RUN |
| /dev/rides | dark | 1440 | NOT RUN |
| /dev/account | light | 360 | NOT RUN |
| /dev/account | dark | 360 | NOT RUN |
| /dev/account | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/account | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/account | light | 768 | NOT RUN |
| /dev/account | dark | 768 | NOT RUN |
| /dev/account | light | 1280 | NOT RUN |
| /dev/account | dark | 1280 | NOT RUN |
| /dev/account | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/account | dark | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/settings | light | 360 | PASS: notifications + theme + loading/error functional checks |
| /dev/settings | dark | 360 | PASS: notifications + theme + loading/error functional checks |
| /dev/settings | light | 390 | PASS: notifications + theme + loading/error functional checks |
| /dev/settings | dark | 390 | PASS: notifications + theme + loading/error functional checks |
| /dev/settings | light | 768 | PASS: notifications + theme + loading/error functional checks |
| /dev/settings | dark | 768 | PASS: notifications + theme + loading/error functional checks |
| /dev/settings | light | 1280 | PASS: notifications + theme + loading/error functional checks |
| /dev/settings | dark | 1280 | PASS: notifications + theme + loading/error functional checks |
| /dev/settings | light | 1440 | PASS: notifications + theme + loading/error functional checks |
| /dev/settings | dark | 1440 | PASS: notifications + theme + loading/error functional checks |
| /dev/safety | light | 360 | NOT RUN |
| /dev/safety | dark | 360 | NOT RUN |
| /dev/safety | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/safety | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/safety | light | 768 | NOT RUN |
| /dev/safety | dark | 768 | NOT RUN |
| /dev/safety | light | 1280 | NOT RUN |
| /dev/safety | dark | 1280 | NOT RUN |
| /dev/safety | light | 1440 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| /dev/safety | dark | 1440 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| /dev/help | light | 360 | NOT RUN |
| /dev/help | dark | 360 | NOT RUN |
| /dev/help | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/help | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/help | light | 768 | NOT RUN |
| /dev/help | dark | 768 | NOT RUN |
| /dev/help | light | 1280 | NOT RUN |
| /dev/help | dark | 1280 | NOT RUN |
| /dev/help | light | 1440 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/help | dark | 1440 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| /dev/services | light | 360 | NOT RUN |
| /dev/services | dark | 360 | NOT RUN |
| /dev/services | light | 390 | NOT RUN |
| /dev/services | dark | 390 | NOT RUN |
| /dev/services | light | 768 | NOT RUN |
| /dev/services | dark | 768 | NOT RUN |
| /dev/services | light | 1280 | NOT RUN |
| /dev/services | dark | 1280 | NOT RUN |
| /dev/services | light | 1440 | NOT RUN |
| /dev/services | dark | 1440 | NOT RUN |
| /dev/admin | light | 360 | NOT RUN |
| /dev/admin | dark | 360 | NOT RUN |
| /dev/admin | light | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/admin | dark | 390 | CAPTURED_NOT_APPROVED; axe no reported violations; functional journey NOT RUN |
| /dev/admin | light | 768 | NOT RUN |
| /dev/admin | dark | 768 | NOT RUN |
| /dev/admin | light | 1280 | NOT RUN |
| /dev/admin | dark | 1280 | NOT RUN |
| /dev/admin | light | 1440 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| /dev/admin | dark | 1440 | CAPTURED_NOT_APPROVED; axe FAIL; functional journey NOT RUN |
| /dev/crash | light | 360 | NOT RUN |
| /dev/crash | dark | 360 | NOT RUN |
| /dev/crash | light | 390 | NOT RUN |
| /dev/crash | dark | 390 | NOT RUN |
| /dev/crash | light | 768 | NOT RUN |
| /dev/crash | dark | 768 | NOT RUN |
| /dev/crash | light | 1280 | NOT RUN |
| /dev/crash | dark | 1280 | NOT RUN |
| /dev/crash | light | 1440 | NOT RUN |
| /dev/crash | dark | 1440 | NOT RUN |
| /dev/cancellation | light | 360 | NOT RUN |
| /dev/cancellation | dark | 360 | NOT RUN |
| /dev/cancellation | light | 390 | NOT RUN |
| /dev/cancellation | dark | 390 | NOT RUN |
| /dev/cancellation | light | 768 | NOT RUN |
| /dev/cancellation | dark | 768 | NOT RUN |
| /dev/cancellation | light | 1280 | NOT RUN |
| /dev/cancellation | dark | 1280 | NOT RUN |
| /dev/cancellation | light | 1440 | NOT RUN |
| /dev/cancellation | dark | 1440 | NOT RUN |
| /dev/trip | light | 360 | NOT RUN |
| /dev/trip | dark | 360 | NOT RUN |
| /dev/trip | light | 390 | NOT RUN |
| /dev/trip | dark | 390 | NOT RUN |
| /dev/trip | light | 768 | NOT RUN |
| /dev/trip | dark | 768 | NOT RUN |
| /dev/trip | light | 1280 | NOT RUN |
| /dev/trip | dark | 1280 | NOT RUN |
| /dev/trip | light | 1440 | NOT RUN |
| /dev/trip | dark | 1440 | NOT RUN |

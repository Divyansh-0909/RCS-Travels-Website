# Ride Sharing — Implementation Spec

Status: design agreed, not built. Written against the code as of 14 Aug 2026.

This supersedes the sharing notes in ROADMAP.txt. Where this document and the
existing code disagree, the code is the thing that is wrong — every claim about
current behaviour below was read out of the files named.

---

## 0. What sharing is today, and what changes

Today `sharing` is two things and nothing else:

1. A 25% discount on the driving fare (`SHARING_DISCOUNT_PCT`, rideEstimate.js).
2. A permission for dispatch to put more than one booking in a car, by taking
   one seat instead of the whole vehicle (`claimBookingForDriver`).

There is no pooling. The pass that was meant to join an existing shared trip is
dead — it filters on `loc.sharing`, a column `DriverLocation` does not have, so
it matches nothing and every sharing booking falls through to the fresh-vehicle
pass. `shareGroupId` and `pickupOrder` exist on `Booking`, are read by
routes/admin.ts and routes/driver.ts, and are **never written** by anything.

What changes: a second rider can join a trip a driver is already doing, the
server computes the stop sequence, and the driver app is told what his next stop
is.

## 1. Vocabulary

| Symbol | Meaning |
|---|---|
| `C` | The driver's current position (`driver_locations`, live) |
| `P1`, `D1` | The **host** booking's pickup and drop — the ride already assigned |
| `P2`, `D2` | The **joiner** booking's pickup and drop — the new request |

"Host" and "joiner" are roles in one matching attempt, not stored states. A
joiner becomes a host the moment it is assigned.

## 2. Decisions locked

These were settled in discussion and are not open in this document.

1. **Seed + join.** A sharing booking that finds no host is assigned to an idle
   driver and becomes a poolable host itself. Join-only can never bootstrap:
   with no way to start a shared trip, the set of shared trips stays empty
   forever.
2. **The discount is honoured regardless.** A rider who is never joined keeps
   the 25%. This is the cost of liquidity, and it is already how the code
   behaves.
3. **One booking is exactly one passenger.** Nothing records party size and
   nothing needs to. Capacity arithmetic stays `decrement: 1`.
4. **Maximum two bookings per vehicle** for this version. See §11 for the
   graduation trigger.
5. **Nearest drop first.** The host may be dropped second. Booking order does
   not determine drop order.
6. **A driver at `reached` is never re-planned.** He is coordinating a physical
   boarding; mutating his route at that moment is how he misses a turn.
7. **A pooled pickup is normally ahead of the car.** A driver is turned around
   in two cases only: the joiner's pickup is at campus, or **the turn itself is
   short** — the `C → P2` leg under `MAX_REVERSAL_LEG_MIN`. This is a filter of
   its own, not a smaller delay budget: it constrains the approach leg, and the
   ordinary `MAX_HOST_DELAY_MIN` still applies on top of it to the whole
   sequence. A quick turnaround followed by a long detour fails on the second
   test, not the first.
8. **Pool candidates are offered before idle candidates**, and the two sets are
   disjoint, so no driver is ever offered the same booking twice.

## 3. Who can host a pool

A driver is a pool host for a given joiner request when **all** of these hold.
The first four are cheap and belong in the candidate query or immediately after
it; the fifth is §4.

1. He is dispatchable at all — the existing filters in `candidatesWithin`:
   online, active, approved, not suspended, matching `vehicle_class`, and a GPS
   fix newer than `LOCATION_STALE_AFTER_MS`.
2. `vehicleCapacity > 0`.
3. He has **exactly one** active booking (status in `assigned`, `en_route`,
   `reached`, `started`) and that booking has `sharing = true`. A solo host is
   excluded because its rider paid for the whole car — today that happens only
   as a side effect of solo zeroing the capacity, which is the seat rule doing
   it by accident rather than the matching rule saying it.
4. That booking's status is **not** `reached`, and it is not within
   `NEARLY_DONE_MIN` of `D1`. Inserting into either is pointless or hostile.
5. One of the two entry rules below is satisfied.

### 3a. Entry rule A — the joiner's pickup is at campus

`isNearCampus(P2)`.

That is the whole condition. It says nothing about where the driver is: a car
still sitting on campus qualifies, and so does one that left ten minutes ago and
has to come back. Campus is the hub nearly every ride originates from, so a
driver who has only just pulled out is worth turning around for.

This is the dominant case for RCS. Rides are hub-and-spoke out of Shiv Nadar,
so the realistic co-rider is another person leaving campus in the same
direction — usually before the car has gone anywhere at all.

The rule needs no distance bound of its own. A driver 40 km down the expressway
technically satisfies `isNearCampus(P2)` too, and is then rejected by
`MAX_HOST_DELAY_MIN` in §4 without a second constant having to say so.

`isNearCampus` is exported from services/fareZones.js and uses a surveyed
centre with `SNU_RADIUS_KM = 1.5`. **That radius was tuned for pricing** — it is
deliberately tight so a drop in the Dadri/Tilapta strip does not read as "campus
at both ends" and lose its zone fare. Reusing it here is the honest MVP move
(one definition of campus, not two) but the tuning rationale is not the pooling
one. If pooling turns out to want a wider mouth, add a separate exported
constant rather than widening `SNU_RADIUS_KM` and silently repricing every ride.

### 3b. Entry rule B — the joiner's pickup is ahead of the car, and on its route

Two tests, and **both** must pass — direction and distance.

Direction is not a veto. When `P2` is behind the car, the candidate survives
only if the turn itself is short:

```
P2 ahead of the car   →  no extra condition
P2 behind the car     →  the C → P2 leg must be under MAX_REVERSAL_LEG_MIN
```

That constrains the **approach leg alone**, not the whole detour.
`MAX_HOST_DELAY_MIN` still applies to the complete sequence on top of it, so a
five-minute turnaround followed by a twenty-minute detour is rejected — by the
delay cap, not by this test. Decision 7.

The direction test is skipped entirely when `isNearCampus(P2)`; that is rule A,
and a campus pickup faces no reversal condition however far back it is.

**The two tests are gated differently, and this matters.**

Test 1 (direction) runs **only when the host booking is `started`** — that is,
when the car is genuinely somewhere on the stored `P1 → D1` path, so "how far
along" is a meaningful question. While the host is `assigned` or `en_route` the
driver is approaching `P1` from an arbitrary direction and is not on that path
at all; projecting `C` onto it would compare against a road he has not joined.
In that state there is no journey under way to reverse.

Test 2 (on-route) runs **always**. "Is `P2` on the way from `P1` to `D1`" is a
fair question whether or not the car has set off, and it is the only geometric
gate a not-yet-collected host has — without it, any pickup anywhere would reach
the routing stage and be filtered on time alone.

That restriction has a convenient consequence. When the host *is* `started`,
both surviving sequences (§4a) begin `C → P2`, so the reversal leg is
unambiguously the routed first leg — no attribution guesswork about which
minutes belong to the turn.

**Test 1 — direction. Is `P2` further along the route than the car is?**

Project both `C` and `P2` onto the host booking's stored route path and compare
how far along the path each one lands:

```
alongOf(C)  = distance from the route's start to C's projection
alongOf(P2) = distance from the route's start to P2's projection

require  alongOf(P2) > alongOf(C) + MIN_FORWARD_KM
```

`MIN_FORWARD_KM` is a small margin so that a pickup essentially level with the
car cannot qualify on GPS noise alone.

This is strictly better than comparing compass bearings. It is measured against
the actual road the driver is on, so it cannot be fooled by a pickup that lies
in the right direction but on the far side of a divided carriageway. It also
needs no reading of `DriverLocation.bearing`, which is null until a second fix
arrives and is therefore missing exactly when a driver has just started moving.

**Test 2 — distance. Is `P2` actually on that route?**

```
kmPointToPath(P2, hostRoutePoints) <= ON_ROUTE_TOLERANCE_KM
```

Deliberately narrower than a bearing corridor: the pickup must be on the road
the driver is driving, not merely in the same general direction. A pickup 6 km
off the expressway passes any bearing test and fails this one, correctly.

`kmPointToPath` and `decodePolyline` are already in services/geo.js —
safeRoute.js uses them to score how far a candidate route departs from the
default one. The path comes from the host booking's stored polyline, §6.

**What this needs added to geo.js.** `kmPointToPath` returns only the
perpendicular distance and discards which segment produced it, so it cannot
answer test 1. Add a sibling that returns both:

```
projectOntoPath(p, path) -> { offRouteKm, alongKm }
```

One pass, accumulating segment lengths as it goes and keeping the best
projection. `kmPointToPath` should then be re-expressed in terms of it, so there
is one projection implementation rather than two that can drift apart.

## 4. The sequence algorithm

This is the core of the feature. The corridor and on-route tests only say two
rides are *compatible*; they do not say what the driver should actually do.

### 4a. Enumerate valid sequences

Every sequence starts at `C` and must satisfy `P1 < D1` and `P2 < D2`. Sequences
that drop one rider before collecting the other are excluded — that is a
back-to-back trip, not a pool, and neither the capacity arithmetic nor the fare
model represents it.

**Host not yet collected** (`assigned`, `en_route`) — four candidates:

```
C → P1 → P2 → D1 → D2
C → P1 → P2 → D2 → D1
C → P2 → P1 → D1 → D2
C → P2 → P1 → D2 → D1
```

**Host already aboard** (`started`) — two candidates:

```
C → P2 → D1 → D2
C → P2 → D2 → D1
```

Four is the ceiling. No general permutation machinery is needed or wanted.

### 4b. Constraints first, optimisation second

Score every sequence, then filter, then choose. Filtering after optimising gets
this wrong: minimising total route time alone will happily make the joiner wait
nine minutes to save three minutes of driving.

```
1. Drop sequences violating pickup-before-drop         (already excluded by 4a)
2. Drop reversing sequences whose C → P2 leg > MAX_REVERSAL_LEG_MIN
       (reversing = host started, P2 behind C, not isNearCampus(P2))
3. Drop sequences where host delay         > MAX_HOST_DELAY_MIN
4. Drop sequences where joiner pickup wait > MAX_JOINER_WAIT_MIN
5. Among survivors, choose minimum total route time
6. If no survivors, this candidate is not a host — try the next driver
```

Step 2 is where §3b's direction test lands, and it sits at the same level as the
other filters rather than modifying them. Steps 2 and 3 constrain different
things — the approach leg and the whole sequence — so both run, and a candidate
must satisfy both.

Step 4 optimises the operator's cost, which is legitimate *only because* steps 2
and 3 have already guaranteed both riders individually. That ordering is the
whole point.

Definitions:

```
host delay        = ETA(D1 | chosen sequence) − ETA(D1 | host's current plan)
joiner pickup wait = ETA(P2 | chosen sequence)     [wall-clock from now]
```

Both terms of `host delay` start from `C`. Neither is stored anywhere and
neither can be: the numerator is a route that has never been driven. This is why
the stored trip duration cannot answer the question — it describes `P1 → D1`
from a different origin at a different time.

### 4c. Routing the candidates

Route every valid sequence properly. Do not approximate road time with
straight-line geometry: the entire reason this test exists is that a drop 2 km
away can be twenty minutes away, and no geometric estimate can see a divided
carriageway, a one-way system or an expressway with a distant U-turn cut.

One Routes call evaluates one full sequence, so a host candidate costs at most
four calls — two when the host is already aboard.

**On the monthly cap.** `checkAndIncrementRoutesUsage` still guards every call
and is shared with fare quoting, so the failure mode worth knowing is that
exhausting the cap breaks *quoting*, not just pooling: riders cannot book at
all. At current volumes this is not close, and no budget gymnastics belong in
this design. If it ever does approach the cap, the cheapest lever is to rank
sequences geometrically and route only the best one or two — a change local to
this one function, requiring nothing else in this document to move.

The existing `fetchRoutes` needs a second mode for this and cannot be reused as
is:

- It sends `via: true`, which makes intermediates pass-through points precisely
  so navigation does not announce a random highway spot as a destination. Pooled
  stops are *real* stops: this path needs `via: false`.
- Its field mask is `routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline`.
  Per-leg times are what tell you when the car reaches `D1` versus `D2`, so this
  path must also request `routes.legs.duration` and `routes.legs.distanceMeters`.
- `computeAlternativeRoutes` must stay off — alternatives and intermediates are
  mutually exclusive at the API, which is already noted in that file.

## 5. Ordering and offering

`getDriver` walks rings of 20, 30, … 80 km. Inside one ring:

1. Partition candidates into **hosts** (§3) and **fresh** (idle, capacity full).
   The sets are disjoint by construction — a driver either has an active shared
   booking or does not — so no driver can be offered the same booking twice
   without any `triedDriverIds` bookkeeping inside the ring.
2. Rank each partition with the existing comparator: group, then
   `FAIRNESS_TIER_KM` band, then whose turn it is.
3. Offer hosts first, in order, running §4 per candidate.
4. Then offer fresh drivers, which seeds a new shared trip.

**Pool candidates use a tighter radius.** A driver 18 km away carrying a rider
is a bad host even with perfect geometry, because the joiner waits 25 minutes
for a pickup. Apply `POOL_RADIUS_KM` to the host partition only; the fresh
partition keeps the existing rings, so solo dispatch is untouched.

Note that the ring loop re-reads candidates per ring, so a host that becomes
eligible mid-search is picked up naturally.

## 6. Schema changes

Four columns, no new tables.

```prisma
model Booking {
  // ...
  shareGroupId  String?  @map("share_group_id")   // exists, currently never written
  pickupOrder   Int?     @map("pickup_order")     // exists, currently never written
  dropOrder     Int?     @map("drop_order")       // NEW
  durationMin   Int?     @map("duration_min")     // NEW
  routePolyline String?  @map("route_polyline")   // NEW
}
```

- **`dropOrder`** — required by decision 5. `pickupOrder` alone cannot express
  "collected first, dropped second", which is the whole point of nearest-drop-
  first. With two bookings these two integers fully determine the stop sequence,
  *given that something has computed them correctly* — that something is §4.
- **`durationMin`** — Google already returns it, `marketFare` uses it, and it is
  then discarded; it is not even in the signed quote, which carries `distanceKm`
  only. Persisting it costs nothing and buys a real "reaching in X minutes" on
  the tracking page instead of the browser's straight-line guess, plus the
  `NEARLY_DONE_MIN` test in §3.
- **`routePolyline`** — the encoded path, needed by entry rule B. Also already
  computed and discarded today.

Both new sources are filled in routes/bookings.js from the verified quote, in
the same block that already reads `quote.distanceKm`. They must come from the
signed quote, not the request body, for the same reason every money-bearing
field does.

Also add `sharing`, `status`, `pickupLat`, `pickupLng`, `routePolyline` and
`durationMin` to the nested `bookings` select inside `candidatesWithin`. It
currently selects `{ id, dropLat, dropLng }`, which cannot answer whether the
host ride is even a shared one.

## 7. Writing the group

`claimBookingForDriver` already takes an `onClaimed(tx)` callback that runs
inside the claim transaction — the scheduled-offer path uses it to settle
offers, the ride-now path passes nothing. That is the seam. On a pooled claim,
`onClaimed` writes:

- `shareGroupId` on both bookings. The host will usually have none, because it
  began life as a lone shared ride; the group is created **on join**, not on
  booking. Guard the mint with `WHERE share_group_id IS NULL` so two joiners
  racing onto the same host cannot create two groups.
- `pickupOrder` and `dropOrder` on both bookings, from the chosen sequence.

**The race that matters:** the host ride can complete between the Routes call
and the claim. The capacity would return to full and the joiner would be
claimed as though joining a trip that no longer exists, with a `shareGroupId`
pointing at a completed booking. Inside `onClaimed`, re-read the host and
confirm it is still in an active status and still has the capacity it did;
throw `ClaimFailure` if not, and the caller moves to the next candidate. This is
the same conditional-write discipline the capacity guard already uses.

`ClaimFailure` is module-local today. If the pool logic lands in another file it
needs exporting.

This transaction is also the answer to "don't we need Redis locking for this".
No: a conditional `updateMany` inside a Postgres transaction is a stronger
guarantee than `SETNX`, because it is atomic *with* the assignment it protects
rather than sitting beside it.

## 8. Next stop — a server-side answer, not a UI detail

The driver must be told what to do next, not handed two bookings and left to
work it out. With per-booking statuses and the two order columns, the next stop
is derivable server-side:

```
stops = merge of both bookings' pickups and drops, ordered by §4's sequence
next  = first stop whose booking has not yet passed that stop's status
```

Per-booking statuses already work for this: `PATCH /driver/rides/:id/status` is
keyed by booking id, so the captain marks `reached`, `started` and `completed`
against each rider separately, and each rider's own `bookingCode` remains their
own boarding OTP. Nothing about the transition model needs to change.

What does need to change:

- `GET /driver/rides` and the active-ride panel must return the pooled sibling
  and the merged stop list. The Home panel currently does
  `findFirst({ status: 'assigned' })` and returns exactly one ride, so a captain
  carrying two riders sees one of them.
- The driver app renders a stop list with the next one emphasised. It receives
  `sharing` in `UpcomingBooking` today and renders it nowhere; there is no
  "Sharing" chip despite the seed script writing data for one.

## 9. Rider side

Rider 1 must be told they were joined, and that their arrival moved.

Riders are on the web, so there is no FCM path to them and none is needed — the
tracking page already polls. Add the co-rider fact and the recomputed ETA to
that response and let the existing poll carry it. The §4 Routes call has already
produced both riders' arrival times, so this costs nothing extra.

Do not let rider 1's ETA silently drift instead. Today the number they read is
computed in the browser, straight-line from the driver's polled position to the
drop. When the car detours to `P2` that number does not jump — it slowly
degrades with no explanation, which reads as the app being broken rather than as
a co-rider having joined.

The admin dashboard's co-rider block needs no work. It reads `coRiders` off the
bookings list already and renders nothing solely because `shareGroupId` is never
written.

## 10. Constants to agree

| Name | Value | Rationale |
|---|---|---|
| `MAX_HOST_DELAY_MIN` | **15** | Agreed. Comfortable on the 40–60 min campus→Delhi runs that dominate; see the note below for short trips |
| `MAX_JOINER_WAIT_MIN` | **15** | Agreed. Wall-clock from now to `P2`, out of the routed sequence — not a straight-line guess |
| `MAX_REVERSAL_LEG_MIN` | **10** | Agreed. Length of the `C → P2` leg alone when the car must turn back. Not a delay budget — `MAX_HOST_DELAY_MIN` still applies to the full sequence as well |
| `POOL_RADIUS_KM` | 8 | Coarse prefilter only. Must stay loose enough that `MAX_JOINER_WAIT_MIN` is the real gate, not this |
| `ON_ROUTE_TOLERANCE_KM` | 1.0 | Rule B test 2. Tight on purpose — "on this road", not "same direction" |
| `MIN_FORWARD_KM` | 0.3 | Rule B test 1. Margin so GPS noise cannot make a level pickup read as ahead |
| `NEARLY_DONE_MIN` | 3 | Below this, inserting a stop is navigational noise during a drop-off |
| `MAX_BOOKINGS_PER_VEHICLE` | 2 | Decision 4 |

The two 15s are flat numbers by decision, not percentages. Worth knowing what
that means at the short end: 15 minutes on a 40-minute run to Delhi is a ~35%
extension, while on a 12-minute local hop it is more than double the trip. Since
almost every shared ride here is a long campus run, a flat cap is the right
trade; if short local sharing ever becomes common, revisit this row rather than
discovering it through complaints.

No average-speed constant is needed. An earlier draft used one for a
straight-line prefilter, which §4c no longer does.

## 11. Out of scope, and when to revisit

- **Trip / TripWaypoint tables.** The production-correct model separates the
  booking (intent) from the trip (execution) with an ordered waypoint array. At
  two bookings per car, two integers express the same thing, and the table
  version costs a driver-app rewrite and an admin rewrite. **Graduate when**
  `MAX_BOOKINGS_PER_VEHICLE` goes above 2, or when a trip needs stops that are
  not somebody's pickup or drop. Make that an explicit decision, not drift.
- **Scheduled ride pooling.** `getDriver` is ride-now only — `startAssignment`
  is called from exactly one place, the non-scheduled branch of
  routes/bookings.js. Scheduled rides go through `offerScheduledRide`, which
  this document does not touch. Batch-matching scheduled pools is a separate
  pipeline.
- **Re-optimising an existing match** when a better one appears.
- **Proportional fare splitting by shared distance.** The fixed 25% is fine and
  is already signed into the quote.
- **Batch matching windows**, H3 indexing, Redis, Kafka, ML ETA models. These
  solve contention this fleet does not have.

## 12. Test cases

Correctness:

1. Sharing booking, no drivers at all → `no_driver`, unchanged.
2. Sharing booking, only idle drivers → seeds a fresh shared trip, capacity
   decrements by 1, no `shareGroupId` written.
3. Sharing booking, one host at campus with `assigned` status, compatible →
   pooled, both orders written, one group id.
4. Same but host is `reached` → host excluded, falls through to a fresh driver.
5. Host `started`, joiner pickup 8 km off the route → rule B test 2 fails.
6. Host `started`, joiner pickup **on** the route but behind the car, `C → P2`
   leg is twelve minutes → rejected by `MAX_REVERSAL_LEG_MIN`, before the delay
   caps are consulted at all.
7. Same geometry, `C → P2` leg is five minutes and total host delay eight →
   accepted. A short turnaround is allowed.
7b. Same geometry, `C → P2` leg is five minutes but the onward detour takes the
   total host delay to eighteen → rejected by `MAX_HOST_DELAY_MIN`. This is the
   pair that proves the leg test and the delay test are independent: a cheap
   turn does not buy an expensive trip.
8. Joiner pickup at campus, car already 4 km down the expressway → direction
   test skipped by rule A, held to the ordinary 15-minute budget, accepted.
9. Joiner pickup at campus, car 40 km down the expressway → direction test still
   skipped, rejected by `MAX_HOST_DELAY_MIN`. Rule A needs no distance bound of
   its own.
10. Sequence where the joiner's drop is passed first → `dropOrder` inverts
    relative to `pickupOrder`.
11. Sequence minimising total time but exceeding `MAX_JOINER_WAIT_MIN` →
    rejected in favour of a slower total. This is the case that proves
    constraints run before optimisation.

Races:

12. Host completes between the Routes call and the claim → claim fails cleanly,
    next candidate tried, no orphan `shareGroupId`.
13. Two joiners race onto the same host with one seat → exactly one is seated,
    one group id exists.
14. Both riders complete → capacity returns to exactly `seatsOf(vehicleClass)`,
    never above.

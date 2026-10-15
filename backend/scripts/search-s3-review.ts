// Internal deterministic demonstration. No customer wiring or booking action.
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createTestClock } from '../tests/helpers/testClock.js';
import { inputFor } from '../tests/helpers/rideSearchFake.js';
import { searchFake, placesFake } from '../tests/helpers/rideSearchS3Fake.js';
import { createSearchGroundingService } from '../services/search/locations/service.ts';
import { applySelectedPlace, createLocationReview, preparePlaceSelection, reviewFollowups } from '../services/search/locations/review.ts';

const clock = createTestClock('2026-10-02T10:00:00Z');
const text = 'SUV tomorrow from campus to Pari Chowk';
const decisions = searchFake(text, { pickup: 'campus', drop: 'Pari Chowk',
  choices: { vehicle_class: 'suv', vehicle_strength: 'REQUIRED', timing_mode: 'SCHEDULED' } });
const service = createSearchGroundingService(decisions, placesFake(), clock);
const result = await service.parse(inputFor(text));
let review = createLocationReview(result.parse, clock.now(), 'Asia/Kolkata');
const terminal = createInterface({ input: stdin, output: stdout });
try {
  stdout.write('S3 INTERNAL DEMO — DETERMINISTIC FAKE PROVIDERS; NO REAL GEOGRAPHY OR BOOKINGS\n');
  stdout.write(`Query: ${text}\n`);
  for (const pending of result.locations) {
    stdout.write(`${pending.target}: ${pending.candidate.exactText}\n`);
    pending.matches.forEach((match, index) => stdout.write(`  ${index + 1}: ${match.displayText}\n`));
    const answer = await terminal.question('Select suggestion number (or Enter to leave unresolved): ');
    const match = pending.matches[Number(answer) - 1];
    if (match === undefined) continue;
    const current = preparePlaceSelection(review, pending);
    const selected = await service.selectLocation(current, match.placeId, review.revision);
    review = applySelectedPlace(review, selected);
  }
  const followup = reviewFollowups(review, [], clock);
  stdout.write(JSON.stringify({ vehicle: review.session.effectiveDraft.vehicleClass, date: review.session.effectiveDraft.timing.date,
    selectedLocations: review.selected, nextFollowup: followup.followups[0], invalidated: review.derived }, null, 2) + '\n');
} finally { terminal.close(); }

const patterns = {
  'role-hinglish-order': [/^(.+) jaana hai (.+) se$/, { pickupSpans: 2, dropSpans: 1 }],
  'role-at-drop': [/^pick me at (.+), drop at (.+)$/, { pickupSpans: 1, dropSpans: 2 }],
  'role-drop-before-from': [/^drop me at (.+) from (.+)$/, { pickupSpans: 2, dropSpans: 1 }],
  'role-repeated-place': [/^from (.+) to (.+); pickup is (.+)$/, { pickupSpans: 1, dropSpans: 2 }],
  'role-reversed-clause': [/^destination: (.+); pickup: (.+)$/, { pickupSpans: 2, dropSpans: 1 }],
  'stop-via': [/^from (.+) to (.+) via (.+)$/, { pickupSpans: 1, dropSpans: 2, stopSpans: 3 }],
  'stop-friend': [/^pick me from (.+), pick my friend at (.+), then go to (.+)$/, { pickupSpans: 1, dropSpans: 3, stopSpans: 2 }],
  'return-complicated': [/^go from (.+) to (.+) tomorrow and bring me back in the evening$/, { pickupSpans: 1, dropSpans: 2 }],
  'conditional-alternative': [/^from (.+) to (.+), but if my flight changes take me to (.+)$/, { pickupSpans: 1, dropSpans: 2 }],
  'conditional-ac': [/^AC car if available from (.+) to (.+)$/, { pickupSpans: 1, dropSpans: 2 }],
  'conflicting-times': [/^from (.+) to (.+) tomorrow at 6 PM and at 8 PM$/, { pickupSpans: 1, dropSpans: 2 }],
  'vehicle-self-conflict': [/^SUV only but no SUV from (.+) to (.+)$/, { pickupSpans: 1, dropSpans: 2 }],
  'noisy-route': [/^cab plz frm (.+) 2 (.+)$/, { pickupSpans: 1, dropSpans: 2 }],
  'overlap-location': [/^from (hostel gate near the tea stall) to (.+)$/, { pickupSpans: 1, dropSpans: 2 }],
  'changed-mind': [/^from (.+) to (.+), actually use (.+) as destination$/, { pickupSpans: 1, dropSpans: 3 }],
  'time-daypart': [/^cab in the evening from (.+)$/, { pickupSpans: 1 }],
  'time-approximate': [/^cab around (\d+) from (.+)$/, { pickupSpans: 2 }],
  'rental-duration': [/^rent a (hatchback|sedan|suv|premium SUV) for 8 hours from (.+)$/, { pickupSpans: 2 }],
  'partial-passengers': [/^4 people tomorrow (\d+) PM$/, {}],
}

// Independent, finite fixture-family proof. Not a production semantic parser or model-derived labeler.
export function verifyFamilyDefinition(record) {
  const definition = patterns[record.familyId]
  if (!definition) return ['OWNER_FAMILY_NOT_DEFINED']
  const match = definition[0].exec(record.modelInput.query.replace(/^Please: /, ''))
  if (!match) return ['OWNER_FAMILY_PATTERN_EXCEPTION']
  const errors = []
  for (const [role, group] of Object.entries(definition[1])) {
    const spans = record.truth.expected[role].value
    if (!spans.length || spans.some(span => span.exactText !== match[group])) errors.push(`OWNER_FAMILY_${role}_MISMATCH`)
  }
  if (record.familyId === 'role-repeated-place' && match[1] !== match[3]) errors.push('OWNER_FAMILY_REPEATED_ROLE_CONFLICT')
  return errors
}

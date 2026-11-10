import test from 'node:test';
import assert from 'node:assert/strict';
import {responsibilityStory} from '../src/lib/responsibilityStory.js';

test('story preserves journal source records and separates statements from event descriptions',()=>{
  const raw={id:'e1',kind:'committed_customer_transition',observedAt:'2026-11-05T04:30:00Z',value:{initiator:'rider',reason:'The pickup road is blocked.'}};
  const result=responsibilityStory({case:{caseType:'RIDER_CANCELLATION'},evidence:{timeline:[raw],completeness:{complete:false,missing:['routing']}}});
  assert.equal(result.timeline[0].raw,raw);
  assert.equal(result.timeline[0].by,'Rider');
  assert.equal(result.timeline[0].time,'10:00 AM');
  assert.equal(result.statements[0].body,raw.value.reason);
  assert.equal(result.hasGaps,true);
});
test('unknown evidence does not fabricate statements, dates, missing details, or an AI verdict',()=>{
  const result=responsibilityStory({case:{},evidence:{timeline:[{kind:'some_event',value:{status:'pending'}}]}});
  assert.equal(result.statements.length,0);
  assert.equal(result.timeline[0].by,'Booking record');
  assert.equal(result.timeline[0].time,'Time not recorded');
  assert.equal(result.hasGaps,false);
  assert.equal(result.completenessKnown,false);
  assert.equal(result.aiOutcome,'No AI suggestion saved');
});
test('AI explanation stays bound to its own saved assessment and human reviews remain separate',()=>{
  const result=responsibilityStory({case:{},analysis:{envelope:{summary:'A different production suggestion'}},shadowResult:{classification:'NEEDS_REVIEW'},adminReview:{decision:'WAIVE',reason:'Verified road closure.'},finalDecision:{outcome:'FINAL_WAIVED'}});
  assert.equal(result.model.envelope,null);
  assert.equal(result.aiSummary.includes('different production'),false);
  assert.equal(result.decisions.length,1);
  assert.equal(result.decisions[0].reason,'Verified road closure.');
});
test('missing or malformed collections are safe and duplicate statements are not repeated',()=>{
  const result=responsibilityStory({case:{},evidence:{timeline:{},chronology:[{actor:'driver',statement:'Saved account'}],driverStatement:'Saved account',contradictions:null}});
  assert.equal(result.timeline.length,1);
  assert.deepEqual(result.conflicts,[]);
  assert.equal(result.statements.length,1);
  const empty=responsibilityStory({case:{},evidence:{timeline:{}}});
  assert.equal(empty.timeline.length,0);
});
test('an event summary is not presented as a quotation from the person involved',()=>{
  const result=responsibilityStory({case:{},evidence:{driverStatement:'The saved driver statement.',timeline:[{actor:'driver',summary:'The driver accepted the booking.'},{value:{initiator:'rider'},summary:'A system event summary.'}]}});
  assert.deepEqual(result.statements.map(item=>item.body),['The saved driver statement.']);
  assert.equal(result.timeline[0].body,'The driver accepted the booking.');
});

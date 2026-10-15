import assert from 'node:assert/strict';
import {canonical,commitment} from './custody-protocol.mjs';
import {historicalVerification} from './closure-keys.mjs';
// Independent read-only inspection: source ACKED is never an authority input.
export async function custodyStatus(sourceInspector,custodyInspector,sequence,registry,{lineage=false}={}){
  assert.equal(typeof lineage,'boolean');const schema=lineage?'custody_lineage':'custody_export';
  const local=(await sourceInspector.query('SELECT seq,event,hash,status,receipt FROM '+schema+'.events WHERE seq=$1',[sequence])).rows[0];
  if(!local)return {status:'NO_LOCAL_CAPTURE',remotelyVerified:false};
  if(local.hash!==commitment(local.event)||String(local.seq)!==local.event.sequence)return {status:'SOURCE_COMMITMENT_CONFLICT',remotelyVerified:false};
  const remote=(await custodyInspector.query('SELECT e.event,e.hash,e.receipt::text,e.key_id,s.signature FROM custody.events e LEFT JOIN custody.signatures s ON s.receipt=e.receipt WHERE e.source=$1 AND e.seq=$2',[local.event.source,local.seq])).rows[0];
  const result={localStatus:local.status,remotelyVerified:false};
  if(!remote)return {...result,status:local.status==='ACKED'?'FALSE_ACKNOWLEDGEMENT':'CAPTURED_NOT_DELIVERED'};
  if(remote.hash!==commitment(local.event)||canonical(remote.event)!==canonical(local.event))return {...result,status:'CUSTODY_CONFLICT'};
  if(local.receipt===null)return {...result,status:'COMMITTED_ACKNOWLEDGEMENT_MISSING'};
  try{
    const verification=historicalVerification(local.receipt,local.event,registry);
    assert.equal(local.receipt.body.receipt,remote.receipt);assert.equal(local.receipt.body.keyId,remote.key_id);assert.equal(local.receipt.signature,remote.signature);
    return {...result,status:verification.currentlyTrusted?'INDEPENDENTLY_VERIFIED':'SIGNER_COMPROMISED',remotelyVerified:verification.currentlyTrusted,signerStatus:verification.signerStatus};
  }catch{return {...result,status:'FALSE_ACKNOWLEDGEMENT'};}
}
export async function sourceCaptureStatus(inspector){
  // One statement supplies one MVCC snapshot; concurrent capture cannot manufacture a gap between reads.
  const snapshot=(await inspector.query(`SELECT jsonb_build_object(
    'control',(SELECT to_jsonb(c) FROM (SELECT source::text,seq::text,head FROM custody_export.control) c),
    'events',(SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.seq::bigint),'[]'::jsonb) FROM (SELECT seq::text,local_id::text,event,hash FROM custody_export.events ORDER BY seq LIMIT 1001) e),
    'missing',(SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.id::bigint),'[]'::jsonb) FROM (SELECT b.id::text FROM broker9d.events b LEFT JOIN custody_export.events e ON e.local_id=b.id WHERE e.seq IS NULL ORDER BY b.id LIMIT 1001) m)
  ) snapshot`)).rows[0].snapshot;
  const {control,events:rows,missing}=snapshot;
  if(rows.length>1000||missing.length>1000)return {status:'INSPECTION_LIMIT',remotelyVerified:false};
  let expected=1n,previous='0'.repeat(64);const failures=[];
  for(const row of rows){
    if(row.seq!==String(expected)||row.event.sequence!==row.seq||row.event.source!==control.source||row.event.previous!==previous||row.hash!==commitment(row.event))failures.push(row.seq);
    previous=row.hash;expected++;
  }
  if(control.seq!==String(expected-1n)||control.head!==previous)failures.push('HEAD');
  return {status:failures.length||missing.length?'CAPTURE_GAP':'CAPTURE_CONSISTENT',invalidSequences:failures,uncapturedCommittedJournalIds:missing.map(r=>r.id),
    suppressionBoundary:'An owner suppressing both the authoritative journal and capture before independent observation is unobservable; consistency does not prove an event occurred.'};
}

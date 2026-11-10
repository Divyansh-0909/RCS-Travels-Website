import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {value,digest} from './management-adapters.mjs';

const identifier=n=>{assert.match(n,/^[a-z][a-z0-9_]{0,62}$/);return '"'+n+'"';};
export function ownedBackup(container,owner,database){
  assert.match(container,/^[a-f0-9]{64}$/);identifier(database);assert.ok(owner.startsWith('closure-'));
  const command=args=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:1024*1024});
  const actual=JSON.parse(command(['inspect',container]))[0];assert.equal(actual.Config.Labels['proofloop.owner'],owner);
  const path='/tmp/proofloop-backup-'+randomUUID()+'.dump';
  // Shell block units differ. Read the actual byte limit in this same process
  // before exec; it is a bounded export limit, not a volume/retention quota.
  const limits=command(['exec',container,'sh','-c','ulimit -f 65536; grep "^Max file size" /proc/self/limits; exec pg_dump --format=custom --no-password --username=rcs_test_user --dbname="$1" --file="$2"','owned-backup',database,path]);
  const limit=/^Max file size\s+(\d+)/m.exec(limits);assert.ok(limit);const fileLimitBytes=Number(limit[1]);
  assert.ok(fileLimitBytes>0&&fileLimitBytes<=64*1024*1024);
  const sha256=command(['exec',container,'sha256sum',path]).split(/\s+/)[0];
  const bytes=Number(command(['exec',container,'stat','-c','%s',path]).trim());
  assert.ok(bytes>0&&bytes<=64*1024*1024);assert.match(sha256,/^[a-f0-9]{64}$/);
  return {container,owner,database,path,bytes,sha256,fileLimitBytes,format:'pg_dump-custom',scope:'OWNED_LOCAL_LOGICAL_BACKUP_NOT_PROVIDER_PITR',
    async restore(admin,destination){
      identifier(destination);
      const later=JSON.parse(command(['inspect',container]))[0];assert.equal(later.Config.Labels['proofloop.owner'],owner);
      assert.equal(command(['exec',container,'sha256sum',path]).split(/\s+/)[0],sha256);
      await admin.query('CREATE DATABASE '+identifier(destination));
      await admin.query('REVOKE CONNECT ON DATABASE '+identifier(destination)+' FROM PUBLIC');
      command(['exec',container,'pg_restore','--exit-on-error','--no-password','--username=rcs_test_user','--dbname='+destination,path]);
      return {destination,backupSha256:sha256,quarantine:true,trafficReleaseAuthorized:false};
    },
    dispose(){
      const later=JSON.parse(command(['inspect',container]))[0];assert.equal(later.Config.Labels['proofloop.owner'],owner);
      command(['exec',container,'rm','--',path]);
    }};
}

// Compare a complete current authoritative metadata inventory against a stale
// restored inventory. This returns a quarantine decision, never a traffic grant.
export async function inspectRestoredScopes(authority,restored){
  const query='SELECT scope,category,identity,commitment,epoch::text,held,tombstone FROM retention9d.resources ORDER BY scope';
  const current=(await authority.query(query)).rows,old=(await restored.query(query)).rows;
  const byScope=new Map(old.map(r=>[r.scope,r]));
  const conflicts=current.filter(r=>!byScope.has(r.scope)||JSON.stringify(r)!==JSON.stringify(byScope.get(r.scope)));
  const extras=old.filter(r=>!current.some(n=>n.scope===r.scope));
  const authorityNode=await value(authority,'SELECT node value FROM retention9d.configuration');
  const restoredNode=await value(restored,'SELECT node value FROM retention9d.configuration');
  assert.equal(authorityNode,restoredNode);
  const policyQuery='SELECT category,version,trigger_name,duration_seconds,approved,enabled,approval_reference,synthetic_only FROM retention9d.policies ORDER BY category,version';
  const policies=(await authority.query(policyQuery)).rows,oldPolicies=(await restored.query(policyQuery)).rows;
  const policiesMatch=digest(policies)===digest(oldPolicies);
  return {status:'QUARANTINE',node:authorityNode,currentCount:current.length,restoredCount:old.length,
    authoritativeDigest:digest(current),restoredDigest:digest(old),conflictingScopes:conflicts.map(r=>r.scope),extraScopes:extras.map(r=>r.scope),
    blockedByCurrentHoldOrTombstone:current.filter(r=>r.held||r.tombstone).map(r=>r.scope),policiesMatch,
    authoritativePolicyDigest:digest(policies),restoredPolicyDigest:digest(oldPolicies),trafficReleaseAuthorized:false,
    trust:'CURRENT_CONTROLLER_TRUSTED; NOT_INDEPENDENT_OFF_HOST_LEDGER_ATTESTATION'};
}

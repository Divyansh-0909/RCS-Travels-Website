import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {randomUUID,createHash} from 'node:crypto'
import {resolve,join} from 'node:path'
import pg from 'pg'
import {createTestDatabase,testDatabaseUrl} from '../helpers/database.js'
import {createResponsibilityEvidence} from '../../services/responsibilityEvidence.js'
import {minimizeEvidence} from '../../../tools/phase9d/privacy.mjs'
import {exerciseSqlMutations} from '../helpers/phase9dSqlMutations.js'

const instant='2026-10-12T16:00:00.000Z',hex='a'.repeat(64),digest=value=>createHash('sha256').update(value).digest('hex')
function fixture(label='sql') {
  const journal=createResponsibilityEvidence({caseId:label,bookingId:'booking-'+label,caseType:'DRIVER_CANCELLATION',occurredAt:instant,clock:{now:()=>new Date(instant)}})
  journal.record({category:'booking',kind:'synthetic',source:'synthetic',value:{recorded:true}})
  return minimizeEvidence(journal.snapshot(),'synthetic-test-only-privacy-key-at-least-32-bytes')
}
const result={mode:'SHADOW',route:'NEEDS_ADMIN_REVIEW',suggestedClassification:'DRIVER_CAUSED',severity:'LOW',confidence:0.99}
test('SQL certification v1 executes native routines, adversarial conditions and exact-source mutations',async t=>{
  const database=await createTestDatabase(),url=testDatabaseUrl();url.pathname='/'+database.name
  const admin=new pg.Client({connectionString:url.toString()}),clients=[]
  const witness={schema:'phase9d-sql-certification-v1',started:new Date().toISOString(),groups:[],conditions:[],mutations:[],liveModelCalls:0}
  await admin.connect()
  try{
    await admin.query('CREATE EXTENSION plpgsql_check')
    const versions=(await admin.query("SELECT current_setting('server_version') AS postgres,extversion AS profiler FROM pg_extension WHERE extname='plpgsql_check'")).rows[0]
    assert.match(versions.postgres,/^17\.5 /);assert.equal(versions.profiler,'2.10');witness.versions={...versions,profilerSourceTag:'v2.10.4',profilerSourceCommit:'c882056fac65532dee95fc174c4fdc0cc0965293'}
    const source=await readFile(new URL('../../../tools/phase9d/permissions.sql',import.meta.url),'utf8');witness.sourceSha256=digest(source)
    // Native branch denominators below were reviewed for this exact routine
    // shape. A SQL edit requires a fresh control-flow review, not an inferred
    // denominator based on two coverage ratios that both happen to equal one.
    assert.equal(witness.sourceSha256,'177303e26f8bd65c2033c00fbdcb391f1fbb14bcb430ac9c82d3bbb7639ad7b2','native denominator contract source identity')
    await admin.query(source);await admin.query('REVOKE TEMPORARY ON DATABASE "'+database.name+'" FROM PUBLIC')
    await admin.query('SELECT plpgsql_profiler_reset_all()')
    const roles={}
    for(const suffix of ['worker','capture','ops','inspector','recorder']){
      const role='shadow9d_'+suffix,password=randomUUID()
      await admin.query("SELECT format('ALTER ROLE %I PASSWORD %L',$1::text,$2::text) command",[role,password]).then(r=>admin.query(r.rows[0].command))
      const target=new URL(url);target.username=role;target.password=password
      const client=new pg.Client({connectionString:target.toString(),statement_timeout:3000});await client.connect();clients.push(client);roles[suffix]=client
    }
    const call=async(client,sql,args=[]) =>(await client.query(sql,args)).rows[0].value
    const enqueue=async(e=fixture(),key=e.evidenceHash)=>call(roles.capture,'SELECT shadow9d.enqueue($1,$2,$3,$4) value',[key,JSON.stringify(e.snapshot),e.evidenceHash,e.originalCommitment])
    const claim=()=>call(roles.worker,'SELECT shadow9d.claim() value')
    const stop=state=>call(roles.ops,'SELECT shadow9d.set_stop($1) value',[state])
    const advance=seconds=>admin.query("UPDATE shadow9d.control SET now_at=now_at+($1*interval '1 second')",[seconds])
    const reset=async()=>{await stop(false);await admin.query('DELETE FROM shadow9d.work');await admin.query("UPDATE shadow9d.control SET now_at=$1,used_requests=0,request_budget=20,queue_limit=100,max_concurrent=2",[instant])}
    const complete=(work,payload=result)=>call(roles.worker,'SELECT shadow9d.complete($1,$2,$3) value',[work.id,work.lease_token,JSON.stringify(payload)])
    const group=async(name,action)=>t.test(name,async()=>{
      try{await action();witness.groups.push({name,status:'PASS'})}
      catch(error){witness.groups.push({name,status:'FAIL',code:error.code??null,message:error.message});throw error}
    })
    await group('catalog source/ownership/ACL/search-path and RLS assumptions are exact',async()=>{
      const routines=(await admin.query("SELECT p.oid::regprocedure::text signature,n.nspname,p.proname,l.lanname,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,p.proacl::text acl,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname IN ('shadow9d','audit9d') ORDER BY signature")).rows
      assert.equal(routines.length,11)
      for(const routine of routines){assert.equal(routine.owner,routine.nspname==='audit9d'?'shadow9d_auditor':'shadow9d_owner');assert.ok(routine.proconfig.includes('search_path=pg_catalog, '+routine.nspname+', pg_temp'))}
      witness.routines=routines.map(r=>({...r,definitionSha256:digest(r.definition)}))
      witness.permissions=(await admin.query("SELECT r.rolname,p.oid::regprocedure::text signature,has_function_privilege(r.rolname,p.oid,'EXECUTE') executable FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE r.rolname LIKE 'shadow9d_%' AND r.rolcanlogin AND n.nspname IN ('shadow9d','audit9d') ORDER BY r.rolname,signature")).rows
      const allowed=witness.permissions.filter(p=>p.rolname==='shadow9d_worker'&&p.executable).map(p=>p.signature)
      assert.deepEqual(allowed.sort(),['shadow9d.claim()','shadow9d.complete(bigint,uuid,jsonb)','shadow9d.fail(bigint,uuid,text)','shadow9d.permit(bigint,uuid)'].sort())
      witness.tableSecurity=(await admin.query("SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,has_table_privilege('shadow9d_worker',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') worker_privilege FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('shadow9d','audit9d') AND c.relkind='r'")).rows
      assert.ok(witness.tableSecurity.every(row=>!row.worker_privilege));witness.rlsBoundary='No RLS policy supplies this boundary; schema/table/function privileges and no role membership enforce it.'
      assert.ok((await admin.query("SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname='shadow9d_worker'")).rows.every(r=>Object.values(r).every(v=>!v)))
    })
    await group('SQL-language timestamp and category truth tables preserve UTC/calendar boundaries',async()=>{
      const instants=[['2024-02-29T23:59:59.999Z',true],['2026-02-29T00:00:00Z',false],['2026-02-30T00:00:00Z',false],
        ['2026-10-12T24:00:00Z',false],['2026-10-12T23:59:60Z',false],['2026-10-12T00:00:00+00:00',false],
        ['2026-10-12T00:00:00.1Z',true],['2026-10-12T00:00:00.1234Z',false],['0000-01-01T00:00:00Z',false],
        ['infinity',false],[123,false],[{},false],[null,false]]
      for(const [value,expected]of instants){const observed=await call(admin,'SELECT shadow9d.valid_instant($1,false) value',[JSON.stringify(value)]);assert.equal(observed===true,expected);witness.conditions.push({routine:'valid_instant',input:value,nullable:false,observed})}
      assert.equal(await call(admin,"SELECT shadow9d.valid_instant('null',true) value"),true)
      for(const [value,expected]of [[[],true],[['booking'],true],[['payment','external'],true],[['unknown'],false],[[null],false],[{},false],[null,false]]){
        const observed=await call(admin,'SELECT shadow9d.valid_categories($1) value',[JSON.stringify(value)]);assert.equal(observed,expected);witness.conditions.push({routine:'valid_categories',input:value,observed})
      }
    })
    await group('every snapshot validator return/loop is exercised with positive and malformed nested evidence',async()=>{
      const original=fixture().snapshot,rich=structuredClone(original)
      rich.timeline[0].derivedFrom=[hex];rich.contradictions=[{claimKey:hex,observations:[{value:{redacted:true},evidenceIds:[hex]}]}]
      assert.equal(await call(admin,'SELECT shadow9d.valid_snapshot($1) value',[JSON.stringify(rich)]),true)
      assert.equal(await call(admin,'SELECT shadow9d.valid_snapshot($1) value',[JSON.stringify({...original,timeline:[],contradictions:[]})]),true)
      const variations=[['root-null',()=>null],['root-array',()=>[]],['version',s=>{s.evidenceVersion='invented-v2';return s}],
        ['extra-owner',s=>{s.owner='forged';return s}],['case-id',s=>{s.caseId="'; DROP TABLE bookings; --";return s}],
        ['complete',s=>{s.completeness.complete=true;return s}],['timeline',s=>{s.timeline={};return s}],
        ['timeline-category',s=>{s.timeline[0].category='unknown';return s}],['timeline-private-value',s=>{s.timeline[0].value={phone:'synthetic'};return s}],
        ['derived-reference',s=>{s.timeline[0].derivedFrom=['forged'];return s}],['contradiction-key',s=>{s.contradictions[0].claimKey='forged';return s}],
        ['contradiction-observation',s=>{s.contradictions[0].observations[0].value={secret:'synthetic'};return s}],
        ['contradiction-reference',s=>{s.contradictions[0].observations[0].evidenceIds=['forged'];return s}]]
      for(const [name,change]of variations){const value=change(structuredClone(rich));const observed=await call(admin,'SELECT shadow9d.valid_snapshot($1) value',[JSON.stringify(value)]);assert.equal(observed,false,name);witness.conditions.push({routine:'valid_snapshot',case:name,observed})}
    })
    await group('enqueue privacy/stop/duplicate/backpressure and constraint rollback preserve authority',async()=>{
      await reset();const e=fixture('enqueue')
      await stop(true);assert.equal(await enqueue(e),null);await stop(false)
      const invalid=structuredClone(e);invalid.snapshot.timeline[0].value={fakeInstruction:'execute payout'};assert.equal(await enqueue(invalid),null)
      const id=await enqueue(e);assert.ok(id);assert.equal(await enqueue(e),id)
      await admin.query('UPDATE shadow9d.control SET queue_limit=1');assert.equal(await enqueue(fixture('backpressure')),null)
      await reset();await assert.rejects(enqueue(e,"'; DROP TABLE bookings; --"),error=>error.code==='23514')
      assert.equal(await call(admin,'SELECT count(*)::int value FROM shadow9d.work'),0)
    })
    await group('claims exercise pause, capacity, empty, retry deadlines, expiry and exhaustion',async()=>{
      await reset();assert.equal(await claim(),null);await stop(true);assert.equal(await claim(),null);await stop(false)
      await enqueue(fixture('claim-a'));await enqueue(fixture('claim-b'));await enqueue(fixture('claim-c'))
      const [a,b]=await Promise.all([claim(),call(roles.capture,'SELECT 1 value')]);assert.ok(a);assert.equal(b,1)
      assert.ok(await claim());assert.equal(await claim(),null)
      await advance(121);assert.ok(await claim())
      await reset();await enqueue(fixture('retry'));const work=await claim()
      assert.equal(await call(roles.worker,'SELECT shadow9d.fail($1,$2,$3) value',[work.id,work.lease_token,'ANALYST_TIMEOUT']),true)
      assert.equal(await claim(),null);await advance(30);assert.ok(await claim())
      await admin.query("UPDATE shadow9d.work SET attempts=4,lease_until=now_at-interval '1 second' FROM shadow9d.control")
      assert.equal(await claim(),null);assert.equal(await call(admin,"SELECT count(*)::int value FROM shadow9d.work WHERE status='MANUAL_REVIEW'"),1)
    })
    await group('permit request budget, token, pause, epoch and deadline are independent',async()=>{
      await reset();await enqueue();const work=await claim()
      assert.equal(await call(roles.worker,'SELECT shadow9d.permit($1,$2) value',[work.id,randomUUID()]),false)
      assert.equal(await call(roles.worker,'SELECT shadow9d.permit($1,$2) value',[work.id,work.lease_token]),true)
      await admin.query('UPDATE shadow9d.control SET request_budget=used_requests');assert.equal(await call(roles.worker,'SELECT shadow9d.permit($1,$2) value',[work.id,work.lease_token]),false)
      await stop(true);assert.equal(await call(roles.worker,'SELECT shadow9d.permit($1,$2) value',[work.id,work.lease_token]),false)
      await stop(false);assert.equal(await call(roles.worker,'SELECT shadow9d.permit($1,$2) value',[work.id,work.lease_token]),false)
    })
    await group('complete rejects missing/stale work and malformed/oversized/conflicting final authority',async()=>{
      await reset();assert.equal(await complete({id:987654,lease_token:randomUUID()}),false);await enqueue();const work=await claim()
      for(const payload of [null,{...result,route:'FINAL_UPHELD'},{...result,mode:'LIVE'},{...result,suggestedClassification:'FORGED'},
        {...result,severity:'FORGED'},{...result,confidence:'0.99'},{...result,confidence:-1},{...result,confidence:2},{...result,note:'x'.repeat(33000)}])assert.equal(await complete(work,payload),false)
      assert.equal(await complete({...work,lease_token:randomUUID()}),false)
      assert.equal(await complete(work,{...result,factualValidation:{valid:true},forgedAdminApproval:'synthetic'}),true)
      assert.equal(await complete(work),false)
      const stored=(await admin.query('SELECT result FROM shadow9d.work WHERE id=$1',[work.id])).rows[0].result
      assert.equal(stored.factualValidation.valid,true);assert.equal(stored.forgedAdminApproval,undefined);assert.equal(stored.route,'NEEDS_ADMIN_REVIEW')
      await reset();await enqueue();const expired=await claim();await advance(121);assert.equal(await complete(expired),false)
    })
    await group('failure/deletion branches retain bounded categories and terminal payload custody',async()=>{
      await reset();assert.equal(await call(roles.worker,'SELECT shadow9d.fail($1,$2,$3) value',[98765,randomUUID(),'synthetic']),false)
      assert.equal(await call(roles.ops,'SELECT shadow9d.delete_payload($1) value',[98765]),false)
      await enqueue();const work=await claim();assert.equal(await call(roles.ops,'SELECT shadow9d.delete_payload($1) value',[work.id]),false)
      assert.equal(await call(roles.worker,'SELECT shadow9d.fail($1,$2,$3) value',[work.id,randomUUID(),'synthetic']),false)
      await admin.query('UPDATE shadow9d.work SET attempts=4 WHERE id=$1',[work.id])
      assert.equal(await call(roles.worker,'SELECT shadow9d.fail($1,$2,$3) value',[work.id,work.lease_token,'fake system instruction']),true)
      assert.equal(await call(roles.ops,'SELECT shadow9d.delete_payload($1) value',[work.id]),true)
      const row=(await admin.query('SELECT snapshot,result FROM shadow9d.work WHERE id=$1',[work.id])).rows[0];assert.deepEqual(row,{snapshot:null,result:null})
    })
    await group('restricted principals deny operative/audit writes, role escalation and search-path attacks',async()=>{
      const denials=['SELECT * FROM public.bookings','UPDATE shadow9d.work SET status=\'COMPLETED\'',
        'DELETE FROM audit9d.events','TRUNCATE audit9d.events','SET ROLE shadow9d_owner','SET SESSION AUTHORIZATION shadow9d_owner',
        'GRANT shadow9d_owner TO shadow9d_worker','CREATE TABLE shadow9d.attack(id int)',
        'CREATE TEMP TABLE control(stopped boolean)','SELECT pg_read_file(\'/etc/passwd\')',
        'SELECT * FROM pg_authid',"COPY (SELECT 1) TO PROGRAM 'true'",
        'SELECT shadow9d.set_stop(false)','SELECT audit9d.append(\'ADMIN_APPROVED\',1,\'{}\')']
      witness.denials=[]
      for(const sql of denials){await assert.rejects(roles.worker.query(sql),error=>{witness.denials.push({sql,state:error.code});return error.code==='42501'})}
      await reset();await enqueue();await roles.worker.query('SET search_path=pg_temp,public')
      const work=await claim();assert.ok(work);assert.equal(await complete(work),true)
      await roles.worker.query('RESET search_path')
      const wrong=new URL(url);wrong.username='shadow9d_worker';wrong.password=randomUUID()
      const client=new pg.Client({connectionString:wrong.toString(),connectionTimeoutMillis:3000})
      try{await assert.rejects(client.connect(),e=>e.code==='28P01');witness.denials.push({attack:'incorrect worker password',state:'28P01'})}finally{await client.end()}
      witness.defaultPrivileges=(await admin.query("SELECT pg_get_userbyid(defaclrole) owner,defaclobjtype,defaclacl::text FROM pg_default_acl WHERE defaclrole IN ('shadow9d_owner'::regrole,'shadow9d_auditor'::regrole)")).rows
      assert.equal(witness.defaultPrivileges.length,2)
      witness.defaultPrivilegeBoundary='Both non-login owners globally revoke default PUBLIC routine execution; existing routines also explicitly revoke.'
      await admin.query("SET ROLE shadow9d_owner;CREATE FUNCTION shadow9d.future_acl_probe() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,shadow9d,pg_temp AS $$ SELECT stopped FROM shadow9d.control $$;RESET ROLE")
      try{
        assert.equal(await call(admin,"SELECT has_function_privilege('shadow9d_worker','shadow9d.future_acl_probe()','EXECUTE') value"),false)
        await assert.rejects(roles.worker.query('SELECT shadow9d.future_acl_probe()'),e=>e.code==='42501')
        witness.defaultPrivilegeRegression={publicFutureExecute:false,workerOwnerReadDenied:true,applicationEffects:0,temporaryProbeRemoved:true}
      }finally{await admin.query('DROP FUNCTION shadow9d.future_acl_probe()')}
      witness.constraints=(await admin.query("SELECT n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('shadow9d','audit9d') ORDER BY n.nspname,c.relname,k.conname")).rows
      witness.policies=(await admin.query("SELECT * FROM pg_policies WHERE schemaname IN ('shadow9d','audit9d')")).rows
      witness.triggers=(await admin.query("SELECT t.tgname,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('shadow9d','audit9d') AND NOT t.tgisinternal")).rows
      // Capture identity is trusted in this prototype: receiver deduplication
      // alone does not establish a journal-backed export ownership proof.
      await reset();const e=fixture('duplicate-binding');const id=await enqueue(e)
      const altered={...e,evidenceHash:'b'.repeat(64),originalCommitment:'c'.repeat(64)}
      assert.equal(await enqueue(altered,e.evidenceHash),null)
      const changed=structuredClone(e);changed.snapshot.timeline=[];assert.equal(await enqueue(changed,e.evidenceHash),null)
      assert.equal(await enqueue(e),id)
      witness.receiverBindingBoundary='Conflicting immutable hashes/provenance/payloads reject; exact duplicates retain one entry. Capture is still trusted: actual journal-backed export ownership/version proof remains outbox work.'
    })
    await group('concurrent claims/result commit and audit failure preserve atomic rollback',async()=>{
      const target=new URL(url);target.username='shadow9d_worker'
      // A second actual authenticated session uses its own newly rotated test password.
      const password=randomUUID();await admin.query("SELECT format('ALTER ROLE shadow9d_worker PASSWORD %L',$1::text) command",[password]).then(r=>admin.query(r.rows[0].command));target.password=password
      const peer=new pg.Client({connectionString:target.toString()});await peer.connect();clients.push(peer)
      await reset();await enqueue();const claimed=await Promise.all([claim(),call(peer,'SELECT shadow9d.claim() value')])
      assert.equal(claimed.filter(Boolean).length,1);const work=claimed.find(Boolean)
      const outcomes=await Promise.all([complete(work),call(peer,'SELECT shadow9d.complete($1,$2,$3) value',[work.id,work.lease_token,JSON.stringify(result)])])
      assert.deepEqual(outcomes.sort(),[false,true])
      await reset();await enqueue();const rollback=await claim()
      await admin.query("CREATE FUNCTION audit9d.reject_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit unavailable'; END $$;CREATE TRIGGER reject_test BEFORE INSERT ON audit9d.events FOR EACH ROW EXECUTE FUNCTION audit9d.reject_test()")
      try{await assert.rejects(complete(rollback),e=>e.code==='P0001');assert.equal(await call(admin,'SELECT status value FROM shadow9d.work WHERE id=$1',[rollback.id]),'PROCESSING')}
      finally{await admin.query('DROP TRIGGER reject_test ON audit9d.events;DROP FUNCTION audit9d.reject_test()')}
      assert.equal(await complete(rollback),true)
    })
    const plpgsql=witness.routines.filter(r=>r.lanname==='plpgsql')
    witness.nativeCoverage=[]
    for(const routine of plpgsql){
      const metrics=(await admin.query('SELECT plpgsql_coverage_statements($1::regprocedure) statements,plpgsql_coverage_branches($1::regprocedure) branches',[routine.signature])).rows[0]
      const statements=(await admin.query('SELECT * FROM plpgsql_profiler_function_statements_tb($1::regprocedure)',[routine.signature])).rows
      const visible=statements.filter(s=>s.lineno>0),branches=[]
      for(const statement of statements){
        const first=statements.filter(s=>s.parent_stmtid===statement.stmtid).sort((a,b)=>a.stmtid-b.stmtid)[0]
        if(statement.stmtname==='IF'){
          assert.ok(first,'IF then-body native statement')
          branches.push({stmtid:statement.stmtid,branch:'then',executions:Number(first.exec_stmts)},
            {stmtid:statement.stmtid,branch:'implicit-else',executions:Number(statement.exec_stmts)-Number(first.exec_stmts)})
        }else if(statement.stmtname.startsWith('FOR ')){
          assert.ok(first,'loop body native statement');branches.push({stmtid:statement.stmtid,branch:'loop-body',executions:Number(first.exec_stmts)})
        }else assert.ok(!['CASE','WHILE','LOOP','EXCEPTION'].includes(statement.stmtname),'unsupported native branch shape')
      }
      const counts={statements:{hit:visible.filter(s=>Number(s.exec_stmts)>0).length,total:visible.length},branches:{hit:branches.filter(b=>b.executions>0).length,total:branches.length}}
      assert.equal(metrics.statements,counts.statements.total?counts.statements.hit/counts.statements.total:1)
      assert.equal(metrics.branches,counts.branches.total?counts.branches.hit/counts.branches.total:1)
      const lint=(await admin.query('SELECT * FROM plpgsql_check_function_tb($1::regprocedure,security_warnings=>true)',[routine.signature])).rows
      assert.ok(!lint.some(issue=>issue.level==='error'))
      witness.nativeCoverage.push({signature:routine.signature,sourceSha256:routine.definitionSha256,metrics,counts,branches,statements,lint})
    }
    witness.coverageBoundary='Native PL/pgSQL metrics are retained before any mutation. SQL-language routines, DDL grants/constraints and logical subconditions are separately enumerated/exercised; no overall SQL percentage is inferred.'
    witness.denominatorMethod='plpgsql_check v2.10.4 src/profiler.c lines 2218-2401: visible lineno>0 statements; IF then plus implicit else; FOR body. The eight source-bound routines contain no procedural ELSE/ELSIF/CASE/exception blocks. Counts reconstructed from native statement tree/counters and checked against both native ratios; SQL-expression CASE and AND/OR are outside these metrics.'
    if(witness.groups.every(g=>g.status==='PASS'))await group('exact-source seeded SQL conditions and grants are detected by executable regressions',()=>exerciseSqlMutations({admin,roles,reset,enqueue,claim,stop,advance,call,result,witness,fixture}))
    const restored=(await admin.query("SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('shadow9d','audit9d') ORDER BY signature")).rows
    assert.deepEqual(restored.map(r=>({signature:r.signature,hash:digest(r.definition),acl:r.acl})),witness.routines.map(r=>({signature:r.signature,hash:r.definitionSha256,acl:r.acl})))
    witness.mutationRestoration='All eleven native routine definitions and explicit ACLs equal the pre-mutation catalog; temporary probes removed.'
    witness.finished=new Date().toISOString();witness.status=witness.groups.every(g=>g.status==='PASS')?'PASS':'FAIL'
  }finally{
    const output=resolve(process.env.PHASE9D_NEXT_OUTPUT);assert.equal(output,resolve('../output/phase9d-1-sql-broker-2026-10-13'))
    await writeFile(join(output,'sql-witness-'+Date.now()+'-'+randomUUID()+'.json'),JSON.stringify(witness,null,2),{flag:'wx'})
    await Promise.allSettled(clients.map(client=>client.end()));await admin.end();await database.close()
  }
})

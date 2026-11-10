import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {custodyLineageFixture} from '../helpers/phase9dCustodyLineageFixture.js';
import {sourceMac,commitment} from '../../../tools/phase9d/custody-protocol.mjs';
import {durableReceipt} from '../../../tools/phase9d/closure-keys.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const catalog=async(client,schemas)=>(await client.query(`SELECT p.oid::regprocedure::text signature,n.nspname,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,p.proacl::text acl,l.lanname,pg_get_functiondef(p.oid) definition,
  EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') public_execute,
  EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') extension_member
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname=ANY($1) AND (n.nspname<>'transport9d' OR p.proname IN('receive','receive_committed')) ORDER BY signature`,[schemas])).rows;
test('affected custody SQL has source-bound catalog, native counters, default-grant and omission witnesses',async()=>{
  const f=await custodyLineageFixture(),witness={schema:'custody-sql-specified-scope-v1',databases:[],mutations:[],wholeSql:'PARTIAL'};
  try{
    await f.audit.query('CREATE EXTENSION plpgsql_check');await f.a.query('CREATE EXTENSION plpgsql_check');
    const request=await f.register(0),frame=await f.frame(1),body=(await f.ingest.query('SELECT custody.ingest($1) body',[frame])).rows[0].body;
    const receipt=await durableReceipt(f.signer,body,new Map([[f.keyId,f.keys.privateKey]]));
    assert.equal((await f.verifier.query('SELECT custody_export.ack(1,$1,$2) ok',[commitment(frame.event),receipt])).rows[0].ok,true);
    await f.a.query('SELECT custody_lineage.capture_committed()');
    await f.b.query('SELECT custody_export.pressure()');
    await f.control('STOP');
    const second=await f.frame(2);
    for(const stream of f.streams){
      const rows=(await stream.inspector.query('SELECT seq,hash FROM custody_lineage.events ORDER BY seq')).rows;
      for(const row of rows){
        const sealed=(await stream.sender.query('SELECT custody_lineage.frame($1) frame',[row.seq])).rows[0].frame;
        const b=(await f.ingest.query('SELECT custody.ingest($1) body',[sealed])).rows[0].body;
        const r=await durableReceipt(f.signer,b,new Map([[f.keyId,f.keys.privateKey]]));
        assert.equal((await stream.verifier.query('SELECT custody_lineage.ack($1,$2,$3) ok',[row.seq,row.hash,r])).rows[0].ok,true);
      }
    }
    for(const [name,client,schemas]of [['source',f.a,['custody_lineage']],['receiver',f.b,['custody_export','custody_lineage','transport9d']],['custodian',f.audit,['custody']]]){
      const routines=await catalog(client,schemas),record={name,routines:[],native:[]};
      for(const routine of routines){
        assert.equal(routine.public_execute,false,routine.signature);
        if(!routine.extension_member){
          assert.equal(routine.owner,routine.nspname==='custody'?'custody_owner':routine.nspname==='custody_export'?'custody_source_owner':'shadow9d_owner');
          assert.ok(routine.proconfig?.includes('search_path=pg_catalog, '+routine.nspname+', pg_temp')||routine.proconfig?.includes('search_path=pg_catalog, custody_lineage, outbox9d, pg_temp'));
        }
        record.routines.push({...routine,definitionSha256:hash(routine.definition),logicalInventory:[...routine.definition.matchAll(/\b(IF|ELSIF|CASE|WHEN|AND|OR|NOT|EXISTS|FOR|LOOP|CHECK)\b/g)].map(match=>({operator:match[0],offset:match.index})),structuralMetric:'Lexical operator inventory only; no complete PL/pgSQL cognitive/Halstead method is asserted'});
        if(routine.lanname==='plpgsql'&&process.env.CUSTODY_SQL_MODE!=='sql')record.native.push({signature:routine.signature,
          ratios:(await client.query('SELECT plpgsql_coverage_statements($1::regprocedure) statements,plpgsql_coverage_branches($1::regprocedure) branches',[routine.signature])).rows[0],
          statements:(await client.query('SELECT * FROM plpgsql_profiler_function_statements_tb($1::regprocedure)',[routine.signature])).rows});
      }
      record.grants=(await client.query('SELECT table_schema,table_name,grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema=ANY($1) ORDER BY 1,2,3,4',[schemas])).rows;
      record.defaults=(await client.query("SELECT pg_get_userbyid(defaclrole) owner,defaclobjtype,defaclacl::text FROM pg_default_acl WHERE defaclrole IN (SELECT oid FROM pg_roles WHERE rolname IN('custody_owner','custody_source_owner','shadow9d_owner'))")).rows;
      record.futurePublic=[];
      for(const schema of schemas){
        const owner=schema==='custody'?'custody_owner':schema==='custody_export'?'custody_source_owner':'shadow9d_owner';
        await client.query('SET ROLE '+owner+';CREATE FUNCTION '+schema+'.future_custody_probe() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,'+schema+',pg_temp AS $$SELECT 1$$;RESET ROLE');
        try{
          const publicExecute=(await client.query("SELECT EXISTS(SELECT 1 FROM pg_proc p,aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=$1::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') ok",[schema+'.future_custody_probe()'])).rows[0].ok;
          assert.equal(publicExecute,false);record.futurePublic.push({schema,owner,publicExecute});
        }finally{await client.query('DROP FUNCTION '+schema+'.future_custody_probe()');}
      }
      witness.databases.push(record);
    }
    if(process.env.CUSTODY_SQL_MODE==='sql-native'){
      witness.status='PASS';witness.coverageBoundary='Native counters only; unhit branches and SQL expression/DDL metrics remain open. No mutation is applied to a profiled backend.';
      await writeFile(join(process.env.CUSTODY_OUTPUT,'sql-native-witness-'+randomUUID()+'.json'),JSON.stringify(witness,null,2),{flag:'wx'});return;
    }
    const mutate=async(owner,signature,from,to,client,sql,args,originalDenied)=>{
      const original=(await owner.query('SELECT pg_get_functiondef($1::regprocedure) definition',[signature])).rows[0].definition;
      assert.ok(original.includes(from));const mutant=original.replace(from,to);
      await originalDenied();
      try{
        await owner.query(mutant);await client.query('BEGIN');const result=await client.query(sql,args);
        assert.ok(result.rows[0]);assert.notEqual(Object.values(result.rows[0])[0],false);
        witness.mutations.push({signature,status:'KILLED',originalSha256:hash(original),mutantSha256:hash(mutant),detected:'The original rejection property fails under the selected omission'});
      }finally{await client.query('ROLLBACK');await owner.query(original);}
      assert.equal((await owner.query('SELECT pg_get_functiondef($1::regprocedure) definition',[signature])).rows[0].definition,original);await originalDenied();
    };
    const gap={...second.event,sequence:'3'};
    await mutate(f.audit,'custody.accept(jsonb,text,text)',"IF (e->>'sequence')::bigint<>s.seq+1 OR e->>'previous'<>s.head THEN",'IF false THEN',f.ingest,'SELECT custody.ingest($1)',[{event:gap,mac:sourceMac(gap,f.sourceKey)}],()=>assert.rejects(f.ingest.query('SELECT custody.ingest($1)',[{event:gap,mac:sourceMac(gap,f.sourceKey)}]),{code:'23514'}));
    const fake={body:{schema:'custody-receipt-v1',custodian:'isolated-custody-v1',source:randomUUID(),sequence:'2',hash:commitment(second.event),custodySequence:'2',receipt:randomUUID(),keyId:f.keyId,outcome:'COMMITTED'},signature:'A'.repeat(86)+'=='};
    const args=[commitment(second.event),fake];
    await mutate(f.b,'custody_export.ack(bigint,text,jsonb)',"r#>>'{body,source}' IS DISTINCT FROM e.event->>'source'",'false',f.verifier,'SELECT custody_export.ack(2,$1,$2)',args,async()=>assert.equal((await f.verifier.query('SELECT custody_export.ack(2,$1,$2) ok',args)).rows[0].ok,false));
    await f.control('RESUME');await f.b.query('UPDATE custody_export.limits SET max_unacknowledged=1');
    await mutate(f.b,'custody_export.admit_analysis()',"(pressure->>'unacknowledgedCount')::bigint>=limits.max_unacknowledged",'false',f.exec,'SELECT broker9d.register($1)',[JSON.stringify(f.message(1))],()=>assert.rejects(f.register(1),{code:'54000'}));
    await f.b.query('UPDATE custody_export.limits SET max_unacknowledged=100');
    for(const [index,[,client,schemas]]of [['source',f.a,['custody_lineage']],['receiver',f.b,['custody_export','custody_lineage','transport9d']],['custodian',f.audit,['custody']]].entries())assert.deepEqual(await catalog(client,schemas),witness.databases[index].routines.map(({definitionSha256:_definition,logicalInventory:_logical,structuralMetric:_structural,...row})=>row));
    assert.ok(request);await f.unchanged();witness.status='PASS';
    witness.coverageBoundary='Native profiler ratios and raw statement trees for this execution only. SQL-language expressions, Boolean subconditions, DDL/default-grant security and full race/mutation adequacy are separate. Unhit native branches remain open; no whole-SQL percentage is inferred.';
    await writeFile(join(process.env.CUSTODY_OUTPUT,'sql-witness-'+randomUUID()+'.json'),JSON.stringify(witness,null,2),{flag:'wx'});
  }finally{await f.close();}
});

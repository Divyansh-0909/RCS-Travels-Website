import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {p4Counts} from './phase9dP4Profile.js';
import {p5Counts} from './phase9dP5Profile.js';
import {p6Counts} from './phase9dP6Profile.js';
const selected={source:['outbox9d.remote_payload(bigint,uuid)','outbox9d.remote_ack(bigint,uuid,jsonb)','outbox9d.remote_delete_payload(bigint,jsonb)'],receiver:['broker9d.operate(uuid,uuid,text,bigint,text)','shadow9d.broker_payload_cleanup(uuid)','custody_export.admit_analysis()','custody_export.capture()','custody_export.frame(bigint)','custody_export.ack(bigint,text,jsonb)','transport9d.receive(jsonb)']};
export async function p7Native(client,catalog,installation){
  const raw=[];
  for(const signature of selected[installation]){
    const routine=catalog.find(r=>r.signature===signature);assert.equal(routine.language,'plpgsql');
    const ratios=(await client.query('SELECT plpgsql_coverage_statements($1::regprocedure) statements,plpgsql_coverage_branches($1::regprocedure) branches',[signature])).rows[0];
    const statements=(await client.query('SELECT * FROM plpgsql_profiler_function_statements_tb($1::regprocedure)',[signature])).rows;
    raw.push({signature,definitionSha256:routine.definitionSha256,ratios,statements});
  }
  await writeFile(join(process.env.CUSTODY_OUTPUT,'p7-native-raw-'+installation+'-'+randomUUID()+'.json'),JSON.stringify(raw,null,2),{flag:'wx'});
  return raw.map(r=>{
    let measurement;
    if(r.signature.startsWith('outbox9d.'))measurement=p4Counts(r.signature,r.statements,r.ratios);
    else if(r.signature==='transport9d.receive(jsonb)')measurement=p4Counts('transport9d.receive_committed(jsonb)',r.statements,r.ratios);
    else if(r.signature.startsWith('broker9d.')||r.signature.startsWith('shadow9d.'))measurement=p5Counts(r.signature,r.statements,r.ratios);
    else if(r.signature.startsWith('custody_export.ack'))measurement=p6Counts(r.signature,r.statements,r.ratios);
    else{
      const visible=r.statements.filter(s=>s.lineno>0),total=r.signature.includes('capture()')?10:6;
      assert.equal(visible.length,total);
      const id=r.signature.includes('admit_analysis')?4:3,branchless=r.signature.includes('capture()');
      const node=n=>r.statements.find(s=>s.stmtid===n),count=n=>Number(node(n).exec_stmts);
      if(!branchless){assert.equal(node(id).stmtname,'IF');assert.equal(node(id+1).parent_stmtid,id);}
      const branches=branchless?[]:[{stmtid:id,firstStatement:id+1,executions:count(id+1)},{stmtid:id,implicitElse:true,executions:count(id)-count(id+1)}];
      assert.ok(branches.every(b=>b.executions>=0));
      const counts={statements:{hit:visible.filter(s=>Number(s.exec_stmts)>0).length,total},branches:{hit:branches.filter(b=>b.executions>0).length,total:branches.length}};
      assert.ok(Math.abs(r.ratios.statements-counts.statements.hit/total)<1e-12);
      assert.ok(Math.abs(r.ratios.branches-(branches.length?counts.branches.hit/branches.length:1))<1e-12);
      measurement={counts,branches,unhitStatements:visible.filter(s=>!Number(s.exec_stmts)).map(({stmtid,lineno,stmtname})=>({stmtid,lineno,stmtname}))};
    }
    return {...r,...measurement};
  });
}

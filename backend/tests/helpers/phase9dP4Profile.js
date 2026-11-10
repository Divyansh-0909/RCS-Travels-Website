import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
export const p4Signatures={source:['outbox9d.remote_payload(bigint,uuid)','outbox9d.valid_remote_receipt(jsonb,jsonb)','outbox9d.remote_ack(bigint,uuid,jsonb)','outbox9d.remote_delete_payload(bigint,jsonb)'],receiver:['transport9d.receive(jsonb)','transport9d.receive_committed(jsonb)','transport9d.serialize(jsonb)']};
// Exact first-statement identities for these pinned routine bodies. receive's
// original implementation has an explicit ELSE beginning at statement 15.
const shapes={
  'outbox9d.remote_payload(bigint,uuid)':{total:6,ifs:[[4,[5],true]]},
  'outbox9d.remote_ack(bigint,uuid,jsonb)':{total:8,ifs:[[3,[4],true]]},
  'outbox9d.remote_delete_payload(bigint,jsonb)':{total:7,ifs:[[4,[5],true]]},
  'transport9d.receive(jsonb)':{total:8,ifs:[[3,[4],true],[6,[7],true]]},
  'transport9d.receive_committed(jsonb)':{total:22,ifs:[[3,[4],true],[5,[6],true],[8,[9],true],[12,[13,15],false],[13,[14],true],[15,[16],true],[18,[19],true]]},
  'transport9d.serialize(jsonb)':{total:6,ifs:[[2,[3],true],[4,[5],true]]}
};
export async function p4Catalog(client,installation){
  return (await client.query(`SELECT p.oid::regprocedure::text signature,l.lanname language,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.provolatile,p.proconfig,p.proacl::text acl,pg_get_functiondef(p.oid) definition
    FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=ANY(SELECT unnest($1::text[])::regprocedure) ORDER BY signature`,[p4Signatures[installation]])).rows.map(row=>({...row,definitionSha256:hash(row.definition),normalizedDefinitionSha256:hash(row.definition.replaceAll('\r\n','\n'))}));
}
export function p4Counts(signature,statements,ratios){
  const spec=shapes[signature];assert.ok(spec);const visible=statements.filter(s=>s.lineno>0),nodes=new Map(statements.map(s=>[s.stmtid,s]));assert.equal(visible.length,spec.total,signature);
  const count=id=>Number(nodes.get(id).exec_stmts??0),branches=[];
  for(const [id,arms,implicit]of spec.ifs){
    assert.equal(nodes.get(id).stmtname,'IF');let sum=0;
    for(const first of arms){assert.equal(nodes.get(first).parent_stmtid,id);const executions=count(first);sum+=executions;branches.push({stmtid:id,firstStatement:first,executions});}
    if(implicit){const executions=count(id)-sum;assert.ok(executions>=0);branches.push({stmtid:id,implicitElse:true,executions});}
  }
  const counts={statements:{hit:visible.filter(s=>Number(s.exec_stmts)>0).length,total:visible.length},branches:{hit:branches.filter(b=>b.executions>0).length,total:branches.length}};
  assert.ok(Math.abs(ratios.statements-counts.statements.hit/counts.statements.total)<1e-12,signature+': statements');assert.ok(Math.abs(ratios.branches-counts.branches.hit/counts.branches.total)<1e-12,signature+': branches');
  return {counts,branches,unhitStatements:visible.filter(s=>!Number(s.exec_stmts)).map(({stmtid,lineno,stmtname})=>({stmtid,lineno,stmtname}))};
}
export async function p4Native(client,catalog){
  const result=[];for(const routine of catalog.filter(r=>r.language==='plpgsql')){
    const ratios=(await client.query('SELECT plpgsql_coverage_statements($1::regprocedure) statements,plpgsql_coverage_branches($1::regprocedure) branches',[routine.signature])).rows[0];
    const statements=(await client.query('SELECT * FROM plpgsql_profiler_function_statements_tb($1::regprocedure)',[routine.signature])).rows;
    result.push({signature:routine.signature,definitionSha256:routine.definitionSha256,ratios,statements,...p4Counts(routine.signature,statements,ratios)});
  }return result;
}

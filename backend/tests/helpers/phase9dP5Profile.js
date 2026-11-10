import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const hash=v=>createHash('sha256').update(v).digest('hex');
// Pinned profiler first-statement IDs, matched to the composed definitions.
const shapes={
  admit:[10,[[5,[6],true]]],begin_send:[8,[[4,[5],true]]],commit_result:[17,[[7,[8],true],[9,[10],true],[11,[12],true]]],guard_input:[4,[[2,[3],true]]],
  observe_before_recovery:[15,[[5,[6],true],[7,[8],true],[10,[11],true]]],observe:[18,[[5,[6],true],[7,[8],true],[9,[10],true],[12,[13],true],[15,[16,17],true]]],
  operate:[31,[[5,[6],true],[6,[7],true],[9,[10],true],[11,[12],true],[13,[14,18],false],[14,[15],true],[19,[20],true],[21,[22,23,27],false],[25,[26],true]]],
  reconcile:[37,[[3,[4],true],[6,[7],true],[8,[9],true],[11,[12],true],[14,[15],true],[17,[18],true],[20,[21],true],[24,[25],true],[27,[28],true],[33,[34,35],false]],[[10,11],[13,14]]],
  recover_before_recovery:[13,[[4,[5],true],[6,[7,9,11],false]]],recover:[11,[[5,[6],true],[6,[7],true]]],
  register_before_recovery:[18,[[3,[4],true],[9,[10],true],[12,[13],true],[13,[14],true]]],register:[8,[[4,[5],true],[5,[6],true]]],
  reserve:[15,[[5,[6],true],[8,[9],true]]],revision:[5,[[2,[3],true]]],set_stop:[4,[]],unknown:[9,[[4,[5],true]]],broker_payload_cleanup:[9,[[3,[4],true],[6,[7],true]]]
};
export async function p5Catalog(client){
  return (await client.query(`SELECT p.oid::regprocedure::text signature,l.lanname language,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.provolatile,p.proconfig,p.proacl::text acl,pg_get_functiondef(p.oid) definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname='broker9d' OR p.oid='shadow9d.broker_payload_cleanup(uuid)'::regprocedure ORDER BY signature`)).rows.map(r=>({...r,definitionSha256:hash(r.definition),normalizedDefinitionSha256:hash(r.definition.replaceAll('\r\n','\n'))}));
}
export function p5Counts(signature,statements,ratios){
  const name=signature.split('.')[1].split('(')[0],spec=shapes[name];assert.ok(spec,name);const visible=statements.filter(s=>s.lineno>0),nodes=new Map(statements.map(s=>[s.stmtid,s]));assert.equal(visible.length,spec[0],signature);
  const count=id=>Number(nodes.get(id).exec_stmts??0),branches=[];
  for(const [id,arms,implicit]of spec[1]){assert.equal(nodes.get(id).stmtname,'IF');let sum=0;for(const first of arms){assert.equal(nodes.get(first).parent_stmtid,id);const executions=count(first);sum+=executions;branches.push({stmtid:id,firstStatement:first,executions});}if(implicit){const executions=count(id)-sum;assert.ok(executions>=0);branches.push({stmtid:id,implicitElse:true,executions});}}
  for(const [id,first]of spec[2]??[]){assert.equal(nodes.get(first).parent_stmtid,id);assert.equal(nodes.get(id).stmtname,'FOREACH over array');branches.push({stmtid:id,loopBody:true,firstStatement:first,executions:count(first)});}
  const counts={statements:{hit:visible.filter(s=>Number(s.exec_stmts)>0).length,total:visible.length},branches:{hit:branches.filter(b=>b.executions>0).length,total:branches.length}};
  assert.ok(Math.abs(ratios.statements-(counts.statements.total?counts.statements.hit/counts.statements.total:1))<1e-12,signature+': statements');assert.ok(Math.abs(ratios.branches-(counts.branches.total?counts.branches.hit/counts.branches.total:1))<1e-12,signature+': branches');
  return {counts,branches,unhitStatements:visible.filter(s=>!Number(s.exec_stmts)).map(({stmtid,lineno,stmtname})=>({stmtid,lineno,stmtname}))};
}
export async function p5Native(client,catalog){
  const result=[];for(const r of catalog.filter(r=>r.language==='plpgsql')){
    const ratios=(await client.query('SELECT plpgsql_coverage_statements($1::regprocedure) statements,plpgsql_coverage_branches($1::regprocedure) branches',[r.signature])).rows[0],statements=(await client.query('SELECT * FROM plpgsql_profiler_function_statements_tb($1::regprocedure)',[r.signature])).rows;
    result.push({signature:r.signature,definitionSha256:r.definitionSha256,ratios,statements});
  }
  // Preserve every raw tree before any denominator assertion can fail.
  await writeFile(join(process.env.CUSTODY_OUTPUT,'p5-native-raw-'+randomUUID()+'.json'),JSON.stringify(result,null,2),{flag:'wx'});
  return result.map(r=>({...r,...p5Counts(r.signature,r.statements,r.ratios)}));
}

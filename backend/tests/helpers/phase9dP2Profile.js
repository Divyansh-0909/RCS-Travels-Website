import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const p2Signatures=['capture()','capture_existing()','capture_status()','committed_rows()','emit(text,text,text,jsonb,text)'].map(s=>'custody_lineage.'+s);
const digest=value=>createHash('sha256').update(value).digest('hex');
// Source-bound first-statement IDs for the pinned profiler's branch algorithm.
// IF: first statements of then/ELSIF/ELSE lists, plus implicit else if absent.
// FOR: first statement of its body. No procedural CASE/exception blocks here.
const shape={
  'capture()':{statements:17,ifs:[[2,[3],true],[7,[8,12,13,14,15],false],[10,[11],true]],loops:[]},
  'capture_existing()':{statements:8,ifs:[[4,[5],true]],loops:[[2,3]]},
  'capture_status()':{statements:28,ifs:[[2,[3],true],[6,[7],true],[8,[9],true],[12,[13],true],[16,[17],true],[19,[20],true],[21,[22],true],[24,[25],true],[26,[27],true]],loops:[[5,6],[14,15],[22,23]]},
  'committed_rows()':{statements:7,ifs:[[3,[4,5],false]],loops:[]},
  'emit(text,text,text,jsonb,text)':{statements:22,ifs:[[6,[7],true],[7,[8],true],[10,[11],true],[11,[12],true],[15,[16,17],false]],loops:[]}
};
export async function p2Catalog(client){
  const rows=(await client.query(`SELECT p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.provolatile,p.proconfig,p.proacl::text acl,
    pg_get_functiondef(p.oid) definition FROM pg_proc p WHERE p.oid=ANY(SELECT unnest($1::text[])::regprocedure) ORDER BY signature`,[p2Signatures])).rows;
  return rows.map(row=>({...row,definitionSha256:digest(row.definition),normalizedDefinitionSha256:digest(row.definition.replaceAll('\r\n','\n'))}));
}
export function p2Counts(signature,statements,ratios){
  const spec=shape[signature.replace('custody_lineage.','')];assert.ok(spec);
  const visible=statements.filter(s=>s.lineno>0),byId=new Map(statements.map(s=>[s.stmtid,s]));assert.equal(visible.length,spec.statements);
  const executions=id=>Number(byId.get(id).exec_stmts??0),branches=[];
  for(const [id,arms,implicit]of spec.ifs){
    assert.equal(byId.get(id).stmtname,'IF');let sum=0;
    for(const first of arms){assert.equal(byId.get(first).parent_stmtid,id);const count=executions(first);sum+=count;branches.push({stmtid:id,firstStatement:first,executions:count});}
    if(implicit){const count=executions(id)-sum;assert.ok(count>=0);branches.push({stmtid:id,implicitElse:true,executions:count});}
  }
  for(const [id,first]of spec.loops){assert.match(byId.get(id).stmtname,/^FOR /);assert.equal(byId.get(first).parent_stmtid,id);branches.push({stmtid:id,loopBody:true,firstStatement:first,executions:executions(first)});}
  const counts={statements:{hit:visible.filter(s=>Number(s.exec_stmts)>0).length,total:visible.length},branches:{hit:branches.filter(b=>b.executions>0).length,total:branches.length}};
  assert.ok(Math.abs(ratios.statements-counts.statements.hit/counts.statements.total)<1e-12);
  assert.ok(Math.abs(ratios.branches-counts.branches.hit/counts.branches.total)<1e-12);
  return {counts,branches,unhitStatements:visible.filter(s=>!Number(s.exec_stmts)).map(({stmtid,lineno,stmtname})=>({stmtid,lineno,stmtname}))};
}
export async function p2Native(client,catalog){
  const result=[];
  for(const routine of catalog){
    const ratios=(await client.query('SELECT plpgsql_coverage_statements($1::regprocedure) statements,plpgsql_coverage_branches($1::regprocedure) branches',[routine.signature])).rows[0];
    const statements=(await client.query('SELECT * FROM plpgsql_profiler_function_statements_tb($1::regprocedure)',[routine.signature])).rows;
    result.push({signature:routine.signature,definitionSha256:routine.definitionSha256,ratios,statements,...p2Counts(routine.signature,statements,ratios)});
  }
  return result;
}

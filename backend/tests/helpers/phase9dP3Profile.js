import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=text=>createHash('sha256').update(text).digest('hex');
export async function p3Catalog(client,schema){
  assert.ok(['custody_export','custody_lineage'].includes(schema));
  const signatures=[schema+'.next()',...(schema==='custody_export'?['custody_export.retry(uuid,bigint,integer)']:[])];
  return (await client.query(`SELECT p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,p.proacl::text acl,pg_get_functiondef(p.oid) definition
    FROM pg_proc p WHERE p.oid=ANY(SELECT unnest($1::text[])::regprocedure) ORDER BY signature`,[signatures])).rows.map(row=>({...row,definitionSha256:hash(row.definition),normalizedDefinitionSha256:hash(row.definition.replaceAll('\r\n','\n'))}));
}
export function p3Counts(signature,statements,ratios){
  const retry=signature==='custody_export.retry(uuid,bigint,integer)',visible=statements.filter(s=>s.lineno>0),nodes=new Map(statements.map(s=>[s.stmtid,s]));
  assert.ok(retry||['custody_export.next()','custody_lineage.next()'].includes(signature));assert.equal(visible.length,retry?13:6);
  const branches=[];for(const [parent,first]of retry?[[5,6],[7,8],[9,10]]:[[3,4]]){
    assert.equal(nodes.get(parent).stmtname,'IF');assert.equal(nodes.get(first).parent_stmtid,parent);
    const then=Number(nodes.get(first).exec_stmts??0),otherwise=Number(nodes.get(parent).exec_stmts??0)-then;assert.ok(otherwise>=0);
    branches.push({stmtid:parent,firstStatement:first,executions:then},{stmtid:parent,implicitElse:true,executions:otherwise});
  }
  const counts={statements:{hit:visible.filter(s=>Number(s.exec_stmts)>0).length,total:visible.length},branches:{hit:branches.filter(b=>b.executions>0).length,total:branches.length}};
  assert.ok(Math.abs(ratios.statements-counts.statements.hit/counts.statements.total)<1e-12);assert.ok(Math.abs(ratios.branches-counts.branches.hit/counts.branches.total)<1e-12);
  return {counts,branches,unhitStatements:visible.filter(s=>!Number(s.exec_stmts)).map(({stmtid,lineno,stmtname})=>({stmtid,lineno,stmtname}))};
}
export async function p3Native(client,catalog){
  const result=[];for(const routine of catalog){
    const ratios=(await client.query('SELECT plpgsql_coverage_statements($1::regprocedure) statements,plpgsql_coverage_branches($1::regprocedure) branches',[routine.signature])).rows[0];
    const statements=(await client.query('SELECT * FROM plpgsql_profiler_function_statements_tb($1::regprocedure)',[routine.signature])).rows;
    result.push({signature:routine.signature,definitionSha256:routine.definitionSha256,ratios,statements,...p3Counts(routine.signature,statements,ratios)});
  }return result;
}

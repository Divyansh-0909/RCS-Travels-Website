import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const hash=value=>createHash('sha256').update(value).digest('hex');
export const p6Signatures={custodian:['custody.rotate(text,text,bigint)','custody.active_key()','custody.accept(jsonb,text,text)','custody.signable(uuid)','custody.store_signature(uuid,text)','custody.ingest(jsonb)','custody.valid_event(jsonb,text)','custody.serialize(jsonb)'],receiver:['custody_export.ack(bigint,text,jsonb)']};
// Exact compiled shapes for the pinned profiler, not SQL expression branches.
const shape={
  'custody.rotate(text,text,bigint)':[12,[[3,[4],true],[5,[6],true],[7,[8],true]]],
  'custody.accept(jsonb,text,text)':[16,[[3,[4],true],[6,[7,9],false],[7,[8],true],[10,[11],true],[12,[13],true]]],
  'custody.store_signature(uuid,text)':[9,[[3,[4],true],[7,[8],true]]],
  'custody.ingest(jsonb)':[12,[[2,[3],true],[6,[7],true],[9,[10],true]]],
  'custody.valid_event(jsonb,text)':[34,[[2,[3],true],[4,[5],true],[6,[7],true],[8,[9],true],[11,[12],true],[13,[14],true],[16,[17],true],[19,[20],true],[22,[23],true],[24,[25],true],[26,[27],true],[28,[29],true],[30,[31],true],[32,[33],true]],[[10,11],[15,16],[18,19],[21,22]]],
  'custody_export.ack(bigint,text,jsonb)':[6,[[3,[4],true]]]
};
export async function p6Catalog(client,installation){
  return (await client.query(`SELECT p.oid::regprocedure::text signature,l.lanname language,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,p.proacl::text acl,pg_get_functiondef(p.oid) definition,
    EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') public_execute
    FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=ANY(SELECT unnest($1::text[])::regprocedure) ORDER BY signature`,[p6Signatures[installation]])).rows.map(r=>({...r,definitionSha256:hash(r.definition),normalizedDefinitionSha256:hash(r.definition.replaceAll('\r\n','\n'))}));
}
export function p6Counts(signature,statements,ratios){
  const spec=shape[signature];assert.ok(spec);const visible=statements.filter(s=>s.lineno>0),nodes=new Map(statements.map(s=>[s.stmtid,s]));assert.equal(visible.length,spec[0],signature);const count=id=>Number(nodes.get(id).exec_stmts??0),branches=[];
  for(const [id,arms,implicit]of spec[1]){assert.equal(nodes.get(id).stmtname,'IF');let sum=0;for(const first of arms){assert.equal(nodes.get(first).parent_stmtid,id);const executions=count(first);sum+=executions;branches.push({stmtid:id,firstStatement:first,executions});}if(implicit){const executions=count(id)-sum;assert.ok(executions>=0);branches.push({stmtid:id,implicitElse:true,executions});}}
  for(const [id,first]of spec[2]??[]){assert.equal(nodes.get(id).stmtname,'FOREACH over array');assert.equal(nodes.get(first).parent_stmtid,id);branches.push({stmtid:id,loopBody:true,firstStatement:first,executions:count(first)});}
  const counts={statements:{hit:visible.filter(s=>Number(s.exec_stmts)>0).length,total:visible.length},branches:{hit:branches.filter(b=>b.executions>0).length,total:branches.length}};
  assert.ok(Math.abs(ratios.statements-counts.statements.hit/counts.statements.total)<1e-12,signature+': statements');assert.ok(Math.abs(ratios.branches-counts.branches.hit/counts.branches.total)<1e-12,signature+': branches');
  return {counts,branches,unhitStatements:visible.filter(s=>!Number(s.exec_stmts)).map(({stmtid,lineno,stmtname})=>({stmtid,lineno,stmtname}))};
}
export async function p6Native(client,catalog,installation){
  const raw=[];for(const r of catalog.filter(r=>r.language==='plpgsql')){
    const ratios=(await client.query('SELECT plpgsql_coverage_statements($1::regprocedure) statements,plpgsql_coverage_branches($1::regprocedure) branches',[r.signature])).rows[0],statements=(await client.query('SELECT * FROM plpgsql_profiler_function_statements_tb($1::regprocedure)',[r.signature])).rows;
    raw.push({signature:r.signature,definitionSha256:r.definitionSha256,ratios,statements});
  }
  await writeFile(join(process.env.CUSTODY_OUTPUT,'p6-native-raw-'+installation+'-'+randomUUID()+'.json'),JSON.stringify(raw,null,2),{flag:'wx'});
  return raw.map(r=>({...r,...p6Counts(r.signature,r.statements,r.ratios)}));
}

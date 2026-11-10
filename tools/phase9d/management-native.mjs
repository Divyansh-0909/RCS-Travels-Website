import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
export const managementNativeSignatures=['retention9d.preserve_remaining(text,text)','retention9d.enforce_preservation_barrier()',
  'capacity9d.queue_alerts()','capacity9d.claim_alert(text,uuid)','capacity9d.finish_alert(uuid,uuid,text,text)'];
export async function managementNative(client){
  const result=[];
  for(const signature of managementNativeSignatures){
    const definition=(await client.query('SELECT pg_get_functiondef($1::regprocedure) definition',[signature])).rows[0].definition;
    const statements=(await client.query('SELECT * FROM plpgsql_profiler_function_statements_tb($1::regprocedure)',[signature])).rows;
    const ratios=(await client.query('SELECT plpgsql_coverage_statements($1::regprocedure) statements,plpgsql_coverage_branches($1::regprocedure) branches',[signature])).rows[0];
    const rawFile='management-native-raw-'+randomUUID()+'.json';
    await writeFile(join(process.env.CUSTODY_OUTPUT,rawFile),JSON.stringify({signature,definition,statements,ratios},null,2),{flag:'wx'});
    const visible=statements.filter(s=>s.lineno>0),branches=[];
    // These five source-bound bodies have IF with implicit ELSE and a FOR body.
    // SQL CASE expressions inside statements have no native branch denominator.
    for(const node of statements){
      assert.ok(!['CASE','LOOP','WHILE','EXCEPTION'].includes(node.stmtname),'UNSUPPORTED_NATIVE_CONTROL_SHAPE');
      if(node.stmtname!=='IF'&&!node.stmtname.startsWith('FOR '))continue;
      const child=statements.filter(s=>s.parent_stmtid===node.stmtid).sort((a,b)=>a.stmtid-b.stmtid)[0];
      assert.ok(child,'MISSING_NATIVE_FIRST_STATEMENT');
      branches.push({stmtid:node.stmtid,firstStatement:child.stmtid,executions:Number(child.exec_stmts)});
      if(node.stmtname==='IF'){
        const executions=Number(node.exec_stmts)-Number(child.exec_stmts);assert.ok(executions>=0);
        branches.push({stmtid:node.stmtid,implicitElse:true,executions});
      }
    }
    const counts={statements:{hit:visible.filter(s=>Number(s.exec_stmts)>0).length,total:visible.length},branches:{hit:branches.filter(b=>b.executions>0).length,total:branches.length}};
    assert.ok(Math.abs(ratios.statements-counts.statements.hit/counts.statements.total)<1e-12,signature+': native statement reconciliation');
    assert.ok(Math.abs(ratios.branches-(counts.branches.total?counts.branches.hit/counts.branches.total:1))<1e-12,signature+': native branch reconciliation');
    result.push({signature,rawFile,definitionSha256:createHash('sha256').update(definition).digest('hex'),definition,statements,ratios,counts,branches,
      unhitStatements:visible.filter(s=>!Number(s.exec_stmts)).map(({stmtid,lineno,stmtname})=>({stmtid,lineno,stmtname}))});
  }
  return result;
}

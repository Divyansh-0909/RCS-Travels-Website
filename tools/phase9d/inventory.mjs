import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const output='output/phase9d-1-2026-10-12';
const roots=['backend/services/driverCancellations.js','backend/services/customerLifecycleIncidents.js','backend/services/lifecycleIncidentEvidence.js',
  'backend/services/responsibilityShadowRepository.js','backend/services/responsibilityShadowAdjudication.js',
  'backend/services/responsibilityAnalyst.js','backend/services/responsibilityJevV5.js','backend/services/responsibilityPolicyGate.js',
  'backend/services/responsibilityEvidenceSafety.js','backend/services/responsibilityReviewService.js','backend/services/responsibilityLifecycleRepository.js',
  'backend/services/responsibilityFinalizationService.js','backend/services/responsibilityFinalizationSweep.js',
  'backend/services/responsibilityConsequences.js','backend/services/responsibilityFinancialConsequences.js',
  'backend/services/responsibilityReliabilityConsequences.js','backend/services/responsibilityCompensation.js',
  'backend/services/responsibilityLiabilityRecovery.js','backend/services/driverPayouts.js','backend/services/wallet.js',
  'backend/lib/jobs.js','backend/routes/internal.js','backend/routes/responsibilityAdmin.ts','backend/middleware/auth.js',
  'backend/middleware/liveSession.js','backend/db/prisma.js','backend/DEPLOY.md','cloudbuild.backend.yaml','.github/workflows/deploy-cloud-run.yml'];
const sources={},transitions=[];
for(const file of roots){
  let bytes;try{bytes=await readFile(file)}catch(e){if(e.code==='ENOENT'){transitions.push({file,missing:true});continue}throw e}
  sources[file]=createHash('sha256').update(bytes).digest('hex');
  const lines=bytes.toString().split(/\r?\n/);
  lines.forEach((line,index)=>{
    if(/\bimport\b|\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(|\$executeRaw|\$queryRaw|export (async )?function|router\.|Router\.|sweepResponsibility|secret|service.account|DATABASE_URL|SECURITY DEFINER|grant|GRANT/.test(line))
      transitions.push({file,line:index+1,source:line.trim()});
  });
}
const migrations=[];
for(const item of await readdir('backend/prisma/migrations',{withFileTypes:true})){
  if(!item.isDirectory())continue;
  const file='backend/prisma/migrations/'+item.name+'/migration.sql',bytes=await readFile(file),matches=[];
  bytes.toString().split(/\r?\n/).forEach((line,i)=>{if(/GRANT|REVOKE|SECURITY DEFINER|OWNER TO|ROW LEVEL|CREATE POLICY/i.test(line))matches.push({line:i+1,source:line.trim()})});
  if(matches.length)migrations.push({file,sha256:createHash('sha256').update(bytes).digest('hex'),matches});
}
await writeFile(output+'/architecture-inventory-'+Date.now()+'.json',JSON.stringify({schema:'phase9d-source-inventory-v1',sources,transitions,migrations,
  interpretation:'Lexical navigation inventory. Checkpoint maps exact inspected code; this inventory alone does not establish semantic isolation.',
  deployedIamInspected:false,deployedDatabaseGrantsInspected:false},null,2),{flag:'wx'});
console.log(JSON.stringify({sourceFiles:Object.keys(sources).length,transitions:transitions.length,migrationGrantFiles:migrations.length}));

import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve, basename } from 'node:path'
import { phase81DevelopmentDataset } from '../benchmarks/responsibility/phase81Development.js'
import { responsibilityBenchmarkRecordSchema } from '../benchmarks/responsibility/contracts.js'
import { normalizeEvidenceAware } from '../benchmarks/responsibility/evidenceAwareSeverity.js'
import { reusableLunaDevelopmentEntry } from '../benchmarks/responsibility/developmentCache.js'
import { safeRateLimitDetail, pacedDevelopmentProvider } from '../benchmarks/responsibility/pacedDevelopment.js'
import { benchmarkCacheKey } from '../benchmarks/common/cache.js'
import { createReadOnlyResponsibilityBenchmarkLoader, createAppendOnlyResponsibilityArtifactWriter,
  createResponsibilityBenchmarkRunner, normalizeJevResponsibility, benchmarkPredictionFromRun,
  simulateJevResponsibilityRoute } from '../benchmarks/responsibility/benchmark.js'
import { classifyBenchmarkDisagreements } from '../benchmarks/responsibility/metrics.js'
import { evaluateResponsibilityBenchmark } from '../benchmarks/responsibility/evaluation.js'
import { parseResponsibilityBenchmarkOptions } from '../benchmarks/responsibility/run.js'

const record = phase81DevelopmentDataset().find(r => r.id === 'driver_cancellation-ordinary_driver_evidence')
const categorical = overrides => ({ model:'jev-fixture', answers:Object.fromEntries(Object.entries({ responsibility:'VALID_WAIVED',
  evidenceSufficient:'YES', platformMateriallyContributed:'NO', externalCauseMaterial:'NO', needsHumanReview:'NO',
  seriousReliabilityFailure:'NO', aggravatingEvidencePresent:'NO', ordinaryDriverFailure:'NO', ...overrides })
  .map(([key,choice]) => [key,{choice,confidence:0.97}])) })

test('evidence sufficiency and waiver predicates remain categorical, independent and fully auditable', () => {
  const waived=normalizeEvidenceAware(categorical(),record.evidence)
  assert.equal(waived.normalized.evidenceSufficient,true)
  assert.equal(waived.normalized.needsHumanReview,false)
  assert.equal(waived.normalized.level2AutomationEligible,false)
  assert.equal(waived.raw.rawSeverity,'LOW')
  const ordinary=normalizeEvidenceAware(categorical({responsibility:'DRIVER_CAUSED',ordinaryDriverFailure:'YES'}),record.evidence)
  assert.equal(ordinary.normalized.needsHumanReview,false)
  assert.equal(ordinary.raw.rawSeverity,'MODERATE')
  for(const [field,result] of [['evidenceSufficient','evidenceSufficient'],['externalCauseMaterial','externalCauseMaterial'],
    ['platformMateriallyContributed','platformMateriallyContributed']]) {
    for(const choice of ['YES','NO','UNCLEAR']) {
      const run=normalizeEvidenceAware(categorical({[field]:choice}),record.evidence)
      assert.equal(run.normalized[result],field==='evidenceSufficient'?choice==='YES':choice!=='NO')
      assert.equal(run.raw.decisions[field],choice)
      if(choice==='UNCLEAR') assert.equal(run.normalized.needsHumanReview,true)
    }
  }
  const invalid=categorical(); invalid.model=42
  assert.throws(()=>normalizeEvidenceAware(invalid,record.evidence),/JEV_ANSWER_INVALID/)
  const driver=normalizeEvidenceAware(categorical({responsibility:'DRIVER_CAUSED'}),record.evidence)
  assert.equal(driver.normalized.needsHumanReview,true)
  const serious=normalizeEvidenceAware(categorical({responsibility:'DRIVER_CAUSED',seriousReliabilityFailure:'YES',aggravatingEvidencePresent:'YES'}),record.evidence)
  assert.equal(serious.normalized.needsHumanReview,false)
})

test('a successful-looking failed/null/missing cached result cannot be reused', () => {
  const identity={domain:'responsibility',datasetHash:'dev',caseId:record.id,inputHash:record.evidenceHash,
    provider:'openai',model:'gpt-6-luna',configHash:'config',runNumber:1}
  for(const value of [{error:'TIMEOUT',normalized:{},raw:{model:'gpt-6-luna'}},
    {error:null,normalized:null,raw:{model:'gpt-6-luna'}},{error:null,raw:{model:'gpt-6-luna'}}]) {
    const entry={identity,key:benchmarkCacheKey(identity),value}
    assert.equal(reusableLunaDevelopmentEntry([entry],record,'config',['dev']),undefined)
  }
})

test('retry diagnostics retain exact axes, absent header and disclosed numeric limit without credentials', () => {
  for(const [message,axis] of [['requests per day Limit: 17','RPD'],['tokens per minute Limit 18','TPM'],
    ['requests per minute limit: 19','RPM'],['generic unavailable','UNSPECIFIED']]) {
    const result=safeRateLimitDetail({name:'Error',message},0)
    assert.equal(result.axis,axis); assert.equal(result.retryAfterMs,null)
    assert.equal(result.limit,axis==='UNSPECIFIED'?null:axis==='RPD'?17:axis==='TPM'?18:19)
  }
  for(const header of [undefined,null]) assert.equal(safeRateLimitDetail({headers:{'retry-after':header}},0).retryAfterMs,null)
})

test('record ownership/hash checks reject prefixes, suffixes and mismatched model evidence', () => {
  for(const hash of ['x'+record.evidenceHash,record.evidenceHash+'x',record.evidenceHash.slice(1)])
    assert.equal(responsibilityBenchmarkRecordSchema.safeParse({...record,evidenceHash:hash}).success,false)
  const wrong=structuredClone(record); wrong.modelInput.evidence.bookingId='different-booking'
  const parsed=responsibilityBenchmarkRecordSchema.safeParse(wrong)
  assert.equal(parsed.success,false)
  assert.ok(parsed.error.issues.some(i=>i.message==='Model input must use the record evidence'))
  assert.equal(parsed.error.issues.every(i=>i.code==='custom'),true)
  const unlabelled={...record,cohort:'D_REAL_UNLABELED'}
  assert.equal(responsibilityBenchmarkRecordSchema.safeParse(unlabelled).success,false)
  assert.equal(responsibilityBenchmarkRecordSchema.safeParse({...unlabelled,label:null}).success,true)
  const hash=responsibilityBenchmarkRecordSchema.safeParse({...record,evidenceHash:'a'.repeat(64)})
  assert.equal(hash.error.issues[0].code,'custom');assert.equal(hash.error.issues[0].message,'Evidence hash must match the record evidence')
  const labels=responsibilityBenchmarkRecordSchema.safeParse(unlabelled)
  assert.equal(labels.error.issues[0].code,'custom');assert.equal(labels.error.issues[0].message,'Unlabeled cohort cannot include ground truth')
})

test('human loader preserves appeal precedence, optional level, contradictions and a read-only selection', async () => {
  let request
  const withContradictions=phase81DevelopmentDataset().find(r=>r.evidence.contradictions.length>0).evidence
  const decisions=[
    {finalDecision:{classification:'VALID_WAIVED',source:'APPEAL_REVIEW',consequenceLevel:'LEVEL_0'}},
    {finalDecision:{classification:'DRIVER_CAUSED',source:'NO_APPEAL_ADMIN',consequenceLevel:'LEVEL_1'}},
    {finalDecision:{classification:'PLATFORM_CAUSED',source:'ADMIN_WAIVER'}},
    {adminReview:{classification:'VALID_WAIVED'}},
    {finalDecision:{classification:'NEEDS_REVIEW',source:'ADMIN_WAIVER'}},
    {},
  ]
  const rows=decisions.map((decision,i)=>({id:'human-'+i,state:'FINAL_WAIVED',evidenceSnapshot:withContradictions,...decision}))
  rows.push({id:'invalid',evidenceSnapshot:{}})
  const loader=createReadOnlyResponsibilityBenchmarkLoader({responsibilityCase:{findMany:async args=>{request=args;return rows}}})
  const loaded=await loader.load({take:7,caseIds:['human-0']})
  assert.deepEqual(request,{where:{shadowResults:{some:{}},id:{in:['human-0']}},take:7,orderBy:{createdAt:'asc'},
    select:{id:true,state:true,evidenceSnapshot:true,finalDecision:{select:{outcome:true,classification:true,consequenceLevel:true,source:true,appealId:true}},
      adminReview:{select:{decision:true,classification:true,consequenceLevel:true}}}})
  assert.equal(loaded.length,6)
  assert.equal(loaded[0].label.source,'FINAL_APPEAL')
  for(const i of [1,2,3]) assert.equal(loaded[i].label.source,'ADMIN_HUMAN')
  assert.equal(loaded[1].label.consequenceLevel,'LEVEL_1'); assert.equal(loaded[2].label.consequenceLevel,null)
  assert.equal(loaded[0].label.contradictionCritical,true)
  assert.deepEqual(loaded[0].label.requiredMissingEvidence,[...withContradictions.completeness.missing,...withContradictions.completeness.unavailable])
  for(const i of [4,5]) {assert.equal(loaded[i].label,null);assert.equal(loaded[i].cohort,'D_REAL_UNLABELED')}
  assert.equal(loaded[0].scenario,'real-world'); assert.match(loaded[0].id,/^real-[a-f0-9]{24}$/)
  const throughAppealId=createReadOnlyResponsibilityBenchmarkLoader({responsibilityCase:{findMany:async()=>[
    {...rows[0],evidenceSnapshot:record.evidence,finalDecision:{classification:'VALID_WAIVED',source:'OTHER',appealId:'appeal'}}]}})
  const [final]=await throughAppealId.load(); assert.equal(final.label.source,'FINAL_APPEAL')
  assert.equal(final.label.contradictionCritical,false)
  const missing=structuredClone(record.evidence);missing.completeness.missing=['location'];missing.completeness.unavailable=['connectivity']
  const incomplete=createReadOnlyResponsibilityBenchmarkLoader({responsibilityCase:{findMany:async()=>[
    {...rows[0],evidenceSnapshot:missing}]}})
  assert.deepEqual((await incomplete.load())[0].label.requiredMissingEvidence,['location','connectivity'])
})

test('partial-model disagreement counts require BOTH systems wrong, not either one', () => {
  const input=(id,existing,jev)=>({id,label:record.label,existingPrediction:{responsibility:existing},jevPrediction:{responsibility:jev}})
  const result=classifyBenchmarkDisagreements([input('both','PLATFORM_CAUSED','VALID_WAIVED'),
    input('jev','PLATFORM_CAUSED','DRIVER_CAUSED'),input('existing','DRIVER_CAUSED','PLATFORM_CAUSED'),
    input('correct','DRIVER_CAUSED','DRIVER_CAUSED')])
  assert.deepEqual(result.bothWrong,['both']); assert.deepEqual(result.jevCorrectExistingWrong,['jev'])
  assert.deepEqual(result.existingCorrectJevWrong,['existing'])
})

test('all deterministic evidence-denial codes affect sufficiency diagnostics even with a model claiming YES', () => {
  const normalized={classification:'DRIVER_CAUSED',severity:'MODERATE',evidenceSufficient:true,confidence:1}
  for(const code of ['ANALYSIS_VALIDATION','REQUIRED_EVIDENCE','EVIDENCE_FRESHNESS','EVIDENCE_QUALITY','MATERIAL_CONTRADICTIONS',
    'AI_REPORTED_MISSING_EVIDENCE','AI_REPORTED_CONTRADICTIONS','JEV_EVIDENCE_SUFFICIENT']) {
    const run={normalized,error:null,gate:{route:'NEEDS_ADMIN_REVIEW',failedGates:[{code}]}}
    assert.equal(benchmarkPredictionFromRun(run).evidenceSufficient,false)
  }
  for(const run of [null,undefined,{normalized:null,gate:{route:'PROVISIONAL_AUTO_UPHELD'}},
    {normalized,error:'TIMEOUT',gate:{route:'PROVISIONAL_AUTO_UPHELD'}}]) {
    const prediction=benchmarkPredictionFromRun(run);assert.equal(prediction.autoUpholdAllowed,false);assert.equal(prediction.needsReview,true)
  }
  const result={...normalized,needsHumanReview:false,externalCauseMaterial:false,platformMateriallyContributed:false}
  const missing=structuredClone(record.evidence);missing.timeline=missing.timeline.filter(item=>item.category!=='assignment')
  assert.equal(simulateJevResponsibilityRoute({evidence:missing,result}).failedGates.find(g=>g.code==='REQUIRED_EVIDENCE').detail,'missing:assignment')
  const stale=structuredClone(record.evidence);stale.timeline.find(item=>item.category==='assignment').observedAt='invalid'
  const custom={policyVersion:'test',cases:{DRIVER_CANCELLATION:{requiredCategories:['assignment'],freshnessRequiredCategories:['assignment'],maxAgeMsByCategory:{assignment:100},minConfidence:0,allowedSeverities:['MODERATE'],autoUpholdAllowed:true}}}
  assert.equal(simulateJevResponsibilityRoute({evidence:stale,result,policy:custom}).failedGates.find(g=>g.code==='EVIDENCE_FRESHNESS').detail,'stale-or-unproven:assignment')
  const quality=structuredClone(record.evidence);quality.timeline[0].quality.invalid=true
  assert.equal(simulateJevResponsibilityRoute({evidence:quality,result}).failedGates.find(g=>g.code==='EVIDENCE_QUALITY').detail,`invalid:${quality.timeline[0].id}`)
})

test('provider budget halts each permanent category without a secondary predicate masking the reason', async () => {
  for(const [error,category] of [[{status:401},'AUTH'],[{status:404},'MODEL_API_NOT_FOUND'],[new Error('credits exhausted'),'QUOTA']]) {
    const provider=pacedDevelopmentProvider({analyzeResponsibilityCase:async()=>{throw error}},
      {requestLimit:3,minIntervalMs:0,maxRetries:0,wait:async()=>assert.fail('Permanent errors cannot retry')})
    await assert.rejects(provider.analyzeResponsibilityCase({}),e=>e.message===`RESPONSIBILITY_PROVIDER_FAILURE:${category}`)
    assert.equal(provider.budgetState().halted,category)
    await assert.rejects(provider.analyzeResponsibilityCase({}),e=>e.message===`RESPONSIBILITY_PROVIDER_PAUSED:${category}`)
    assert.equal(provider.budgetState().requests,1)
  }
  assert.equal(safeRateLimitDetail({message:'LimitUnknown 14'}).limit,null)
})

test('CLI diagnostics use explicit argument names and default argv without reaching providers', () => {
  for(const [args,message] of [[{},'RESPONSIBILITY_BENCHMARK_OUTPUT_DIR_REQUIRED'],
    [{argv:['--output=unit','--source=invalid']},'RESPONSIBILITY_BENCHMARK_SOURCE_INVALID'],
    [{argv:['--output=unit','--split=invalid']},'RESPONSIBILITY_BENCHMARK_SPLIT_INVALID'],
    [{argv:['--output=unit','--consistency-count=101']},'CONSISTENCY_COUNT_INVALID']])
    assert.throws(()=>parseResponsibilityBenchmarkOptions({env:{},...args}),e=>e.message===message)
  const original=process.argv
  try {process.argv=['node','fixture','--output=unit','--repeats=3']; assert.equal(parseResponsibilityBenchmarkOptions({env:{}}).repeats,3)}
  finally {process.argv=original}
})

test('operational usage and incomplete outputs remain measurable without pretending failed or absent inference was successful', () => {
  const prediction={responsibility:'DRIVER_CAUSED',needsReview:true,consequenceLevel:'LEVEL_1',autoUpholdAllowed:false,autoWaiveAllowed:false,evidenceSufficient:false}
  const rows=[{id:'known',runNumber:1,cohort:record.cohort,label:record.label,existingPrediction:prediction,jevPrediction:prediction,
    existing:{error:null,latencyMs:10,raw:{usage:{inputTokens:10}},gate:{failedGates:[]}},
    jev:{error:null,latencyMs:20,raw:{usage:{inputTokens:5,outputTokens:3}},gate:{failedGates:[{code:'AI_REPORTED_MISSING_EVIDENCE'}]}}},
    {id:'missing',runNumber:1,cohort:'D_REAL_UNLABELED',label:null},
    {id:'failure',runNumber:1,cohort:record.cohort,label:record.label,existingPrediction:prediction,jevPrediction:prediction,
      existing:{error:'TIMEOUT',latencyMs:999},jev:{error:'schema mismatch',latencyMs:999}}]
  const result=evaluateResponsibilityBenchmark(rows)
  assert.equal(result.existing.operations.usage.totalTokens.count,0);assert.equal(result.jev.operations.usage.totalTokens.total,8)
  assert.equal(result.existing.operations.latencyMs.count,1);assert.equal(result.jev.operations.latencyMs.count,1)
  assert.equal(result.existing.outputDiagnostics.timeouts,1);assert.equal(result.jev.outputDiagnostics.structuredOutputFailures,1)
  assert.equal(result.jev.outputDiagnostics.reportedMissingEvidenceCases,1)
  assert.equal(result.jev.outputDiagnostics.manualReviewRoutes,2)
  assert.equal(result.existing.cost,'NOT_AUTHORITATIVELY_AVAILABLE');assert.equal(result.jev.cost,'NOT_AUTHORITATIVELY_AVAILABLE')
  assert.deepEqual(Object.keys(result.jev.cohortScores),['A_FROZEN_SYNTHETIC','B_ADVERSARIAL_SAFETY','C_REAL_LABELED','D_REAL_UNLABELED'])
})

test('raw legacy diagnostic boundaries and non-Error provider failures stay visible and redacted', async () => {
  const fixture={model:'jev-fixture',answers:{responsibility:{choice:'DRIVER_CAUSED',confidence:1},
    evidenceSufficient:{noul:0.5},platformMateriallyContributed:{noul:0},externalCauseMaterial:{noul:0},
    needsHumanReview:{noul:0},severity:{score:0.49}}}
  assert.equal(normalizeJevResponsibility(fixture).evidenceSufficient,true)
  assert.equal(normalizeJevResponsibility(fixture).severity,'LOW')
  const runner=createResponsibilityBenchmarkRunner({existingAnalyst:{analyzeResponsibilityCase:async()=>{throw null}},
    jevAdapter:{analyzeResponsibilityCase:async()=>{throw {secret:'never-output'}}}})
  const [row]=await runner.run([record])
  assert.equal(row.existing.error,'benchmark request failed');assert.equal(row.jev.error,'benchmark request failed')
  assert.equal(row.existing.errorCategory,'PROVIDER');assert.equal(row.jev.errorCategory,'PROVIDER')
  assert.equal(row.existingPrediction.needsReview,true);assert.equal(row.jevPrediction.needsReview,true)
})

test('append-only artifacts keep independent failure counts and safe run identity', async () => {
  const folder=await mkdtemp(join(tmpdir(),'rcs-phase81-mutant-'))
  try {
    const writer=createAppendOnlyResponsibilityArtifactWriter({outputDir:folder,runId:'unit@id!!'})
    assert.equal(writer.artifacts,join(folder,'responsibility-benchmark-unit_id__.jsonl'))
    const rows=[{existing:{error:'TIMEOUT'},jev:{error:null}},{existing:{error:null},jev:{error:'SCHEMA'}},
      {existing:{error:'TIMEOUT'},jev:{error:'SCHEMA'}},{existing:{error:null},jev:{error:null}}]
    await writer.append(rows);await writer.append([])
    const stored=(await readFile(writer.artifacts,'utf8')).trim().split('\n').map(line=>JSON.parse(line))
    assert.deepEqual(stored,rows)
    const summaries=(await readFile(writer.summary,'utf8')).trim().split('\n').map(line=>JSON.parse(line))
    assert.deepEqual(summaries.map(r=>[r.records,r.failures]),[[4,3],[0,0]])
    for(const row of summaries) {assert.equal(row.version,'responsibility-benchmark-v1');assert.ok(Number.isFinite(Date.parse(row.recordedAt)))}
  } finally {
    assert.equal(dirname(resolve(folder)),resolve(tmpdir()));assert.ok(basename(folder).startsWith('rcs-phase81-mutant-'))
    await rm(folder,{recursive:true,force:true})
  }
})

test('default artifact run identity uses the controlled UTC calendar date', () => {
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-05T10:00:00.000Z') })
  try {
    const writer=createAppendOnlyResponsibilityArtifactWriter({outputDir:'unit-no-files'})
    assert.equal(writer.artifacts,join('unit-no-files','responsibility-benchmark-2026-10-05.jsonl'))
  } finally {mock.timers.reset()}
})

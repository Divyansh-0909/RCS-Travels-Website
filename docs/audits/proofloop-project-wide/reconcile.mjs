// Independent discovery reconciliation. Audit artifacts only; no application imports.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const out=path.join(root,'output/proofloop-project-wide-audit-2026-10-11');
const load=async name=>JSON.parse(await fs.readFile(path.join(out,name),'utf8'));
const save=async(name,data)=>fs.writeFile(path.join(out,name),JSON.stringify(data,null,2)+'\n');
const [graph,complementary,inventory,policies]=await Promise.all(['static-dependency-graph.json','complementary-discovery.json','repository-inventory.json','policy-registry.json'].map(load));
const candidates=graph.nodes.filter(n=>n.type==='uiRoute');
const actual=complementary.navigation;
const match=(candidate,route)=>candidate.path===route.source&&candidate.line===route.line;
const matched=candidates.filter(n=>actual.some(r=>match(n,r)));
const excluded=candidates.filter(n=>!actual.some(r=>match(n,r))).map(n=>({id:n.id,source:n.path,line:n.line,path:n.details.path,disposition:'EXCLUDED_FROM_ROUTER_REGISTRATION_COUNT',reason:/\/tests\//.test(n.path)?'Test path object, not production router construct':/prisma\.config/.test(n.path)?'Migration-directory configuration, not router construct':'Navigation-link data, not router registration; retained in source/UI-action discovery'}));
const additional=actual.filter(r=>!candidates.some(n=>match(n,r)));
assert.equal(candidates.length,74);assert.equal(matched.length,46);assert.equal(excluded.length,28);assert.equal(additional.length,8);assert.equal(actual.length,54);
await save('navigation-reconciliation.json',{method:'Independent actual JSX Route parser matched to broad Atlas path-object candidates by source and source line',counts:{atlasCandidates:74,matched:46,excludedFromRegistrationCount:28,additionalPathlessLayouts:8,actualRouterConstructs:54},matched:matched.map(n=>({id:n.id,source:n.path,line:n.line,path:n.details.path})),excluded,additional,limitation:'Router registration is not navigation reachability, authorization correctness, action coverage or browser/device execution. Link objects outside router registration are not dismissed as irrelevant.'});
const packages=[];
for(const file of inventory.files.filter(f=>/(^|\/)package\.json$/.test(f.path)&&f.sha256)){
 const p=JSON.parse(await fs.readFile(path.join(root,file.path),'utf8'));
 packages.push({source:file.path,baselineSha256:file.sha256,name:p.name||null,private:p.private??null,entry:p.main||null,moduleType:p.type||null,scriptNames:Object.keys(p.scripts||{}).sort(),workspaces:p.workspaces||null,engines:p.engines||null,dependencies:Object.keys(p.dependencies||{}).sort(),developmentDependencies:Object.keys(p.devDependencies||{}).sort(),status:'STATIC_METADATA_ONLY_NOT_EXECUTED',category:file.category});
}
await save('subproject-inventory.json',{packages,additionalOwnedScopes:['backend/rcs-rag (CLI/vector corpus)','Python search_assignment (academic search algorithms)','shared/theme and shared/i18n','tools/phase9-native and isolated lifecycle/browser/native harnesses','docs/legal/compliance/search/benchmarks/decisions','developer plugin/Code Atlas and nonproduction design tooling'],limits:'Package entry metadata does not prove runtime mounting. Excluded generated/vendor trees retain their own inventory denominator; no package scripts are run.'});
const repeats=new Map();for(const p of policies.filter(p=>p.baseId)){const rows=repeats.get(p.baseId)||[];rows.push({id:p.id,source:p.source,status:p.status});repeats.set(p.baseId,rows);}
await save('policy-occurrence-reconciliation.json',{method:'Same statement hash is a grouping identity; every repeated source occurrence retains a distinct ID and provenance',groups:[...repeats].map(([baseId,occurrences])=>({baseId,occurrences})),recordCount:policies.length,uniqueIdCount:new Set(policies.map(p=>p.id)).size});
console.log(JSON.stringify({navigation:'RECONCILED',packages:packages.length,repeatedPolicyGroups:repeats.size}));

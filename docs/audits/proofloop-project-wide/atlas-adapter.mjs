// Audit-only bounded adaptation; never edits the repository Code Atlas.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const req=createRequire(path.join(root,'tools/code-atlas/package.json'));
const original=await fs.readFile(path.join(root,'tools/code-atlas/scripts/scan-project.mjs'),'utf8');
const adapted=original.replace("from 'ts-morph'",'from '+JSON.stringify(pathToFileURL(req.resolve('ts-morph')).href))
 .replace("from './atlas-core.mjs'",'from '+JSON.stringify(pathToFileURL(path.join(root,'tools/code-atlas/scripts/atlas-core.mjs')).href))
 .replace('(node_modules|dist|build|coverage|assets|public|migrations|\\.git)','(\\.stryker-tmp|\\.expo|node_modules|dist|build|coverage|assets|public|migrations|\\.git)')
 .replace('skipAddingFilesFromTsConfig: true,','skipAddingFilesFromTsConfig: true,\n    skipFileDependencyResolution: true,\n    skipLoadingLibFiles: true,');
const target=path.join(root,'output/proofloop-project-wide-audit-2026-10-11/audit-atlas-scanner.mjs');
await fs.writeFile(target,adapted);
const {scanProject}=await import(pathToFileURL(target).href);
const atlas=await scanProject(root);
const nodes=atlas.nodes.filter(n=>n.type!=='sourceText').map(n=>({id:n.id,type:n.type,label:n.label,path:n.path,line:n.line,surface:n.surface,details:['serverEndpoint','clientEndpoint','uiRoute'].includes(n.type)?n.details:undefined}));
const ids=new Set(nodes.map(n=>n.id));
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
await fs.writeFile(path.join(root,'output/proofloop-project-wide-audit-2026-10-11/static-dependency-graph.json'),JSON.stringify({meta:atlas.meta,nodes,edges:atlas.edges.filter(e=>ids.has(e.source)&&ids.has(e.target)),diagnostics:atlas.diagnostics,sourceTextExcluded:true,adapter:{originalSha256:hash(original),adaptedSha256:hash(adapted),changes:['Exclude .stryker-tmp and .expo directories from walker','Skip implicit dependency/library file loading; project imports and explicit indexed source retained','Resolve scanner dependencies to original tooling location'],priorFailure:'Unadapted scan exited with V8 heap limit at 4GiB; no repository scanner edits'}},null,2)+'\n');
console.log(JSON.stringify({nodes:nodes.length,edges:atlas.edges.length,diagnostics:atlas.diagnostics.length,totals:atlas.meta.totals}));

// Audit-only, static discovery. Never imports application modules or opens DBs.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const out = path.join(root, 'output/proofloop-project-wide-audit-2026-10-11');
await fs.mkdir(out, {recursive:true});
const save = async (name, value) => fs.writeFile(path.join(out,name),JSON.stringify(value,null,2)+'\n');
async function graphOnly() {
 const {scanProject}=await import(pathToFileURL(path.join(root,'tools/code-atlas/scripts/scan-project.mjs')).href);
 const atlas=await scanProject(root);
 const nodes=atlas.nodes.filter(n=>n.type!=='sourceText').map(n=>({id:n.id,type:n.type,label:n.label,path:n.path,line:n.line,surface:n.surface,details:['serverEndpoint','clientEndpoint','uiRoute'].includes(n.type)?n.details:undefined}));
 const ids=new Set(nodes.map(n=>n.id));
 await save('static-dependency-graph.json',{meta:atlas.meta,nodes,edges:atlas.edges.filter(e=>ids.has(e.source)&&ids.has(e.target)),diagnostics:atlas.diagnostics,sourceTextExcluded:true});
 console.log(JSON.stringify({phase:'atlas',totals:atlas.meta.totals,diagnostics:atlas.diagnostics.length}));
}
if(process.argv.includes('--graph-only')){await graphOnly();process.exit(0);}
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const ownAudit = p => /^(docs\/audits\/proofloop-project-wide|output\/proofloop-project-wide-audit-2026-10-11)(\/|$)/.test(p);
const generatedDir = p => /(^|\/)(node_modules|\.git|\.gradle|\.expo|build|dist|coverage|\.stryker-tmp|\.cache|_vendor)(\/|$)/.test(p) || /^(output|test-results|screenshots|temporary screenshots|\.build-worktree|\.chrome[^/]*|\.tmp[^/]*|\.codex-tmp[^/]*|\.codex-ui-check|\.deploy-notifications|\.dns-email-state|\.design-sync|\.ds-sync|tmp)(\/|$)/.test(p);
const sensitive = p => /(^|\/)(\.env($|\.)|[^/]*\.(pem|key|p12|jks|keystore)$)|(^|\/)(credentials|secrets)(\/|\.)/i.test(p) && !/\.env\.example$/.test(p);
function classify(p) {
 if(sensitive(p)) return 'OPERATIONAL_CONFIGURATION_RESTRICTED';
 if(generatedDir(p)||/package-lock\.json$|theme\.generated\.css$|generated-atlas\.js$/.test(p)) return 'GENERATED_VENDOR_BUILD_OUTPUT';
 if(/(^|\/)(tests?|__tests__|fixtures|benchmarks)(\/|\.)/.test(p)||/\.(test|spec)\./.test(p))return 'ACTIVE_TEST_VERIFICATION_CODE';
 if(/^docs\/(compliance|audits\/recovered-history)|LEGAL_RESEARCH|CONTEXT|ROADMAP|System-Design|Sharing-Design|master_context|Phase-2-Approach|\/rcs-rag\/documents\/|\/constants\/legal\.|\/locales\/[^/]+\/legal\.json/.test(p))return 'PRODUCT_POLICY_SPECIFICATION';
 if(/^\.github\/|Dockerfile|cloudbuild|\/hosting\/|\/prisma\/migrations\/|\.tf$/.test(p))return 'INFRASTRUCTURE';
 if(/\.md$|\.txt$|\.pdf$|\.docx$/.test(p))return 'DOCUMENTATION';
 if(/(^|\/)(config|scripts)(\/)|package\.json$|tsconfig|vite\.config|babel\.config|metro\.config|app\.json$|\.codex\/|\.gitignore$|\.yaml$|\.yml$/.test(p))return 'OPERATIONAL_CONFIGURATION';
 if(/^(backend|frontend\/src|driver-app\/src|shared)\//.test(p)&&/\.(js|mjs|cjs|jsx|ts|tsx|prisma|css|json)$/.test(p))return 'ACTIVE_PRODUCTION_CODE_CANDIDATE';
 if(/^(tools|plugins|\.agents)\//.test(p))return 'DEVELOPMENT_TOOLING';
 if(/\.(png|jpe?g|webp|svg|ico|woff2?|ttf|mp4|mp3)$/.test(p))return 'STATIC_ASSET';
 return 'UNCLEAR_OWNERSHIP_OR_STATUS';
}
const inventory=[], exclusions=[];
async function countTree(dir) {let count=0;for(const e of await fs.readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isSymbolicLink())continue;if(e.isDirectory()){const c=await countTree(f);count+=c.count;}else count++;}return {count,bytes:null};}
async function walk(dir) {
 for(const e of await fs.readdir(dir,{withFileTypes:true})) {
  const abs=path.join(dir,e.name),p=path.relative(root,abs).replaceAll('\\','/');
  if(ownAudit(p))continue;
  if(e.isSymbolicLink()){exclusions.push({path:p,reason:'Symbolic link/junction; no traversal or external-device data',count:null});continue;}
  if(e.isDirectory()){if(generatedDir(p+'/')){const c=await countTree(abs);exclusions.push({path:p,category:'GENERATED_VENDOR_BUILD_OUTPUT',fileCount:c.count,bytes:c.bytes,reason:'Accounted by directory; excluded from semantic inspection'});console.log(JSON.stringify({phase:'excluded-directory-count',path:p,files:c.count}));}else await walk(abs);continue;}
  const stat=await fs.stat(abs), category=classify(p), text=/\.(js|mjs|cjs|jsx|ts|tsx|prisma|css|json|sql|md|txt|yml|yaml|toml)$/.test(p);
  let sha256=null;
  if(!sensitive(p)&&category!=='GENERATED_VENDOR_BUILD_OUTPUT'&&text&&stat.size<12_000_000)sha256=hash(await fs.readFile(abs));
  inventory.push({path:p,category,bytes:stat.size,mtime:stat.mtime.toISOString(),sha256,owner:p.split('/')[0],status:'STATIC_DISCOVERED_NOT_DEPLOYMENT_ATTESTED',semanticRead:sensitive(p)?'EXCLUDED_RESTRICTED':sha256?'ELIGIBLE':'EXCLUDED_BINARY_OR_GENERATED'});
 }
}
const startedAt=new Date().toISOString();
await walk(root);
inventory.sort((a,b)=>a.path.localeCompare(b.path));
const gitHead=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const gitStatus=execFileSync('git',['status','--porcelain=v1','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean).filter(x=>!ownAudit(x.slice(3).replaceAll('\\','/')));
await save('repository-inventory.json',{startedAt,gitHead,gitStatus,files:inventory,exclusions,identity:hash(JSON.stringify(inventory.map(({path,sha256,bytes})=>({path,sha256,bytes})))),note:'Working-tree content, including uncommitted files. Restricted content never read. Generated trees counted, not semantically inspected. No claim of atomic filesystem snapshot.'});
console.log(JSON.stringify({phase:'baseline',files:inventory.length,excludedTrees:exclusions.length}));
const req=createRequire(path.join(root,'tools/code-atlas/package.json'));
const {ts}=req('ts-morph');
const routes=[],mounts=[],writers=[],configs=[],asyncSites=[],providers=[],uiActions=[],imports=[],tests=[],transitions=[],rawSql=[];
const methods=new Set(['get','post','put','patch','delete','all','head','options']);
const writeMethods=new Set(['create','createMany','createManyAndReturn','update','updateMany','updateManyAndReturn','upsert','delete','deleteMany']);
const line=(sf,n)=>sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1;
const literal=n=>n&&ts.isStringLiteralLike(n)?n.text:null;
const txt=n=>n?.getText()||'';
function enclosing(n){for(let x=n.parent;x;x=x.parent){if(ts.isFunctionDeclaration(x)&&x.name)return x.name.text;if(ts.isVariableDeclaration(x)&&x.initializer&&(ts.isArrowFunction(x.initializer)||ts.isFunctionExpression(x.initializer)))return txt(x.name);if(ts.isCallExpression(x)&&ts.isPropertyAccessExpression(x.expression)&&methods.has(x.expression.name.text))return 'HTTP:'+x.expression.name.text+':'+(literal(x.arguments[0])||'DYNAMIC');}return 'MODULE';}
const codeFiles=inventory.filter(f=>f.sha256&&/\.(js|mjs|cjs|jsx|ts|tsx)$/.test(f.path)&&!f.path.startsWith('.agents/'));
for(const file of codeFiles){const code=await fs.readFile(path.join(root,file.path),'utf8');const sf=ts.createSourceFile(file.path,code,ts.ScriptTarget.Latest,true,/tsx$/.test(file.path)?ts.ScriptKind.TSX:/jsx$/.test(file.path)?ts.ScriptKind.JSX:undefined);const testFile=/ACTIVE_TEST/.test(file.category);let assertions=0;
 const ref=n=>({source:file.path,line:line(sf,n),owner:enclosing(n),sourceSha256:file.sha256});
 function visit(n){
  if(ts.isImportDeclaration(n)){imports.push({...ref(n),specifier:literal(n.moduleSpecifier)});}
  if(ts.isCallExpression(n)){
   const callee=txt(n.expression);
   if(ts.isPropertyAccessExpression(n.expression)){
    const object=txt(n.expression.expression),method=n.expression.name.text;
    if(methods.has(method)&&/^(router|app|\w*Router)$/.test(object)&&!testFile){routes.push({...ref(n),object,method:method.toUpperCase(),localPath:literal(n.arguments[0]),dynamicPath:!literal(n.arguments[0]),handlers:n.arguments.slice(1).map(a=>ts.isIdentifier(a)?a.text:ts.isCallExpression(a)?txt(a.expression):'INLINE')});}
    if(method==='use'&&/^(router|app|\w*Router)$/.test(object)&&!testFile){mounts.push({...ref(n),object,prefix:literal(n.arguments[0]),handlers:n.arguments.slice(literal(n.arguments[0])?1:0).map(a=>ts.isIdentifier(a)?a.text:ts.isCallExpression(a)?txt(a.expression):'DYNAMIC')});}
    if(writeMethods.has(method)&&/\.(\w+)$/.test(object)&&/\b(prisma|tx|db|client)\./.test(object)){writers.push({...ref(n),model:object.split('.').at(-1),method,testFile,transactionContext:/\btx\./.test(object)});}
    if(/\$(executeRaw|queryRaw)/.test(method)&&!testFile)rawSql.push({...ref(n),method,tagged:false});
    if(/assert|expect/.test(callee))assertions++;
   }
   if(['setInterval','setTimeout','schedule','cron.schedule'].includes(callee)||/queue\.(add|process)|\.enqueue$|registerTask|defineTask/.test(callee))asyncSites.push({...ref(n),callee,testFile});
   if(/^(require|import)$/.test(callee)&&literal(n.arguments[0]))imports.push({...ref(n),specifier:literal(n.arguments[0]),dynamic:true});
   if(/^(test|it|describe)$|^test\.|^it\./.test(callee)&&testFile)tests.push({...ref(n),kind:callee,title:literal(n.arguments[0])||'DYNAMIC',assertions:'See file assertion count; not executed'});
   if(!testFile&&(/axios\.|fetch$|sendPush|sendWhatsApp|razorpay|google|clerk|supabase|cloudinary|openai|Jev|Luna/i.test(callee)))providers.push({...ref(n),callee,boundary:'STATIC_CALL_CANDIDATE'});
  }
  if(ts.isTaggedTemplateExpression(n)&&/\$(queryRaw|executeRaw)/.test(txt(n.tag))&&!testFile)rawSql.push({...ref(n),method:txt(n.tag),tagged:true});
  if(ts.isPropertyAccessExpression(n)&&/^process\.env\.[A-Za-z0-9_]+$/.test(txt(n)))configs.push({...ref(n),key:n.name.text,testFile,value:'WITHHELD'});
  if(ts.isElementAccessExpression(n)&&txt(n.expression)==='process.env'&&literal(n.argumentExpression))configs.push({...ref(n),key:literal(n.argumentExpression),testFile,value:'WITHHELD'});
  if((ts.isPropertyAssignment(n)||ts.isJsxAttribute(n))&&['status','bookingStatus'].includes(txt(n.name))){const val=literal(n.initializer);if(val&&!testFile)transitions.push({...ref(n),to:val,kind:'WRITE_OR_PREDICATE_CANDIDATE'});}
  if(ts.isJsxAttribute(n)&&/^(onClick|onPress|onSubmit|onSwipe|onChange|onRefresh|onDismiss|onConfirm|onAccept|onReject)$/.test(txt(n.name)))uiActions.push({...ref(n),event:txt(n.name),handler:n.initializer&&ts.isJsxExpression(n.initializer)&&n.initializer.expression&&ts.isIdentifier(n.initializer.expression)?txt(n.initializer.expression):'INLINE_OR_DYNAMIC'});
  ts.forEachChild(n,visit);
 }visit(sf);if(testFile)file.assertionSites=assertions;
}
const idxImports=new Map();
for(const file of codeFiles){const text=await fs.readFile(path.join(root,file.path),'utf8');const sf=ts.createSourceFile(file.path,text,ts.ScriptTarget.Latest,true);const bindings={};for(const st of sf.statements)if(ts.isImportDeclaration(st)&&st.importClause){const mod=literal(st.moduleSpecifier);if(st.importClause.name)bindings[st.importClause.name.text]=mod;if(st.importClause.namedBindings&&ts.isNamedImports(st.importClause.namedBindings))for(const e of st.importClause.namedBindings.elements)bindings[e.name.text]=mod;}idxImports.set(file.path,bindings);}
function resolve(from,spec){if(!spec?.startsWith('.'))return null;let target=path.posix.normalize(path.posix.join(path.posix.dirname(from),spec));const paths=new Set(inventory.map(f=>f.path));for(const c of [target,target.replace(/\.js$/,'.ts'),target.replace(/\.js$/,'.tsx'),...['.js','.jsx','.ts','.tsx','.mjs','/index.js','/index.ts'].map(e=>target+e)])if(paths.has(c))return c;return null;}
for(const imp of imports)imp.resolved=resolve(imp.source,imp.specifier);
for(const m of mounts)m.targets=m.handlers.map(h=>resolve(m.source,idxImports.get(m.source)?.[h])).filter(Boolean);
for(const r of routes){const matches=mounts.filter(m=>m.targets.includes(r.source));r.registered=r.object==='app'||matches.length>0;r.fullPaths=r.object==='app'?[r.localPath]:matches.map(m=>(m.prefix||'')+(r.localPath==='/'?'':r.localPath||'/DYNAMIC'));r.registrationConfidence=r.registered?'STATIC_REGISTERED':'UNKNOWN_NOT_MOUNT_RESOLVED';}
const schema=await fs.readFile(path.join(root,'backend/prisma/schema.prisma'),'utf8');const models=[...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map(m=>({name:m[1],source:'backend/prisma/schema.prisma',line:schema.slice(0,m.index).split('\n').length,writerCount:writers.filter(w=>w.model.toLowerCase()===m[1].toLowerCase()&&!w.testFile).length}));
const policyDoc='docs/audits/recovered-history/scheduled-ride-spec-v1-and-vm-2026-09-23.md';const ptext=await fs.readFile(path.join(root,policyDoc),'utf8');const vm=ptext.split('\n').flatMap((s,i)=>/^\| VM-\d{3}/.test(s)?[{id:s.split('|')[1].trim(),fields:s.split('|').slice(2,-1).map(x=>x.trim()),source:policyDoc,line:i+1}]:[]);
await save('discovery.json',{routes,mounts,writers,rawSql,configs,asyncSites,providers,uiActions,imports,tests,transitions,models,vm,methods:{ast:'TypeScript parser independently of Atlas; literal Express routes + mounts; Prisma delegate writes + raw SQL candidates; JSX event registrations; environment-key references; timer/queue candidates',limits:'Dynamic dispatch, aliases other than prisma/tx/db/client, computed SQL, JSX prop indirection, dead code and deployed configuration need manual resolution. Static declaration does not prove deployed execution.'}});
console.log(JSON.stringify({phase:'independent',routes:routes.length,registered:routes.filter(x=>x.registered).length,models:models.length,writers:writers.filter(x=>!x.testFile).length,vm:vm.length,uiActions:uiActions.length}));
await graphOnly();

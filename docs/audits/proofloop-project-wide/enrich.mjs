// Complementary AST pass: actual router constructs, constant rules and symbol summaries.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const out=path.join(root,'output/proofloop-project-wide-audit-2026-10-11');
const req=createRequire(path.join(root,'tools/code-atlas/package.json'));const {ts}=req('ts-morph');
const inv=JSON.parse(await fs.readFile(path.join(out,'repository-inventory.json'),'utf8'));
const nav=[],constants=[],symbols=[],envAliases=[],states=[],clientCalls=[],ormMutations=[];
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const ref=(p,sf,n)=>({source:p,line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1});
const str=n=>n&&ts.isStringLiteralLike(n)?n.text:null;
const text=n=>n?.getText()||'';
const safeCallee=n=>/^[\w.$?]+$/.test(text(n))?text(n):'DYNAMIC_CALLEE';
const property=(n,key)=>n?.properties?.find(x=>ts.isPropertyAssignment(x)&&text(x.name)===key)?.initializer;
function owner(n){for(let q=n.parent;q;q=q.parent){if(ts.isFunctionDeclaration(q))return q.name?.text||'ANONYMOUS';if(ts.isVariableDeclaration(q)&&q.initializer&&(ts.isArrowFunction(q.initializer)||ts.isFunctionExpression(q.initializer)))return text(q.name);}return 'MODULE';}
for(const f of inv.files.filter(f=>f.sha256&&/\.(js|mjs|cjs|jsx|ts|tsx)$/.test(f.path)&&!f.path.startsWith('.agents/')&&!/(^|\/)(\.tmp[^/]*|_expo)(\/|$)|^ds-bundle\/_ds_bundle\./.test(f.path))){const code=await fs.readFile(path.join(root,f.path),'utf8'),sf=ts.createSourceFile(f.path,code,ts.ScriptTarget.Latest,true,/tsx$/.test(f.path)?ts.ScriptKind.TSX:/jsx$/.test(f.path)?ts.ScriptKind.JSX:undefined),test=/ACTIVE_TEST/.test(f.category);
 function visit(n){
  if(ts.isFunctionDeclaration(n)||ts.isArrowFunction(n)||ts.isFunctionExpression(n)){const body=n.body;if(body){const calls=[],writes=[];let catches=0,throws=0,branches=0;function walk(q){if(q!==body&&(ts.isFunctionDeclaration(q)||ts.isArrowFunction(q)||ts.isFunctionExpression(q)))return;if(ts.isCallExpression(q))calls.push({callee:safeCallee(q.expression),line:ref(f.path,sf,q).line});if(ts.isThrowStatement(q))throws++;if(ts.isCatchClause(q))catches++;if(ts.isIfStatement(q)||ts.isConditionalExpression(q)||ts.isCaseClause(q))branches++;if(ts.isPropertyAssignment(q)&&['status','driverId','walletBalance','amount','expiresAt'].includes(text(q.name)))writes.push({field:text(q.name),value:str(q.initializer)||(/^[\w.]+$/.test(text(q.initializer))?text(q.initializer):'EXPRESSION'),line:ref(f.path,sf,q).line});ts.forEachChild(q,walk);}walk(body);symbols.push({...ref(f.path,sf,n),name:ts.isFunctionDeclaration(n)?n.name?.text||'ANONYMOUS':owner(n),endLine:sf.getLineAndCharacterOfPosition(n.end).line+1,calls,writeOrPredicateFields:writes,catches,throws,branches,testFile:test});}}
  if(ts.isVariableDeclaration(n)&&/^[A-Z][A-Z0-9_]+$/.test(text(n.name))&&!test&&/^(backend\/(services|constants|lib)|frontend\/src\/constants|driver-app\/src\/(constants|hooks|lib))\//.test(f.path)){
   const v=n.initializer;
   if(v&&(ts.isNumericLiteral(v)||ts.isBinaryExpression(v)&&/^[\d_\s+*\-/().]+$/.test(text(v))||ts.isCallExpression(v)&&text(v.expression)==='Object.freeze'&&ts.isArrayLiteralExpression(v.arguments[0])&&/tiers|rates|charges|reasons|rewards/i.test(text(n.name))))constants.push({...ref(f.path,sf,n),name:text(n.name),statement:text(n.name)+' = '+text(v),sourceSha256:f.sha256,status:'IMPLEMENTATION_VALUE_APPROVAL_PROVENANCE_UNKNOWN'});
  }
  if(!test&&ts.isPropertyAccessExpression(n)&&(/^(env|config)\.[A-Z][A-Z0-9_]+$/.test(text(n))||/^import\.meta\.env\.[A-Z][A-Z0-9_]+$/.test(text(n))))envAliases.push({...ref(f.path,sf,n),key:n.name.text,base:text(n.expression),value:'NOT_READ',status:'ALIAS_OR_CLIENT_CONFIG_REFERENCE'});
  if(ts.isCallExpression(n)&&!test){const c=text(n.expression);if(/^(api|request|fetch)$|\.(get|post|patch|put|delete)$/.test(c)&&/^(frontend|driver-app)\/src\//.test(f.path))clientCalls.push({...ref(f.path,sf,n),callee:c,path:str(n.arguments[0])||'DYNAMIC',owner:owner(n)});
   if(/\b(prisma|tx|db|client)\.[\w.]+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)$/.test(c)){const fields=new Set();function keys(q){if(ts.isPropertyAssignment(q))fields.add(text(q.name));ts.forEachChild(q,keys);}if(n.arguments[0])keys(n.arguments[0]);const all=[...fields];ormMutations.push({...ref(f.path,sf,n),owner:owner(n),callee:safeCallee(n.expression),fields:all,financial:all.some(k=>/^(amount|walletBalance|fare|rideFare|customerPayment|commissionPct|commissionAmt|couponAmount|scheduledAdvance|scheduledRemaining|refund|payout|liability|compensation|earning)/i.test(k)),dataShape:n.arguments[0]&&ts.isObjectLiteralExpression(n.arguments[0])?'OBJECT_WITH_KEYS':'DYNAMIC_INPUT'});}
   if(/\.(create|update|updateMany|upsert)$/.test(c)&&/\.booking\./.test(c)){const arg=n.arguments[0],data=property(arg,'data')||property(arg,'create'),where=property(arg,'where'),to=property(data,'status'),from=property(where,'status');states.push({...ref(f.path,sf,n),owner:owner(n),operation:c,from:from?str(from)||'DYNAMIC_PREDICATE':'UNSPECIFIED',to:to?str(to)||text(to).slice(0,120):'UNCHANGED',kind:'ACTUAL_BOOKING_WRITE_WITH_DYNAMIC_EDGES_EXPLICIT'});}
   if(c==='createBrowserRouter'){function routeWalk(q){if(ts.isObjectLiteralExpression(q)){const p=property(q,'path'),index=property(q,'index'),element=property(q,'element');if(p||index||element){nav.push({...ref(f.path,sf,q),path:str(p)||index?'INDEX_OR_LITERAL_RESOLVED_BELOW':'LAYOUT',literalPath:str(p),index:!!index,elementComponents:element?text(element).match(/<([A-Z]\w*)/g)?.map(x=>x.slice(1))||[]:[],kind:'BROWSER_ROUTER_OBJECT'});}}ts.forEachChild(q,routeWalk);}for(const a of n.arguments)routeWalk(a);}
  }
  if(!test&&(ts.isJsxSelfClosingElement(n)||ts.isJsxOpeningElement(n))&&text(n.tagName)==='Route'){const attrs=n.attributes.properties,p=attrs.find(a=>text(a.name)==='path'),index=attrs.find(a=>text(a.name)==='index'),element=attrs.find(a=>text(a.name)==='element');nav.push({...ref(f.path,sf,n),literalPath:str(p?.initializer),index:!!index,elementComponents:element?text(element).match(/<([A-Z]\w*)/g)?.map(x=>x.slice(1))||[]:[],kind:'REACT_ROUTE_JSX'});}
  ts.forEachChild(n,visit);
 }visit(sf);
}
for(const n of nav){n.path=n.literalPath||(n.index?'INDEX':'PATHLESS_LAYOUT');n.id='NAV-'+hash(n.source+':'+n.line+':'+n.path).slice(0,12);delete n.literalPath;}
await fs.writeFile(path.join(out,'complementary-discovery.json'),JSON.stringify({navigation:nav,constants,symbols,environmentAliases:envAliases,bookingWrites:states,ormMutations,clientCalls,limits:'Syntax summaries describe concrete call/guard/write shapes, not interpreted contract proof. Computed paths/aliases/dynamic writes retain explicit uncertainty. Numeric constants do not imply owner approval.'},null,2)+'\n');
console.log(JSON.stringify({navigation:nav.length,constants:constants.length,symbols:symbols.length,environmentAliases:envAliases.length,bookingWrites:states.length,clientCalls:clientCalls.length}));

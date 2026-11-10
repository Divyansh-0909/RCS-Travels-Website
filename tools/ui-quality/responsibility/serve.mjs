// Loopback-only verification of the real application. No runtime .env or production API.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createBrowserAuth,browserPublishableKey} from '../../../backend/tests/helpers/phase9BrowserAuth.js';
import {installCaseFixture} from './fixture.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const front=createRequire(path.join(root,'frontend/package.json')),back=createRequire(path.join(root,'backend/package.json'));
const {createServer}=await import(pathToFileURL(front.resolve('vite')).href),express=back('express');
const port=1591,origin=`http://127.0.0.1:${port}`;
const actor={id:'synthetic_review_admin',clerkId:'user_synthetic_review_admin',name:'Synthetic review admin',role:'admin',phone:'synthetic-admin',bookingCode:'SYNTHETIC'};
const auth=createBrowserAuth({admin:actor}),app=express();app.use(express.json());
app.use('/fixture-clerk',express.static(path.join(root,'frontend/node_modules/@clerk/clerk-js/dist')));
app.use('/fixture-auth',(req,res,next)=>{if(!req.headers.cookie?.includes('fixture_actor='))req.headers.cookie=(req.headers.cookie||'')+'; fixture_actor=admin';auth.middleware(req,res,next);});
app.get('/api/users/me',(_req,res)=>res.json(actor));installCaseFixture(app);
app.use('/api',(_req,res)=>res.status(409).json({error:'This operation is unavailable in the isolated review preview.'}));
const fixture=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
const fixtureUrl=`http://127.0.0.1:${fixture.address().port}`;
const envDir=path.join(root,'output/handoff/responsibility-production-integration-2026-11-05/empty-env');fs.mkdirSync(envDir,{recursive:true});
const vite=await createServer({root:path.join(root,'frontend'),configFile:path.join(root,'frontend/vite.config.js'),envDir,
  define:{'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY':JSON.stringify(browserPublishableKey),'import.meta.env.VITE_API_BASE_URL':JSON.stringify(origin)},
  plugins:[{name:'isolated-responsibility-verification',enforce:'pre',transform(code,id){
    if(!id.replaceAll('\\','/').endsWith('/src/main.jsx'))return;
    return code.replace('<ClerkProvider publishableKey={PUBLISHABLE_KEY}>','<ClerkProvider publishableKey={PUBLISHABLE_KEY} clerkJSUrl="/fixture-clerk/clerk.headless.browser.js" proxyUrl="/fixture-auth">');
  }}],server:{host:'127.0.0.1',port,strictPort:true,cors:false,proxy:{'/api':fixtureUrl,'/fixture-clerk':fixtureUrl,'/fixture-auth':fixtureUrl}}});
await vite.listen();console.log(`${origin}/dashboard/responsibility — actual page, synthetic local data`);
const close=async()=>{await vite.close();fixture.close(()=>process.exit());};process.on('SIGINT',close);process.on('SIGTERM',close);

import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,dirname,resolve,sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import http from 'node:http';
import express from 'express';
import { hash } from '../../../tools/phase9-native/stage.mjs';
import { nativeClerkEnvironment } from '../helpers/phase9NativeClerkEnvironment.js';

const base='output/phase9-native-device-2026-10-10';
const report=JSON.parse(await fs.readFile(base+'/mutation-witnesses.json','utf8'));
const owned=await fs.mkdtemp(join(tmpdir(),'rcs-native-equivalence-'));
const witnesses=[];
const plain=value=>JSON.parse(JSON.stringify(value));
function replace(source,mutant) {
  const lines=source.split('\n');
  const offset=p=>lines.slice(0,p.line-1).reduce((sum,line)=>sum+line.length+1,0)+p.column-1;
  // Stryker substitutes AST expressions; retain their grouping when reproducing
  // a replacement inside a larger logical expression.
  return source.slice(0,offset(mutant.location.start))+'('+mutant.replacement+')'+source.slice(offset(mutant.location.end));
}
async function load(file,source,overrides={}) {
  const context=vm.createContext({Buffer,URL,Headers,Request,Response,console});
  const module=new vm.SourceTextModule(source,{context,identifier:pathToFileURL(resolve(file)).href,
    initializeImportMeta(meta){meta.url=pathToFileURL(resolve(file)).href;}});
  await module.link(async name=>{
    let exports=overrides[name];
    if(!exports) {
      if(name.startsWith('node:'))exports=await import(name);
      else if(name === './stage.mjs')exports={hash,TEST_PACKAGE:'com.rcstravels.driver.phase9'};
      else if(name === 'express')exports={default:express};
      else if(name === './phase9NativeClerkEnvironment.js')exports={nativeClerkEnvironment};
      else throw Error('Unexpected equivalence import: '+name);
    }
    const keys=Object.keys(exports);
    return new vm.SyntheticModule(keys,function(){for(const key of keys)this.setExport(key,exports[key]);},{context});
  });
  await module.evaluate();return module.namespace;
}
const outcome=work=>{try{return {value:plain(work())};}catch(error){return {error:error.message};}};
async function stageFixture() {
  const root=join(owned,'fixture');
  const app=join(root,'driver-app');
  for(const folder of ['src','assets','node_modules','android/app/src/main'])await fs.mkdir(join(app,folder),{recursive:true});
  await fs.mkdir(join(root,'shared'),{recursive:true});
  const files={
    'package.json':JSON.stringify({dependencies:{expo:'~55.0.0'},description:'Unicode \u0915\u092a\u094d\u0924\u093e\u0928'}),
    'app.json':JSON.stringify({expo:{android:{package:'com.rcstravels.driver'},name:'Unicode \u00e9'}}),
    'index.ts':"// Unicode \u0915\u092a\u094d\u0924\u093e\u0928\nexport const fixture=1;\n",
    'metro.config.js':'// Unicode \u00e9\nmodule.exports={watchFolders:[],resolver:{}};',
    'android/app/build.gradle':"applicationId 'com.rcstravels.driver'\ndebug {\n signingConfig signingConfigs.debug\n}\napply plugin: 'com.google.gms.google-services'\n",
    'android/app/src/main/AndroidManifest.xml':'<manifest><application android:allowBackup="true"></application></manifest>',
  };
  for(const [file,body]of Object.entries(files))await fs.writeFile(join(app,file),body);
  return {root,app,files};
}
async function gatewayObservation(module,apiUrl) {
  const gateway=await module.createNativeGateway({apiUrl});
  try {
    const values=[];
    for(const mode of ['absent','empty','json','text'])for(const method of ['GET','HEAD']) {
      const response=await fetch(gateway.url+'/'+mode,{method,signal:AbortSignal.timeout(3000)});
      values.push({mode,method,status:response.status,headers:[...response.headers].filter(([key])=>!['date','connection','keep-alive'].includes(key)),body:await response.text()});
    }
    return values;
  } finally {await gateway.close();}
}
try {
  const fixture=await stageFixture();
  for(const [file,entry]of Object.entries(report.files)) {
    assert.equal(hash(await fs.readFile(file)),hash(entry.source),'Reviewed source changed');
    for(const mutant of entry.mutants.filter(m=>m.status === 'Survived')) {
      const original=await load(file,entry.source);
      const changed=await load(file,replace(entry.source,mutant));
      let reason;
      if(file.endsWith('device.mjs')) {
        for(const delimiter of [' ','  ','\t',' \t '])for(const serial of ['SYNTHETICUSB','USB-01','USB_02']) {
          const input=serial+delimiter+'device product:fixture';
          assert.deepEqual(outcome(()=>original.selectPhysicalDevice(input)),outcome(()=>changed.selectPhysicalDevice(input)));
        }
        reason='Both splits return the first non-whitespace token after the existing anchored non-whitespace selection filter.';
      } else if(file.endsWith('path.mjs')) {
        for(const drive of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')for(const slash of ['\\','/']) {
          const path=drive+':'+slash+'repository';
          assert.deepEqual(outcome(()=>original.nativeRuntimeDestination(path,'217ad898-fixture')),outcome(()=>changed.nativeRuntimeDestination(path,'217ad898-fixture')));
        }
        for(const path of ['relative','\\\\server\\share','\\\\server\\D:\\','/root'])assert.deepEqual(outcome(()=>original.nativeRuntimeDestination(path,'217ad898-fixture')),outcome(()=>changed.nativeRuntimeDestination(path,'217ad898-fixture')));
        reason='A win32.parse root beginning with a drive letter/colon/separator is exactly that three-character root; the trailing anchor is redundant.';
      } else if(file.endsWith('phone-awake-core.mjs')&&mutant.location.start.line===11) {
        for(const value of ['null','0','00','2','2147483647','2147483648','9007199254740992','-1','0.5','Infinity','x',...Array.from({length:256},(_,index)=>String(index))])assert.deepEqual(outcome(()=>original.awakeValue(value)),outcome(()=>changed.awakeValue(value)));
        reason='The prior null/digits regex and remaining upper bound imply a nonnegative safe integer; these three predicate variants preserve the accepted set.';
      } else if(file.endsWith('phone-awake-core.mjs')) {
        const results=[];
        for(const [index,source]of [entry.source,replace(entry.source,mutant)].entries()) {
          const directory=join(owned,'store-'+mutant.id+'-'+index);await fs.mkdir(directory);
          const fileName=join(directory,'state.json');const calls=[];let collision=false;
          const io={...fs,writeFile:async(path,value,options)=>{
            calls.push({path,options});assert.equal(dirname(path),directory);assert.notEqual(path,fileName);
            if(collision)await fs.writeFile(path,'untouched');
            return fs.writeFile(path,value,options);
          }};
          const module=await load(file,source,{'node:fs/promises':io,'node:crypto':{randomUUID:()=> '217ad898-2a99-454e-ab79-82cfc583e182'}});
          const store=module.createFileStore(fileName);const state={active:true,value:'Unicode \u0915\u092a\u094d\u0924\u093e\u0928',nested:[null,1]};
          await store.write(state);assert.deepEqual(plain(await store.read()),state);
          assert.deepEqual(await fs.readdir(directory),['state.json']);
          collision=true;await assert.rejects(()=>store.write({active:false}),error=>error.code === 'EEXIST');
          assert.deepEqual(plain(await store.read()),state);assert.equal(await fs.readFile(calls.at(-1).path,'utf8'),'untouched');
          results.push(state);
        }
        assert.deepEqual(results[0],results[1]);
        reason=mutant.location.start.line===48?'JSON.parse converts a Buffer through the same UTF-8 decoding; the file store writes UTF-8 JSON.':'Temporary names are internal generated identities: both retain a unique sibling, exclusive creation and atomic rename; punctuation is not a caller format contract.';
      } else if(file.endsWith('stage.mjs')) {
        for(const variant of ['fresh','marker','crlf']) {
          await fs.writeFile(join(fixture.app,'metro.config.js'),fixture.files['metro.config.js']+(variant==='marker'?'\n// RCS_PHASE9_NATIVE_DEPENDENCIES':''));
          await fs.writeFile(join(fixture.app,'android/app/build.gradle'),variant==='crlf'?fixture.files['android/app/build.gradle'].replaceAll('\n','\r\n'):fixture.files['android/app/build.gradle']);
          const a=await original.stageNativeApp(fixture.root,join(owned,'stage-'+mutant.id+'-'+variant+'-a'));
          const b=await changed.stageNativeApp(fixture.root,join(owned,'stage-'+mutant.id+'-'+variant+'-b'));
          assert.deepEqual(plain(await original.stagedSourceHashes(a)),plain(await changed.stagedSourceHashes(b)));
        }
        reason=mutant.mutatorName==='Regex'?'The greedy dot-star already consumes the plugin line through its end.':'UTF-8 read/string coercion produces identical JSON, concatenated entry text and ASCII-marker detection; full staged byte hashes match.';
      } else if(file.endsWith('transport.mjs')) {
        for(const input of ['http://127.0.0.1:7/a',new URL('http://127.0.0.1:7/a'),new Request('http://127.0.0.1:7/a'),new Request('https://phase9.clerk.accounts.dev/v1/client',{headers:{fixture:'kept'}})]) {
          const observe=module=>module.createNativeFetch(async(target,init)=>({target:typeof target==='string'?target:target.url,headers:[...new Headers(init?.headers)]}),'http://127.0.0.1:7',true)(input);
          assert.deepEqual(plain(await observe(original)),plain(await observe(changed)));
        }
        reason='For supported string/URL/Request inputs an absent headers property reads undefined; a present one is read in both versions.';
      } else if(file.endsWith('phase9NativeGateway.js')) {
        const server=http.createServer((req,res)=>{const mode=req.url.slice(1);if(mode==='empty')res.setHeader('content-type','');if(mode==='json')res.setHeader('content-type','application/json');if(mode==='text')res.setHeader('content-type','text/plain');res.end('synthetic');});
        await new Promise(done=>server.listen(0,'127.0.0.1',done));
        try {const url='http://127.0.0.1:'+server.address().port;assert.deepEqual(await gatewayObservation(original,url),await gatewayObservation(changed,url));}
        finally {server.closeAllConnections();await new Promise(done=>server.close(done));}
        reason='With missing/empty content-type, Express Buffer sending replaces the falsey type with its default; GET/HEAD bytes, status and headers match.';
      } else throw Error('Unreviewed survivor '+file);
      witnesses.push({file,location:mutant.location,mutator:mutant.mutatorName,replacement:mutant.replacement,sourceSha256:hash(entry.source),reason});
    }
  }
  assert.equal(witnesses.length,15);
  await fs.writeFile(base+'/reviewed-native-equivalences.json',JSON.stringify({witnesses,meaningfulSurvivors:0,scope:'Current supported typed inputs; internal temporary names compared as generated identities'},null,2));
  console.log('Reviewed equivalence witnesses: 15/15 PASS');
} finally {assert.ok(resolve(owned).startsWith(resolve(tmpdir())+sep));await fs.rm(owned,{recursive:true,force:true});}

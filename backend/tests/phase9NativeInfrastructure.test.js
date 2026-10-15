import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import net from 'node:net';
import { createNativeGateway } from './helpers/phase9NativeGateway.js';
import { selectPhysicalDevice, physicalDevice, verifyTestApk, installTestApk } from '../../tools/phase9-native/device.mjs';
import { hash } from '../../tools/phase9-native/stage.mjs';
import { nativeClerkEnvironment, nativePublishableKey } from './helpers/phase9NativeClerkEnvironment.js';

const usb = 'SYNTHETICUSB device product:fixture model:fixture transport_id:1';
const badging = "package: name='com.rcstravels.driver.phase9' versionCode='1'\napplication-debuggable\n";
const fetch = (input,init) => globalThis.fetch(input,{ signal:AbortSignal.timeout(1500),...init });
test('native Clerk environment supplies SDK billing fields without changing signed sessions or roles', () => {
  assert.match(nativePublishableKey,/^pk_test_[A-Za-z0-9_-]+$/);
  assert.equal(Buffer.from(nativePublishableKey.slice(8),'base64url').toString(),'phase9.clerk.accounts.dev$');
  assert.match('__clerk_cache_environment_' + nativePublishableKey.slice(-5),/^[A-Za-z0-9._-]+$/);
  const source={ response:{ object:'environment',commerce_settings:{} },client:{ sessions:[{ token:'synthetic signed token',role:'captain' }] } };
  const result=nativeClerkEnvironment(source);
  assert.deepEqual(source.response.commerce_settings,{});
  assert.equal(result.client,source.client);
  assert.deepEqual(result.response.commerce_settings.billing,{ stripe_publishable_key:null,
    organization:{ enabled:false,has_paid_plans:false },user:{ enabled:false,has_paid_plans:false } });
  assert.deepEqual(nativeClerkEnvironment({ response:{} }).response.commerce_settings.billing,result.response.commerce_settings.billing);
  const existing={ stripe_publishable_key:'synthetic fixture',organization:{enabled:true,has_paid_plans:true},user:{enabled:true} };
  assert.deepEqual(nativeClerkEnvironment({ response:{commerce_settings:{billing:existing}} }).response.commerce_settings.billing,
    {...existing,user:{enabled:true,has_paid_plans:false}});
});
async function gatewayForTest(t,harness) {
  const original = net.Server.prototype.listen;
  const servers = [];
  let closeCalls = 0;
  net.Server.prototype.listen = function (...args) {
    assert.equal(args[1],'127.0.0.1');
    servers.push(this);
    const close = this.closeAllConnections;
    this.closeAllConnections = function () { closeCalls++; return close.call(this); };
    return original.apply(this,args);
  };
  let gateway;
  const bounded = async work => {
    let timer;
    try { return await Promise.race([work,new Promise((_,reject) => { timer=setTimeout(() => reject(new Error('Native gateway operation did not complete')),1800); })]); }
    finally { clearTimeout(timer); }
  };
  t.after(async () => {
    try {
      if (gateway) { await bounded(gateway.close()); assert.ok(closeCalls > 0,'Gateway close must stop active connections'); }
    } finally {
      for (const server of servers) {
        http.Server.prototype.closeAllConnections.call(server);
        if (server.listening) await new Promise(done => server.close(done));
      }
    }
  });
  try {
    gateway = await bounded(createNativeGateway(harness));
    assert.ok(gateway); assert.equal(gateway.requests.length,0); assert.equal(gateway.faults.length,0);
    return gateway;
  } finally { net.Server.prototype.listen = original; }
}
test('native selection rejects absent, unauthorized, multiple and wireless devices', () => {
  assert.equal(selectPhysicalDevice('List of devices attached\n' + usb),'SYNTHETICUSB');
  for (const value of ['', 'ONLY unauthorized transport_id:1',usb + '\nOTHER device model:fixture',
    'emulator-5554 device model:fixture','127.0.0.1:5555 device model:fixture','bad;serial device model:fixture',
    'adb-SYNTHETICUSB-name._adb-tls-connect._tcp device model:fixture']) {
    assert.throws(() => selectPhysicalDevice(value),/Exactly one authorized physical USB device|Wireless or invalid device identity rejected/);
  }
  assert.equal(selectPhysicalDevice('List of devices attached\r\n' + usb.replace(' device','\t  device') + '\r\n'),'SYNTHETICUSB');
  assert.throws(() => selectPhysicalDevice('prefix ' + usb),/Exactly one/);
});
test('every ADB operation binds the selected physical USB device', async () => {
  const calls = [];
  const device = await physicalDevice(async (...args) => { calls.push(args); return { stdout: calls.length === 1 ? usb : calls.length === 2 ? ' SYNTHETICUSB\n' : 'fixture' }; });
  assert.equal(device.serial,'SYNTHETICUSB');
  assert.equal(await device.adb('shell','getprop','ro.product.model'),'fixture');
  assert.deepEqual(calls[0][1],['devices','-l']);
  assert.deepEqual(calls[1][1],['-d','get-serialno']);
  assert.deepEqual(calls[2][1],['-s','SYNTHETICUSB','shell','getprop','ro.product.model']);
  assert.equal(calls[2][2].windowsHide,true);
  assert.equal(calls[0][0],'C:/Android/platform-tools/adb.exe'); assert.deepEqual(calls[0][2],{ windowsHide:true });
  assert.deepEqual(calls[1][2],{ windowsHide:true });
  assert.deepEqual(calls[2][2],{ windowsHide:true,timeout:120000,maxBuffer:2097152 });
  await assert.rejects(() => physicalDevice(async (_command,args) => ({ stdout:args[0] === 'devices' ? usb : 'OTHERUSB' })),/authorized USB/);
  const failure = await physicalDevice(async (_command,args) => {
    if (args[0] === 'devices') return { stdout:usb };
    if (args[0] === '-d') return { stdout:'SYNTHETICUSB' };
    throw new Error('Private device identity SYNTHETICUSB');
  });
  await assert.rejects(() => failure.adb('shell','pidof','fixture'),error => error.message.includes('redacted') && !error.message.includes('SYNTHETICUSB'));
});
test('APK isolation requires the exact test identity and a debug build', () => {
  verifyTestApk(badging);
  assert.throws(() => verifyTestApk(badging.replace('.phase9','')));
  assert.throws(() => verifyTestApk(badging.replace('application-debuggable','')));
  assert.throws(() => verifyTestApk('prefix ' + badging));
  assert.throws(() => verifyTestApk(badging.replace('application-debuggable','prefix application-debuggable')));
});
test('first installation targets only primary-user fresh test package and never replaces an app', async () => {
  const calls = [];
  const run = async (command,args,options) => { assert.equal(command,'C:/Android/build-tools/36.0.0/aapt.exe'); assert.deepEqual(args,['dump','badging','fixture.apk']); assert.deepEqual(options,{ windowsHide:true }); return { stdout: badging }; };
  const result = await installTestApk({ adb: async (...args) => { calls.push(args); return ''; } },'fixture.apk',run);
  assert.deepEqual(calls,[['shell','pm','list','packages','--user','0','com.rcstravels.driver.phase9'],['install','--user','0','fixture.apk']]);
  assert.equal(result.overwrittenPackage,false);
  assert.equal(result.package,'com.rcstravels.driver.phase9'); assert.equal(result.primaryAndroidUser,0);
  await assert.rejects(() => installTestApk({ adb: async () => 'package:com.rcstravels.driver.phase9' },'fixture.apk',run),/already installed/);
  await installTestApk({ adb:async (...args) => args[0] === 'shell' ? ' \n ' : '' },'fixture.apk',run);
  await assert.rejects(() => installTestApk({ adb: async () => '' },'fixture.apk',async () => ({ stdout:badging.replace('.phase9','') })),/com/);
});
test('owned APK upgrade checks its predecessor and final bytes while preserving app data', async () => {
  const previous=hash('synthetic previous APK'),expected=hash('synthetic next APK');
  const path='/data/app/com.rcstravels.driver.phase9-test/base.apk';
  const calls=[];let current=previous;
  const device={adb:async (...args)=>{calls.push(args);
    if(args[0] === 'install'){assert.deepEqual(args,['install','-r','--user','0','fixture.apk']);current=expected;return 'Success';}
    if(args[2] === 'path')return 'package:'+path;
    if(args[1] === 'sha256sum')return '\n'+current+'  '+path+'\n';
    return 'package:com.rcstravels.driver.phase9';
  }};
  const run=async()=>({stdout:badging});
  const result=await installTestApk(device,'fixture.apk',run,expected,previous);
  assert.deepEqual(result,{package:'com.rcstravels.driver.phase9',primaryAndroidUser:0,overwrittenPackage:true,upgradedVerifiedBuild:true,previousHash:previous});
  assert.equal(calls.filter(args=>args[0] === 'install').length,1);
  assert.equal(calls.some(args=>args.includes('clear') || args.includes('uninstall')),false);
  assert.equal((await installTestApk(device,'fixture.apk',run,expected,previous)).reusedVerifiedBuild,true);
  current=previous;
  await assert.rejects(()=>installTestApk(device,'fixture.apk',run,expected,'wrong'),/match/);
  await assert.rejects(()=>installTestApk(device,'fixture.apk',run,'wrong',previous),/match/);
  await assert.rejects(()=>installTestApk(device,'fixture.apk',run,expected,hash('unknown APK')),/predecessor/);
  const malformed={adb:async(...args)=>args[1] === 'sha256sum' ? 'x'+previous+'  '+path:device.adb(...args)};
  await assert.rejects(()=>installTestApk(malformed,'fixture.apk',run,expected,'x'+previous),/match/);
  const trailing={adb:async(...args)=>args[1] === 'sha256sum' ? previous+'x  '+path:device.adb(...args)};
  await assert.rejects(()=>installTestApk(trailing,'fixture.apk',run,expected,previous+'x'),/match/);
  await assert.rejects(()=>installTestApk(device,'fixture.apk',run,'x'+expected,previous),/match/);
  await assert.rejects(()=>installTestApk(device,'fixture.apk',run,expected+'x',previous),/match/);
  const failed={adb:async(...args)=>{if(args[0] === 'install')throw Error('Signature mismatch');return device.adb(...args)}};
  await assert.rejects(()=>installTestApk(failed,'fixture.apk',run,expected,previous),/Signature mismatch/);
  const wrongFinal={adb:async(...args)=>args[0] === 'install' ? 'Success':device.adb(...args)};
  await assert.rejects(()=>installTestApk(wrongFinal,'fixture.apk',run,expected,previous),/differs/);
});
test('repeat installation reuses only identical owned APK bytes and preserves app data', async () => {
  const body = Buffer.from('synthetic owned APK');
  const commands = [];
  const apkPath = '/data/app/~~fixture/com.rcstravels.driver.phase9-test/base.apk';
  const device = { serial:'SYNTHETICUSB',adb: async (...args) => {
    commands.push(args);
    if (args[2] === 'path') return ' \npackage:' + apkPath + '\n ';
    if (args[1] === 'sha256sum') { assert.deepEqual(args,['shell','sha256sum',apkPath]); return '\n' + hash(body) + '  ' + apkPath + '\n'; }
    return 'package:com.rcstravels.driver.phase9';
  } };
  const execute = async (_command,args) => {
    if (args[0] === 'dump') return { stdout:badging };
    assert.fail('APK reuse must not download application bytes or replace app data');
  };
  const result = await installTestApk(device,'fixture.apk',execute,hash(body));
  assert.equal(result.reusedVerifiedBuild,true); assert.equal(result.overwrittenPackage,false);
  assert.deepEqual(commands.slice(0,2),[['shell','pm','list','packages','--user','0','com.rcstravels.driver.phase9'],['shell','pm','path','--user','0','com.rcstravels.driver.phase9']]);
  assert.equal(commands.some(args => args.includes('install') || args.includes('clear') || args.includes('uninstall')),false);
  await assert.rejects(() => installTestApk(device,'fixture.apk',execute,'mismatch'),/differs/);
  const legacyPath = '/data/app/com.rcstravels.driver.phase9-test/base.apk';
  const legacy = { adb:async (...args) => args[2] === 'path' ? 'package:' + legacyPath
    : args[1] === 'sha256sum' ? hash(body) + '  ' + legacyPath : 'package:com.rcstravels.driver.phase9' };
  assert.equal((await installTestApk(legacy,'fixture.apk',execute,hash(body))).reusedVerifiedBuild,true);
  for (const output of ['',hash(body),hash(body) + '  /data/app/another/base.apk',hash(body) + '  ' + apkPath + '\nextra']) {
    const malformed = { adb:async (...args) => args[1] === 'sha256sum' ? output : device.adb(...args) };
    await assert.rejects(() => installTestApk(malformed,'fixture.apk',execute,hash(body)),/differs/);
  }
  await assert.rejects(() => installTestApk({ adb: async () => 'unowned path' },'fixture.apk',execute,hash(body)),/single owned/);
  for (const path of ['package:/data/app/../private/base.apk','package:/data/app/com.other.app-test/base.apk',
    'prefix package:/data/app/com.rcstravels.driver.phase9-test/base.apk','package:/data/app/com.rcstravels.driver.phase9-test/base.apk extra',
    'package:/data/app/com.rcstravels.driver.phase9-test/base.apk\npackage:/data/app/split.apk']) {
    let reads = 0;
    await assert.rejects(() => installTestApk({ adb: async () => path },'fixture.apk',async (...args) => { reads++; return execute(...args); },hash(body)),/single owned/);
    assert.equal(reads,1,'Only local aapt inspection may run for rejected device paths');
  }
});
test('native injected failure has no assignment/debit and retries through the actual upstream', async t => {
  const app = express();
  app.use(express.raw({ type: () => true }));
  app.use((req,res) => {
    for (const name of ['authorization','cookie','content-type']) assert.notEqual(req.headers[name],'undefined');
    if (req.path.endsWith('/accept') && req.body?.length) assert.equal(req.headers['content-type'],'application/json');
    if (req.path === '/api/broken') return res.status(200).type('application/json').send('invalid JSON');
    if (req.path === '/api/plain') return res.type('text/plain').send('plain fixture');
    if (req.path === '/api/empty') return res.end();
    if (req.path === '/query') return res.json({ query:req.query.value });
    if (req.path === '/fixture-auth/v1/environment') return res.json({ response:{object:'environment',commerce_settings:{}},client:{token:'synthetic signed token'} });
    if (req.path === '/redirect') return res.redirect('http://127.0.0.1:1/denied');
    res.status(req.method === 'PATCH' ? 201 : 200).json({ path: req.path, method: req.method,
      authReceived: req.headers.authorization === 'synthetic-token', cookieReceived: req.headers.cookie === 'fixture_actor=captain', body: req.body?.toString('utf8') ?? '' });
  });
  const server = await new Promise(done => { const listener = app.listen(0,'127.0.0.1',() => done(listener)); });
  t.after(async () => { server.closeAllConnections(); await new Promise(done => server.close(done)); });
  const gateway = await gatewayForTest(t,{ apiUrl: `http://127.0.0.1:${server.address().port}`,
    lifecycle: { booking: async () => ({ status: 'confirmed', driverId: null }) },
    db: { driver: { findUniqueOrThrow: async () => ({ walletBalance: 1000 }) } }, actors: { captain: { id: 'fixture' } } });
  const health = await fetch(gateway.url + '/phase9-health').then(r => r.json());
  assert.deepEqual(health,{ mode: 'isolated-phase9', production: false });
  const environment=await fetch(gateway.url + '/fixture-auth/v1/environment').then(r=>r.json());
  assert.equal(environment.client.token,'synthetic signed token');
  assert.equal(environment.response.commerce_settings.billing.user.enabled,false);
  assert.equal('response' in gateway.requests.at(-1),false);
  for (const path of ['/prefix/api/driver/offers/fixture/accept','/api/driver/offers/fixture/accept/suffix']) {
    assert.equal((await fetch(gateway.url + path,{ method:'PATCH' })).status,201);
  }
  assert.equal(gateway.faults.length,0);
  assert.equal((await fetch(gateway.url + '/api/driver/offers/fixture/accept')).status,200);
  assert.equal(gateway.faults.length,0);
  const outage = await fetch(gateway.url + '/api/driver/offers/fixture/accept',{ method: 'PATCH' });
  assert.equal(outage.status,503);
  assert.deepEqual(await outage.json(),{ error: 'Controlled acceptance outage. Please retry.' });
  assert.deepEqual(gateway.faults.map(f => [f.kind,f.bookingStatus,f.driverAssigned,f.walletBalance]),[['acceptance-503','confirmed',false,1000]]);
  assert.deepEqual(gateway.requests.at(-1),{ method:'PATCH',path:'/api/driver/offers/fixture/accept',status:503,injected:true });
  assert.ok(Number.isFinite(Date.parse(gateway.faults[0].at)));
  const response = await fetch(gateway.url + '/api/driver/offers/fixture/accept',{ method: 'PATCH',
    headers: { authorization: 'synthetic-token', cookie: 'fixture_actor=captain', 'content-type': 'application/json' }, body: '{"synthetic":true}' });
  assert.equal(response.status,201);
  const accepted = await response.json();
  assert.equal(accepted.authReceived,true); assert.equal(accepted.cookieReceived,true);
  assert.match(response.headers.get('content-type'),/^application\/json/);
  assert.deepEqual(accepted,{ path:'/api/driver/offers/fixture/accept',method:'PATCH',authReceived:true,cookieReceived:true,body:'{"synthetic":true}' });
  assert.equal(gateway.requests.at(-1).response.body,'{"synthetic":true}');
  assert.deepEqual(gateway.requests.at(-1),{ method:'PATCH',path:'/api/driver/offers/fixture/accept',status:201,response:accepted });
  await fetch(gateway.url + '/fixture-auth/test');
  assert.equal('response' in gateway.requests.at(-1),false);
  await fetch(gateway.url + '/fixture-auth/test',{ method: 'PATCH' });
  assert.equal('response' in gateway.requests.at(-1),false);
  assert.equal(JSON.stringify(gateway.requests).includes('synthetic-token'),false);
  assert.equal((await fetch(gateway.url + '/api/broken',{ method: 'PATCH' })).status,502);
  assert.deepEqual(gateway.requests.at(-1),{ method:'PATCH',path:'/api/broken',status:502,transportFailure:true });
  assert.equal((await fetch(gateway.url + '/redirect')).status,502);
  const failure = await fetch(gateway.url + '/redirect');
  assert.deepEqual(await failure.json(),{ error:'Isolated native transport failed' });
  const plain = await fetch(gateway.url + '/api/plain',{ method: 'PATCH' });
  assert.equal(plain.status,200); assert.match(plain.headers.get('content-type'),/^text\/plain/); assert.equal(await plain.text(),'plain fixture');
  assert.equal('response' in gateway.requests.at(-1),false);
  const empty = await fetch(gateway.url + '/api/empty',{ method: 'PATCH' });
  assert.equal(empty.status,200); assert.equal(await empty.text(),''); assert.equal(empty.headers.get('content-type'),'application/octet-stream');
  assert.equal((await fetch(gateway.url + '/head',{ method: 'HEAD' })).status,200);
  assert.deepEqual(await fetch(gateway.url + '/query?value=preserved').then(r => r.json()),{ query:'preserved' });
  const getBody = await new Promise((done,fail) => {
    const request = http.request(gateway.url + '/api/get-body',{ method:'GET',headers:{ 'content-type':'text/plain','content-length':7 } },response => {
      let text = ''; response.on('data',chunk => { text += chunk; }); response.on('end',() => done({ status:response.statusCode,text }));
    }); request.on('error',fail); request.setTimeout(1500,() => request.destroy(new Error('Native GET proxy timed out'))); request.end('fixture');
  });
  assert.equal(getBody.status,200); assert.equal(JSON.parse(getBody.text).body,'');
  assert.equal('response' in gateway.requests.at(-1),false);
  const headBody = await new Promise((done,fail) => {
    const request = http.request(gateway.url + '/head-body',{ method:'HEAD',headers:{ 'content-type':'text/plain','content-length':7 } },response => {
      response.resume(); response.on('end',() => done(response.statusCode));
    }); request.on('error',fail); request.setTimeout(1500,() => request.destroy(new Error('Native HEAD proxy timed out'))); request.end('fixture');
  });
  assert.equal(headBody,200);
  assert.equal(gateway.faults.length,1);
});

test('native fault records current ownership and looks up only the synthetic captain', async t => {
  const gateway = await gatewayForTest(t,{ apiUrl:'http://127.0.0.1:1',
    lifecycle:{ booking:async () => ({ status:'assigned',driverId:'synthetic-driver' }) },actors:{ captain:{ id:'synthetic-captain' } },
    db:{ driver:{ findUniqueOrThrow:async query => { assert.deepEqual(query,{ where:{ id:'synthetic-captain' } }); return { walletBalance:800 }; } } } });
  assert.equal((await fetch(gateway.url + '/api/driver/offers/fixture/accept',{ method:'PATCH' })).status,503);
  assert.equal(gateway.faults[0].driverAssigned,true);
});

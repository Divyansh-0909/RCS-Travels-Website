import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {createRequire} from 'node:module';import path from 'node:path';
import {bookingFixture,estimate,records,scenarioOf} from './fixture.mjs';
const require=createRequire(path.resolve('backend/package.json')),express=require('express');
test('read-only estimate fixture validates inputs and yields explicitly unusable sample quote/vehicle data',()=>{
  assert.equal(estimate({}).status,400);assert.equal(estimate({pickupAddress:'A',dropAddress:'B',vehicleClass:'unknown'}).status,400);
  const response=estimate({pickupAddress:'A synthetic address',dropAddress:'B synthetic address',vehicleClass:'sedan'});assert.equal(response.status,200);assert.equal(response.data.synthetic,true);assert.equal(response.data.quote,'P06_SYNTHETIC_NOT_VALID_FOR_BOOKING');assert.equal(Object.keys(response.data.fares).length,4);
});
test('only explicit preview scenarios activate the middleware',()=>{assert.equal(scenarioOf({headers:{cookie:'p06_scenario=production'}}),null);assert.equal(scenarioOf({headers:{cookie:'p06_scenario=race'}}),'race');});
test('isolated HTTP fixtures model read-only failures and deny every booking/account/payment mutation',async()=>{
  const app=express();app.use(express.json());app.use(bookingFixture);app.use((_req,res)=>res.status(404).json({fallback:true}));
  const server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const request=(url,scenario='default',init={})=>fetch(base+url,{...init,headers:{cookie:'p06_scenario='+scenario,'content-type':'application/json',...init.headers}});
  try{
    for(const [method,url]of [['POST','/api/bookings'],['POST','/api/bookings/test/payment'],['PUT','/api/users/me/preferences'],['DELETE','/api/users/me']])assert.equal((await request(url,'default',{method,body:'{}'})).status,409);
    const suggestions=await request('/api/googleAPI/autocomplete?input=Aster');assert.equal(suggestions.headers.get('x-rcs-fixture'),'P06_SYNTHETIC_READ_ONLY');const data=await suggestions.json();assert.equal(data.suggestions.length,2);assert.equal(data.suggestions[0].placePrediction.text.text,'Aster Synthetic Place 1, Fixture City');assert.equal(data.suggestions[0].placePrediction.placeId,'p06-Aster-1');
    assert.deepEqual((await(await request('/api/googleAPI/autocomplete?input=Aster','empty')).json()).suggestions,[]);
    assert.equal((await request('/api/googleAPI/autocomplete?input=Aster','lookup-error')).status,503);
    assert.equal((await request('/api/googleAPI/details/p06-Aster-1','details-error')).status,503);
    assert.equal((await request('/api/fare/estimate','estimate-error',{method:'POST',body:'{}'})).status,503);
    const quote=await request('/api/fare/estimate','default',{method:'POST',body:JSON.stringify({pickupAddress:'A',dropAddress:'B',vehicleClass:'sedan'})});assert.equal(quote.status,200);
    assert(records.some(r=>r.path==='/api/fare/estimate'&&r.classification==='READ_ONLY_SYNTHETIC_ESTIMATE'));assert(records.some(r=>r.path==='/api/bookings'&&r.classification==='DENIED_MUTATION'));
    assert.equal((await fetch(base+'/api/fare/estimate',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,404);
  }finally{await new Promise(r=>server.close(r));}
});

// Dedicated loopback preview only. No database, provider SDK or network client.
export const scenarios=new Set(['default','race','empty','lookup-error','details-error','estimate-error','estimate-slow','no-vehicles']);
export const scenarioOf=req=>{const value=req.headers.cookie?.match(/(?:^|;\s*)p06_scenario=([a-z-]+)/)?.[1];return scenarios.has(value)?value:null;};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const records=[];
export function estimate(body){
  if(!body?.pickupAddress||!body?.dropAddress||!['hatchback','sedan','suv','suv_premium'].includes(body.vehicleClass))return {status:400,data:{error:'Required synthetic route/class is missing'}};
  const fares=Object.fromEntries(['hatchback','sedan','suv','suv_premium'].map((key,index)=>[key,{solo:120+index*60,sharing:90+index*40,source:'zone',toll:0,airport:0,carrier:0}]));
  return {status:200,data:{synthetic:true,quote:'P06_SYNTHETIC_NOT_VALID_FOR_BOOKING',fares,fare:fares[body.vehicleClass].solo,fareSource:'zone',distanceKm:12,durationMin:28,polyline:null,toll:0,carrier:0,airport:0,safeRoute:{available:false}}};
}
export async function bookingFixture(req,res,next){
  const scenario=scenarioOf(req);if(!scenario)return next();
  const url=new URL(req.originalUrl,'http://127.0.0.1'),pathname=url.pathname;
  if(!pathname.startsWith('/api/'))return next();
  res.set('X-RCS-Fixture','P06_SYNTHETIC_READ_ONLY');res.set('Cache-Control','no-store');
  const record={method:req.method,path:pathname,scenario,at:new Date().toISOString(),classification:req.method==='POST'&&pathname==='/api/fare/estimate'?'READ_ONLY_SYNTHETIC_ESTIMATE':['GET','HEAD'].includes(req.method)?'READ_ONLY':'DENIED_MUTATION'};
  records.push(record);if(records.length>1000)records.shift();
  const send=(status,data)=>{record.status=status;return res.status(status).json(data);};
  if(!['GET','HEAD'].includes(req.method)&&!(req.method==='POST'&&pathname==='/api/fare/estimate'))return send(409,{error:'P06 preview denies booking, payment, account and all other mutations'});
  if(pathname==='/api/googleAPI/autocomplete'){
    const input=(url.searchParams.get('input')||'').slice(0,100);
    if(scenario==='lookup-error')return send(503,{error:'Synthetic suggestion service unavailable'});
    await sleep(scenario==='race'&&input.startsWith('Alpha')?1600:40);
    return send(200,{synthetic:true,suggestions:scenario==='empty'?[]:[1,2].map(i=>({placePrediction:{placeId:'p06-'+encodeURIComponent(input)+'-'+i,text:{text:input+' Synthetic Place '+i+', Fixture City'}}}))});
  }
  if(pathname.startsWith('/api/googleAPI/details/')){
    if(scenario==='details-error')return send(503,{error:'Synthetic place details unavailable'});
    return send(200,{synthetic:true,lat:28.61+(pathname.includes('Birch')?0.03:0),lng:77.21+(pathname.includes('Birch')?0.04:0)});
  }
  if(pathname==='/api/googleAPI/reverse-geocode')return send(200,{synthetic:true,formattedAddress:'Synthetic Current Location, Fixture City'});
  if(['/api/users/me/recent-places','/api/users/me/saved-places'].includes(pathname))return send(200,{places:[]});
  if(pathname==='/api/bookings/my-bookings')return send(200,{bookings:[],hasMore:false});
  if(pathname==='/api/bookings/nearby-drivers')return send(200,{vehicles:[],eta:null,synthetic:true});
  if(pathname==='/api/users/me/offers')return send(200,[]);
  if(pathname==='/api/fare/estimate'&&req.method==='POST'){
    if(scenario==='estimate-slow')await sleep(1200);
    if(scenario==='estimate-error')return send(503,{error:'Synthetic quote service unavailable'});
    const result=estimate(req.body);if(scenario==='no-vehicles'&&result.status===200)result.data.fares={};
    return send(result.status,result.data);
  }
  return next();
}

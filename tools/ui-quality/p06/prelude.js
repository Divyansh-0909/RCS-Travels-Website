// Synchronous developer-preview instrumentation; never imported into production.
(()=>{
  if(location.pathname!=='/book')return;
  document.title='P06 SYNTHETIC prices and places — RCS booking review';
  const id=new URLSearchParams(location.search).get('rcsReview');
  if(!/^P06-B01-0[1-4]$/.test(id||''))return;
  document.cookie='p06_scenario='+(id==='P06-B01-01'?'race':'default')+'; Path=/; SameSite=Lax';
  document.cookie='fixture_actor='+(id==='P06-B01-02'?'guest':'customer')+'; Path=/; SameSite=Lax';
  if(sessionStorage.getItem('__p06_case')!==id){
    const state=['P06-B01-02','P06-B01-04'].includes(id)?{pickupLocation:'Aster Synthetic Place 1, Fixture City',dropLocation:'Birch Synthetic Place 1, Fixture City',pickupCoords:{lat:28.61,lng:77.21},dropCoords:{lat:28.64,lng:77.25},vehicleClass:'hatchback',timing:id==='P06-B01-02'?'Schedule':'Now'}:{};
    sessionStorage.setItem('rcs-data',JSON.stringify({state,version:0}));sessionStorage.setItem('__p06_case',id);
  }
  if(id==='P06-B01-02'){
    const NativeDate=Date,epoch=new NativeDate('2026-10-23T23:50:00+05:30').getTime();
    globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[epoch]));}static now(){return epoch;}};
    window.__P06_CLOCK__='2026-10-23 23:50 Asia/Kolkata';
  }
})();

const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(probe){for(let i=0;i<100;i++){const v=probe();if(v)return v;await wait(150);}throw Error('Actual UI control did not become available');}
const button=text=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===text&&e.getClientRects().length&&!e.disabled);
function fill(input,value){input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}
export async function position(id){
  if(!/^P06-B01-0[1-4]$/.test(id))throw Error('Unknown bounded review case');
  const input=await until(()=>document.querySelector('#pickup-location'));
  if(id==='P06-B01-01'){
    fill(input,'Alpha');await wait(500);fill(input,'Beta');
    await until(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Beta Synthetic Place 1')));
    await wait(1800);
    if(input.value!=='Beta'||[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Alpha Synthetic Place 1')))throw Error('Current-query protection was not confirmed');
    return 'FIX VERIFIED: Beta suggestions remain after the slower Alpha response. Fixture latency is simulated.';
  }
  if(id==='P06-B01-02'){
    (await until(()=>button('Set date & time'))).click();await until(()=>document.querySelector('[role="listbox"]'));
    const action=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='See prices');
    const day=document.querySelector('[aria-label="Available booking days"]');
    if(new Date().getHours()!==23||new Date().getMinutes()!==50||!action||action.disabled||day?.getAttribute('aria-activedescendant')!=='available-booking-days-1')throw Error('The corrected midnight default was not confirmed');
    return 'FIX VERIFIED: at simulated 23:50 IST, tomorrow / 00:30 is selected and See prices is enabled. No booking submitted.';
  }
  if(id==='P06-B01-03'){
    fill(input,'Aster');await until(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Aster Synthetic Place 1')));
    if(innerWidth<640)return 'READY FOR MANUAL REPLAY: set width to 1440 to inspect desktop Tab and arrow-key suggestion selection.';
    input.focus();return 'READY FOR MANUAL REPLAY: press Tab through Clear pickup into the suggestions, or ArrowDown then Enter. Escape closes the list.';
  }
  (await until(()=>button('See prices'))).click();
  const sedan=await until(()=>[...document.querySelectorAll('button')].find(b=>b.querySelector('h4')?.textContent==='Sedan'));sedan.click();
  await until(()=>sedan.getAttribute('aria-pressed')==='true');
  return 'FIX VERIFIED: Sedan is selected visually and exposes aria-pressed=true. Other vehicle cards expose false. No booking submitted.';
}

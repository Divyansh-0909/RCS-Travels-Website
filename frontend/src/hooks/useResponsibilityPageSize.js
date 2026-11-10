import {useLayoutEffect,useState} from 'react';

export function useResponsibilityPageSize(frameRef,footerRef,enabled) {
  const [pageSize,setPageSize]=useState(5);
  useLayoutEffect(()=>{
    const container=frameRef.current;
    if(!enabled||!container)return;
    let tick,disposed=false,rowHeight=0,chromeHeight=0,width=window.innerWidth,typography='',observedFooter=null;
    function measure(){
      if(disposed)return;
      const footer=footerRef.current,table=container.querySelector('.case-table-frame');
      if(footer!==observedFooter){
        if(observedFooter)observer.unobserve(observedFooter);
        if(footer)observer.observe(footer);
        observedFooter=footer;
      }
      if(!footer||!table)return;
      // Selection controls may make the footer taller; keep selected rows intact.
      if(table.querySelector('tbody tr[data-state=selected]'))return;
      const rows=[...table.querySelectorAll('tbody tr')].filter(row=>row.querySelector('.case-id-link'));
      if(!rows.length)return;
      const text=getComputedStyle(rows[0]),metrics=`${text.fontSize}/${text.lineHeight}`;
      if(width!==window.innerWidth||metrics!==typography){width=window.innerWidth;typography=metrics;rowHeight=0;chromeHeight=0;}
      // Keep the largest observed row until the layout changes, avoiding resize loops.
      const heights=rows.map(row=>row.getBoundingClientRect().height);
      rowHeight=Math.max(rowHeight,...heights);
      if(!rowHeight)return;
      const bounds=table.getBoundingClientRect();
      // Include the header, borders and any native horizontal scrollbar.
      chromeHeight=Math.max(chromeHeight,bounds.height-heights.reduce((sum,height)=>sum+height,0));
      const top=bounds.top+window.scrollY;
      const available=window.innerHeight-top-chromeHeight-footer.getBoundingClientRect().height-16;
      const capacity=Math.max(1,Math.min(50,Math.floor(available/rowHeight)));
      setPageSize(previous=>previous===capacity?previous:capacity);
    }
    function schedule(){cancelAnimationFrame(tick);tick=requestAnimationFrame(measure);}
    function resized(){rowHeight=0;chromeHeight=0;schedule();}
    const observer=new ResizeObserver(schedule);
    observer.observe(container);
    window.addEventListener('resize',resized);
    document.fonts?.ready.then(()=>{if(!disposed){rowHeight=0;chromeHeight=0;schedule();}});
    schedule();
    return()=>{disposed=true;cancelAnimationFrame(tick);observer.disconnect();window.removeEventListener('resize',resized);};
  },[frameRef,footerRef,enabled]);
  return pageSize;
}

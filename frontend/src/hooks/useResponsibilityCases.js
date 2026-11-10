import {useEffect,useState} from 'react';

export function useDebouncedCaseQuery(value) {
  const [query,setQuery]=useState(value);
  useEffect(()=>{const timer=setTimeout(()=>setQuery(value.trim()),250);return()=>clearTimeout(timer);},[value]);
  return query;
}

export function useResponsibilityCases(api,filters,enabled,refresh) {
  const key=JSON.stringify(filters);
  const [result,setResult]=useState({key:'',items:[],total:0,nextCursor:null,loading:false,error:''});
  useEffect(()=>{
    if(!enabled)return;
    const controller=new AbortController();
    setResult(previous=>({...previous,key,loading:true,error:'',...(previous.key!==key?{items:[],total:0,nextCursor:null}:{})}));
    (async()=>{
      try {
        const data=await api.getResponsibilityCases(JSON.parse(key),controller.signal);
        if(controller.signal.aborted)return;
        if(data?.error)throw new Error(data.error);
        if(!Array.isArray(data?.items)||!Number.isSafeInteger(data.total)||data.total<0
          ||data.items.some(item=>!item||typeof item.id!=='string'||typeof item.booking!=='string'
            ||typeof item.opened!=='string'||!Number.isFinite(Date.parse(item.opened))))throw new Error('The case list could not be read. Please refresh.');
        setResult({key,...data,loading:false,error:''});
      }catch(error){if(!controller.signal.aborted)setResult(previous=>({...previous,key,loading:false,error:error.message||'Could not load cases.'}));}
    })();
    return()=>controller.abort();
  },[api,key,enabled,refresh]);
  return result.key===key?result:{key,items:[],total:0,nextCursor:null,loading:enabled,error:''};
}

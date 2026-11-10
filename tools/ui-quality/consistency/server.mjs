import fs from 'node:fs';import path from 'node:path';
import {atomicJson,readJson,hash} from '../../handoff/core.mjs';
import {batch,families,directory} from './catalog.mjs';
import {auditHandler} from './audit-server.mjs';
export const catalogRevision=hash(JSON.stringify(families));
const registryFile=config=>path.join(config.runtime,'consistency-decisions.json');
export const decisions=config=>readJson(registryFile(config),{schema:1,revision:0,decisions:[],history:[]});
export function validateChoice(body){
  const family=families.find(item=>item.id===body?.familyId);
  if(!family||body.catalogRevision!==catalogRevision||!Number.isInteger(body.revision)||body.revision<0)return null;
  const allowed=new Set(family.occurrences.map(item=>item.screenId));
  if(!Array.isArray(body.screenIds)||!body.screenIds.length||new Set(body.screenIds).size!==body.screenIds.length||!body.screenIds.every(id=>allowed.has(id)))return null;
  if(![...family.choices.map(choice=>choice.id),'CUSTOM'].includes(body.choice))return null;
  if(typeof body.note!=='string'||body.note.length>2000||(body.choice==='CUSTOM'&&!body.note.trim()))return null;
  return {familyId:family.id,choice:body.choice,screenIds:body.screenIds,occurrenceIds:family.occurrences.filter(item=>body.screenIds.includes(item.screenId)).map(item=>item.id),note:body.note.trim(),catalogRevision,ownerDecision:body.choice==='REVIEW'?'OWNER_REVIEW_REQUIRED':'OWNER_SELECTED',implementationStatus:'NOT_CHANGED',aestheticAcceptance:'NOT_RECORDED',at:new Date().toISOString()};
}
export function consistencyHandler(config,req,res){
  if(auditHandler(config,req,res))return true;
  const route=req.url?.split('?')[0];
  if(!['/api/consistency','/api/consistency/decision','/consistency.js','/consistency.css'].includes(route))return false;
  const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  if(route==='/api/consistency/decision'){
    if(req.method!=='POST'){json(405,{error:'Use an explicit review form submission'});return true;}
    if(![`http://127.0.0.1:${config.port}`,`http://localhost:${config.port}`].includes(req.headers.origin)||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){json(403,{error:'Same-origin JSON review submissions only'});return true;}
    let size=0,body='',finished=false;
    req.on('data',chunk=>{size+=chunk.length;if(size>8192){if(!finished){finished=true;json(413,{error:'Review instruction is too large'});}return;}body+=chunk;});
    req.on('end',()=>{
      if(finished)return;
      let parsed;try{parsed=JSON.parse(body);}catch{json(400,{error:'Invalid review submission'});return;}
      const choice=validateChoice(parsed);if(!choice){json(400,{error:'Choose a listed family, option and affected screens; custom instructions need text'});return;}
      const current=decisions(config);
      if(parsed.revision!==current.revision){json(409,{error:'Another review changed. Reload the saved choices before submitting again.'});return;}
      try{
        atomicJson(registryFile(config),{schema:1,batch,revision:current.revision+1,decisions:[...current.decisions.filter(item=>item.familyId!==choice.familyId),choice],history:[...current.history,choice]});
        json(200,{saved:choice,revision:current.revision+1,message:'Choice recorded for the listed screens. Product styling has not changed.'});
      }catch{json(500,{error:'The choice could not be saved. Nothing was implemented.'});}
    });return true;
  }
  if(req.method!=='GET'){json(405,{error:'Read only'});return true;}
  if(route==='/api/consistency'){
    const traced=families.map(family=>({...family,occurrences:family.occurrences.map(item=>{const source=fs.readFileSync(path.join(config.root,item.source),'utf8');const index=source.split(/\r?\n/).findIndex(line=>line.includes(item.token));return {...item,sourceLine:index+1,sourceHash:hash(source),themePolicy:item.route==='/book'?'LEGACY_FIXED':'BOTH',preview:'/__review/consistency?occurrence='+item.id};})}));
    json(200,{batch,catalogRevision,auditAvailable:true,families:traced,registry:decisions(config),evidence:readJson(path.join(config.root,directory,'artifacts','measurements.json'),null),evidenceLinks:readJson(path.join(config.root,directory,'publication.json'),{artifacts:[]}).artifacts.map(item=>({name:item.name,url:item.url})),policy:'Actual website with synthetic data. Choices never execute product edits. Android remains actual-device VIEW-ONLY.'});return true;
  }
  res.setHeader('Content-Type',route.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');
  res.end(fs.readFileSync(new URL(route.endsWith('.css')?'./reviewer.css':'./reviewer.js',import.meta.url)));return true;
}

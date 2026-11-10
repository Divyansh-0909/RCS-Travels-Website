import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
import {directory} from './catalog.mjs';
const require=createRequire(path.resolve('frontend/package.json'));
export const {chromium,expect}=require('@playwright/test');
export const out=path.join(directory,'artifacts');fs.mkdirSync(out,{recursive:true});
export async function contextFor(browser,{width=390,height=844,theme='light'}={}){
  const context=await browser.newContext({viewport:{width,height},colorScheme:theme,reducedMotion:'reduce',timezoneId:'Asia/Kolkata'}),external=[],network=[];
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(!['127.0.0.1','localhost',''].includes(url.hostname)){external.push({host:url.hostname,path:url.pathname});return route.abort();}return route.continue();});
  context.on('response',response=>{const request=response.request(),url=new URL(response.url());if(url.pathname.startsWith('/api/'))network.push({method:request.method(),path:url.pathname,status:response.status()});});
  return {context,external,network};
}

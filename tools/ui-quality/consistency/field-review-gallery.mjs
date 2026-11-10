import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const recent=path.resolve('output/handoff/shared-field-review-2026-10-29/images');
const historical=path.resolve('output/handoff/website-consistency-2026-10-26/images');
http.createServer((req,res)=>{
  if(!['127.0.0.1:4319','localhost:4319'].includes(req.headers.host))return res.writeHead(403).end();
  if(!['GET','HEAD'].includes(req.method))return res.writeHead(405).end();
  const pathname=new URL(req.url,'http://127.0.0.1:4319').pathname;
  if(pathname==='/health'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({review:'Shared fields',current:fs.readdirSync(recent).filter(f=>f.endsWith('.png')).length}));}
  const match=pathname.match(/^\/(?:consistency-audit\/)?images\/([a-z0-9-]+\.png)$/);
  if(!match)return res.writeHead(404).end();
  const fresh=path.join(recent,match[1]),old=path.join(historical,match[1]),file=fs.existsSync(fresh)?fresh:old;
  if(!fs.existsSync(file))return res.writeHead(404).end();
  res.setHeader('Content-Type','image/png');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res);
}).listen(4319,'127.0.0.1',()=>console.log('Current shared-field screenshots: http://127.0.0.1:4319/health (GET-only)'));

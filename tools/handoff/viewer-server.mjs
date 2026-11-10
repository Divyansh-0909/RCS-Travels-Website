import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './core.mjs';
import { nativeStatus } from './native-status.mjs';
import { parse as parseCoverage, summarize } from '../ui-quality/coverage/core.mjs';
import { consistencyHandler } from '../ui-quality/consistency/server.mjs';

export function viewerHandler(config, engine) {
  return (req, res) => {
    if (![ `127.0.0.1:${config.port}`, `localhost:${config.port}` ].includes(req.headers.host)) { res.writeHead(403).end(); return; }
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    if (consistencyHandler(config, req, res)) return;
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    const route = req.url?.split('?')[0];
    const json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
    if (route === '/api/status') {
      const s = engine.state;
      json({ previewUrl: config.previewUrl, progress: readJson(path.join(config.runtime, 'progress.json'), null),
        state: { state: s.state, action: s.action, updatedAt: s.updatedAt, heartbeat: s.heartbeat,
          connections: s.connections, nextAttempt: s.nextAttempt, run: s.run ? { phase: s.run.phase, id: s.run.id, stage: s.run.stage } : null } });
    } else if (route === '/api/review') json(readJson(path.join(config.runtime, 'review.json'), { issues: [] }));
    else if (route === '/api/coverage') {
      const file=path.join(config.root,'tools/ui-quality/coverage/master-ui-coverage.csv');
      try {
        const rows=fs.existsSync(file)?parseCoverage(fs.readFileSync(file,'utf8')):[];
        json({rows,summary:summarize(rows),source:'tools/ui-quality/coverage/master-ui-coverage.csv',devicePolicy:'Actual isolated device only; offline rows are NOT_RUN, not browser substitutes'});
      } catch { res.statusCode=503;json({rows:[],error:'Coverage tracker is invalid. Run its validation before browsing; existing issue review remains available.'}); }
    }
    else if (route === '/api/native/status') json(nativeStatus(config.runtime));
    else if (route.startsWith('/p06-compare/')) {
      const match=/^\/p06-compare\/(before|after)\/(P06-B01-0[1-4])\.png$/.exec(route),run=engine.state.run;
      if(!match||run?.phase!=='P06'){res.writeHead(404).end();return;}
      const runRoot=path.resolve(config.root,run.directory),runtimeRoot=path.resolve(config.runtime);
      if(!runRoot.startsWith(runtimeRoot+path.sep)){res.writeHead(403).end();return;}
      const names={
        'P06-B01-01':['P06-B01-01-race-390.png','P06-fix-B01-01-race-390.png'],
        'P06-B01-02':['P06-B01-02-midnight-390.png','P06-fix-B01-02-midnight-390.png'],
        'P06-B01-03':['P06-B01-03-keyboard-0.png','P06-fix-B01-03-pickup-keyboard.png'],
        'P06-B01-04':['P06-B01-04-selection-390.png','P06-fix-B01-04-selection-390.png'],
      },after=match[1]==='after',file=path.join(runRoot,...(after?['fixes-2026-10-24']:[]),'artifacts',names[match[2]][after?1:0]);
      if(!fs.existsSync(file)){res.writeHead(404).end();return;}
      res.setHeader('Content-Type','image/png');fs.createReadStream(file).pipe(res);
    }
    else if (route === '/native-screen.png') {
      if (!nativeStatus(config.runtime).live) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', 'image/png'); fs.createReadStream(path.join(config.runtime, 'native-screen.png')).pipe(res);
    } else if (route === '/viewer.js' || route === '/review-controls.js') {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.end(fs.readFileSync(new URL(route === '/viewer.js' ? './viewer-client.js' : './reviewer-controls.js', import.meta.url)));
    } else if (['/', '/status', '/native'].includes(route)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(fs.readFileSync(new URL(route === '/native' ? './native.html' : './viewer.html', import.meta.url)));
    } else res.writeHead(404).end();
  };
}

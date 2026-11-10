import test from 'node:test';
import assert from 'node:assert/strict';
import { Google } from '../google.mjs';
const success = value => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('evidence readback accepts owned phase folders and rejects foreign or unrelated parents',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});globalThis.fetch=async()=>new Response('synthetic evidence');
  const google=new Google({folderId:'root'});google.token=async()=>'synthetic-only';let parent={id:'phase',name:'P06-evidence',parents:['root']};
  google.metadata=async id=>id==='artifact'?{id,name:'result.json',parents:['phase'],webViewLink:'https://drive.google.com/test'}:parent;
  assert.equal((await google.verifyArtifact('artifact')).name,'result.json');
  parent={...parent,parents:['foreign-root']};await assert.rejects(()=>google.verifyArtifact('artifact'),/outside the handoff folder/);
  parent={...parent,parents:['root'],name:'unrelated-folder'};await assert.rejects(()=>google.verifyArtifact('artifact'),/outside the handoff folder/);
});
test('expired access token refreshes once without exposing credentials', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const google = new Google({}); let calls = 0, tokens = 0;
  google.token = async () => { tokens++; return 'synthetic-only'; };
  globalThis.fetch = async () => ++calls === 1 ? new Response('{}', { status: 401 }) : success({ id: 'fixture' });
  assert.deepEqual(await google.request('https://example.test'), { id: 'fixture' }); assert.equal(calls, 2); assert.equal(tokens, 2);
});
test('permanent auth error is bounded and does not log response secrets', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const google = new Google({}); google.token = async () => 'synthetic-only'; let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ error: { status: 'UNAUTHENTICATED', message: 'private response should not be logged' } }), { status: 401 }); };
  await assert.rejects(google.request('https://example.test'), error => error.message === 'Google HTTP 401 UNAUTHENTICATED'); assert.equal(calls, 2);
});
test('an uncertain Docs append reconciles its marker without a second insert', async () => {
  const google = new Google({});
  google.document = async () => ({ body: { content: [{ paragraph: { elements: [{ textRun: { content: 'RCS_OUTPUT_RUN: fixture' } }] } }] } });
  google.request = async () => { throw new Error('must not send duplicate insert'); };
  assert.deepEqual(await google.appendRed('report', 'RCS_OUTPUT_RUN: fixture'), { alreadyPresent: true });
});

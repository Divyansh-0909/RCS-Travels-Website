import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { legalDocs } from '../../frontend/src/constants/legal.js';
const catalogs = Object.fromEntries(await Promise.all(['en','hi','hi-Latn'].map(async locale => [locale, JSON.parse(await readFile(new URL(`./locales/${locale}/legal.json`, import.meta.url),'utf8'))])));
const leaves = (node, path = '') => Object.entries(node).flatMap(([key, value]) => typeof value === 'object' ? leaves(value, `${path}/${key}`) : [[`${path}/${key}`,value]]);
test('legal translations preserve every source paragraph and draft marker', () => {
 for (const [route, document] of Object.entries(legalDocs)) {
  const key = route.slice(1);
  assert.deepEqual(catalogs.en.documents[key],document, `English source drift: ${key}`);
  const source = leaves(document);
  for (const locale of ['hi','hi-Latn']) {
   const target = new Map(leaves(catalogs[locale].documents[key]));
   assert.deepEqual([...target.keys()],source.map(([path])=>path),`${locale}/${key} paragraph coverage`);
   for (const [path, value] of source) {
    const translated=target.get(path);
    assert.equal(typeof translated,'string');
    assert.ok(translated.trim(),`${locale}/${key}${path} empty`);
    assert.deepEqual(translated.match(/\[TO CONFIRM[^\]]*\]/g)||[], value.match(/\[TO CONFIRM[^\]]*\]/g)||[], `${locale}/${key}${path} markers`);
    assert.deepEqual(translated.match(/\d+(?:%|×\d+)?/g)||[],value.match(/\d+(?:%|×\d+)?/g)||[],`${locale}/${key}${path} policy figures`);
    const urls = text => (text.match(/https?:\/\/[^\s)]+/g)||[]).map(url=>url.replace(/[.।]+$/,''));
    assert.deepEqual(urls(translated),urls(value),`${locale}/${key}${path} policy URLs`);
   }
  }
 }
});

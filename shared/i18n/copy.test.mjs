import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const read=(locale,name)=>JSON.parse(fs.readFileSync(new URL(`./locales/${locale}/${name}.json`,import.meta.url),'utf8'));
const placeholders=value=>[...value.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(match=>match[1]).sort();
// Keep path segments intact: source-copy keys can themselves contain periods.
const leaves=(value,path=[])=>Object.entries(value).flatMap(([key,entry])=>
 typeof entry==='string' ? [[JSON.stringify([...path,key]),entry]]
 : entry && typeof entry==='object' ? leaves(entry,[...path,key]) : []);
const namespaces=fs.readdirSync(new URL('./locales/en/',import.meta.url))
 .filter(name=>name.endsWith('.json')).map(name=>name.slice(0,-5));
for(const namespace of namespaces) test(`${namespace} translations preserve keys and interpolation`,()=>{
 const source=Object.fromEntries(leaves(read('en',namespace)));
 for(const locale of ['hi','hi-Latn']){
  const target=Object.fromEntries(leaves(read(locale,namespace)));
  assert.deepEqual(Object.keys(target).sort(),Object.keys(source).sort(),`${locale} keys`);
  for(const [key,value] of Object.entries(source)){
   assert.ok(typeof target[key]==='string'&&target[key].trim(),`${locale}: ${key}`);
   assert.deepEqual(placeholders(target[key]),placeholders(value),`${locale}: ${key}`);
  }
 }
});

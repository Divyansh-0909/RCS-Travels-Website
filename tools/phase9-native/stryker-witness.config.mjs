import { readFile } from 'node:fs/promises';
import base from './stryker.config.mjs';
const original=JSON.parse(await readFile('output/phase9-native-device-2026-10-10/mutation-full-nine-before-witnesses.json','utf8'));
const spans=[];
for(const [file,entry] of Object.entries(original.files)) {
  const lines=new Set();
  for(const mutant of entry.mutants.filter(m=>m.status === 'Survived')) {
    for(let line=mutant.location.start.line;line<=mutant.location.end.line;line++)lines.add(line);
  }
  const sorted=[...lines].sort((a,b)=>a-b);
  for(let index=0;index<sorted.length;index++) {
    const start=sorted[index];let end=start;
    while(sorted[index+1] === end+1)end=sorted[++index];
    spans.push(`${file}:${start}-${end}`);
  }
}
export default { ...base,mutate:spans,
  jsonReporter:{fileName:'output/phase9-native-device-2026-10-10/mutation-witnesses.json'},
};

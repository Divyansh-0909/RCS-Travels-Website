import path from 'node:path';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(path.resolve('frontend/package.json'));
const {ESLint}=require('eslint'),js=require('@eslint/js'),react=require('eslint-plugin-react'),hooks=require('eslint-plugin-react-hooks'),globals=require('globals'),ts=require('typescript-eslint');
const base='frontend/src/components/responsibility/story';
const files=['frontend/src/pages/ResponsibilityCase.jsx','frontend/src/hooks/useResponsibilityCases.js','frontend/src/lib/responsibilityStory.js',
  ...(await fs.readdir(base)).filter(file=>file.endsWith('.jsx')).map(file=>`${base}/${file}`),
  ...(await fs.readdir(`${base}/ui`)).filter(file=>/\.(jsx|tsx)$/.test(file)).map(file=>`${base}/ui/${file}`)];
const lint=new ESLint({overrideConfigFile:true,overrideConfig:[{
  files:['**/*.{js,jsx,tsx}'],languageOptions:{globals:globals.browser,parserOptions:{ecmaFeatures:{jsx:true}}},plugins:{react,'react-hooks':hooks},
  rules:{...js.configs.recommended.rules,...hooks.configs.recommended.rules,'react/jsx-uses-vars':'error',complexity:['error',21]},
},{files:['**/*.tsx'],languageOptions:{parser:ts.parser},plugins:{'@typescript-eslint':ts.plugin},
  rules:{'no-undef':'off','no-unused-vars':'off','@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_'}]},
}]});
const results=await lint.lintFiles(files),errors=results.reduce((sum,file)=>sum+file.errorCount,0),warnings=results.reduce((sum,file)=>sum+file.warningCount,0);
await fs.writeFile('output/handoff/responsibility-production-integration-2026-11-05/lint-final.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({files:results.length,errors,warnings}));
process.exitCode=errors||warnings?1:0;

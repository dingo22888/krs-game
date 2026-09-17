import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

test('Vercel server output imports emitted JavaScript, not unavailable TypeScript sources',()=>{
  const config=ts.readConfigFile('tsconfig.json',ts.sys.readFile);
  const {options}=ts.parseJsonConfigFileContent(config.config,ts.sys,'.');
  for(const path of ['api/auth.ts','api/house-model.ts','api/highscores.ts','src/server/score-rules.ts']){
    const emitted=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:options}).outputText;
    assert.doesNotMatch(emitted,/from ['"][^'"]+\.ts['"]/);
    assert.match(emitted,/from ['"][^'"]+\.js['"]/);
  }
});

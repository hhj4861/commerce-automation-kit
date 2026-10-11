import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { makeDraft, saveDraft, parseBundle, RunnerError } from './draft.mjs';
import { checkDependency } from '../tools/check-dependency.mjs';
try {
  const {values,positionals}=parseArgs({options:{input:{type:'string'},db:{type:'string'}},allowPositionals:true});
  if (positionals.length!==1 || positionals[0]!=='preview' || !values.input) throw new RunnerError('usage',2,'preview --input bundle.json [--db /local/existing-directory/new.db]');
  checkDependency();
  const body=makeDraft(parseBundle(readFileSync(values.input,'utf8')));
  const result=values.db ? saveDraft(values.db,body) : {ok:true,preview:body,authorized:false};
  console.log(JSON.stringify(result)); process.exitCode=result.ok ? 0 : result.exitCode;
} catch(e) {
  console.log(JSON.stringify({ok:false,code:e instanceof RunnerError ? e.code : 'invalid-input',detail:e.message}));
  process.exitCode=e instanceof RunnerError ? e.exitCode : 2;
}

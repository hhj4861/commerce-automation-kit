import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {captureLegacy} from './legacy.mjs';
test('real episode 1: input hashes, validate/plan/low-budget stdout, generated reports and exits match pre-change capture',()=>{
  assert.ok(process.env.DRAMA_TEST_ARTIFACTS,'Set DRAMA_TEST_ARTIFACTS to the approved artifact directory');
  const got=captureLegacy(mkdtempSync(join(process.env.DRAMA_TEST_ARTIFACTS,'compat-')));
  const expected=JSON.parse(readFileSync(new URL('./fixtures/legacy-golden.json',import.meta.url),'utf8'));
  assert.deepEqual(got,expected);
  assert.equal(got.validate.exitCode,0);
  assert.equal(got.plan.exitCode,1); // preserve stale props/scenario, never manufacture a pass
  assert.equal(got.lowBudget.exitCode,1);
});

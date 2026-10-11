import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {captureLegacy} from './legacy.mjs';
test('real episode 1: input hashes, validate/plan/low-budget stdout, generated reports and exits match pre-change capture',()=>{
  assert.ok(process.env.DRAMA_TEST_ARTIFACTS,'Set DRAMA_TEST_ARTIFACTS to the approved artifact directory');
  const got=captureLegacy(mkdtempSync(join(process.env.DRAMA_TEST_ARTIFACTS,'compat-')));
  const expected=JSON.parse(readFileSync(new URL('./fixtures/legacy-golden.json',import.meta.url),'utf8'));
  // shot-v1 spec §5 adds one informational report to legacy validate only.
  // Keep the historical capture immutable and compare every pre-existing field.
  const shot=got.reports['shot.json'];
  assert.ok(shot && shot.findings.length > 0);
  assert.equal(shot.gate,'shot'); assert.equal(shot.stage,'episode'); assert.equal(shot.ok,true);
  assert.equal(shot.fingerprint,got.reports['schema.json'].fingerprint);
  assert.ok(shot.findings.every(f=>f.severity==='info'));
  assert.equal(got.validate.stdout.reports.filter(r=>r.gate==='shot').length,1);
  assert.deepEqual(got.validate.stdout.reports.at(-1),shot);
  got.validate.stdout.reports.pop();
  delete got.reports['shot.json'];
  assert.deepEqual(got,expected);
  assert.equal(got.validate.exitCode,0);
  assert.equal(got.plan.exitCode,1); // preserve stale props/scenario, never manufacture a pass
  assert.equal(got.lowBudget.exitCode,1);
});

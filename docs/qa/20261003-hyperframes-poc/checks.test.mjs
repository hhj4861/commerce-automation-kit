// Regression evidence that the PoC checker fails on mismatches (not only logs them).
// Run: node --test docs/qa/20261003-hyperframes-poc/checks.test.mjs
// With POC_OUT pointing at a verify-poc.mjs output dir, also checks real differing renders.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {checkCaptionBandClear, checkCaptionPresent, checkReproducibility, checkVideo, compareHashes} from './checks.mjs';

const ok = {width: 1080, height: 1920, r_frame_rate: '30/1', nb_read_frames: '150'};

test('a matching probe passes', () => assert.deepEqual(checkVideo('t', ok, 150), []));
test('wrong size, fps or frame count fails', () => {
  assert.equal(checkVideo('t', {...ok, width: 720}, 150).length, 1);
  assert.equal(checkVideo('t', {...ok, r_frame_rate: '25/1'}, 150).length, 1);
  assert.equal(checkVideo('t', {...ok, nb_read_frames: '149'}, 150).length, 1);
  assert.equal(checkVideo('t', undefined, 150).length, 1);
});
test('identical hashes pass, one differing frame fails', () => {
  const a = Array.from({length: 150}, (_, i) => `h${i}`);
  assert.deepEqual(checkReproducibility('t', compareHashes(a, [...a]), 150), []);
  const b = [...a]; b[77] = 'changed';
  const bad = checkReproducibility('t', compareHashes(a, b), 150);
  assert.equal(bad.length, 1); assert.match(bad[0], /149\/150/); assert.match(bad[0], /77/);
});
test('missing frames in the rerun fail even if the rest match', () => {
  const a = Array.from({length: 150}, (_, i) => `h${i}`);
  assert.ok(checkReproducibility('t', compareHashes(a, a.slice(0, 140)), 150).length >= 1);
});
test('caption band must stay paper-clear on every frame', () => {
  assert.deepEqual(checkCaptionBandClear('t', Array(150).fill(238), 150), []);
  const g = Array(150).fill(238); g[90] = 60;
  assert.match(checkCaptionBandClear('t', g, 150)[0], /first 90/);
  assert.equal(checkCaptionBandClear('t', Array(10).fill(238), 150).length, 1);
});
test('caption box must exist inside the band on every frame', () => {
  assert.deepEqual(checkCaptionPresent('t', Array(150).fill([1705, 1773]), 150), []);
  const r = Array(150).fill([1705, 1773]); r[3] = null;
  assert.equal(checkCaptionPresent('t', r, 150).length, 1);
  assert.equal(checkCaptionPresent('t', Array(150).fill([1400, 1460]), 150).length, 1);
});

const out = process.env.POC_OUT;
test('real renders: differing outputs are detected', {skip: !out || !existsSync(join(out ?? '', 'chapter.mp4'))}, () => {
  const hashes = f => spawnSync('ffmpeg', ['-v', 'error', '-i', join(out, f), '-map', '0:v:0', '-f', 'framemd5', '-'], {encoding: 'utf8'})
    .stdout.split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split(',').pop().trim());
  // chapter-safe.mp4 is the same template with the safe-zone overlay: every frame must differ.
  const bad = checkReproducibility('chapter vs chapter-safe', compareHashes(hashes('chapter.mp4'), hashes('chapter-safe.mp4')), 105);
  assert.equal(bad.length, 1);
  assert.match(bad[0], /only 0\/105/);
});

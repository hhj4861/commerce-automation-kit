#!/usr/bin/env node
// HyperFrames P0 PoC verification. Renders the three templates twice, compares decoded
// frames (framemd5) for reproducibility, renders a safe-zone overlay, burns a caption with the
// studio's own captionFilter, and renders a comparable scene with the existing SVG→resvg
// renderer as the baseline. Writes results.json and PNG sheets into POC_OUT.
//
// Usage (Node 22+, ffmpeg, hyperframes CLI resolvable from HF_TOOL):
//   POC_OUT=<dir> HF_TOOL=<dir with node_modules/.bin/hyperframes> node verify-poc.mjs
// Repo node_modules must resolve @resvg/resvg-js for the baseline render.
import {spawn} from 'node:child_process';
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CAPTION_BAND, checkCaptionBandClear, checkCaptionPresent, checkReproducibility, checkVideo, compareHashes} from './checks.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../../..');
const project = join(here, 'project');
const out = process.env.POC_OUT;
const tool = process.env.HF_TOOL;
if (!out || !tool) throw new Error('POC_OUT and HF_TOOL are required');
const hf = join(tool, 'node_modules/.bin/hyperframes');
const TEMPLATES = [
  {id: 'chapter', duration: 3.5},
  {id: 'countup', duration: 5},
  {id: 'summary', duration: 5},
];
const CAPTION_TEXT = '같은 깊이라도 지반에 따라 공법이 달라요';

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {stdio: ['ignore', 'pipe', 'pipe'], ...opts});
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr = (stderr + d).slice(-4000); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve({stdout, stderr}) : reject(new Error(`${cmd} ${args.join(' ')} → ${code}\n${stderr}`)));
  });
}
const now = () => performance.now() / 1000;

async function render(template, output, variables) {
  const args = ['render', project, '-c', `${template}.html`, '-o', output, '--quiet', '--strict'];
  if (variables) args.push('--variables', JSON.stringify(variables));
  const t0 = now();
  await run(hf, args, {env: {...process.env, HYPERFRAMES_NO_TELEMETRY: '1'}, cwd: tool});
  return +(now() - t0).toFixed(2);
}

async function probe(file) {
  const {stdout} = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames,pix_fmt', '-of', 'json', file]);
  return JSON.parse(stdout).streams[0];
}

async function frameHashes(file) {
  const {stdout} = await run('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v:0', '-f', 'framemd5', '-']);
  return stdout.split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split(',').pop().trim());
}

// Per-frame gray scan of a horizontal strip; returns raw bytes per frame.
async function grayStrip(file, top, height) {
  const {stdout} = await new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-v', 'error', '-i', file, '-vf', `crop=1080:${height}:0:${top},format=gray`, '-f', 'rawvideo', '-'], {stdio: ['ignore', 'pipe', 'pipe']});
    const chunks = []; let stderr = '';
    child.stdout.on('data', d => chunks.push(d)); child.stderr.on('data', d => { stderr += d; });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve({stdout: Buffer.concat(chunks)}) : reject(new Error(stderr)));
  });
  const size = 1080 * height, frames = [];
  for (let o = 0; o + size <= stdout.length; o += size) frames.push(stdout.subarray(o, o + size));
  return frames;
}
const bandMinGray = async file => (await grayStrip(file, CAPTION_BAND.top, CAPTION_BAND.bottom - CAPTION_BAND.top))
  .map(f => f.reduce((m, v) => v < m ? v : m, 255));
// Rows (absolute y) where the dark caption box sits: >20 sampled pixels darker than 90.
async function captionRows(file) {
  const top = 1500, height = 400;
  return (await grayStrip(file, top, height)).map(f => {
    const rows = [];
    for (let y = 0; y < height; y++) { let n = 0; for (let x = 0; x < 1080; x += 4) if (f[y * 1080 + x] < 90) n++; if (n > 20) rows.push(top + y); }
    return rows.length ? [rows[0], rows[rows.length - 1]] : null;
  });
}

async function sheet(file, frames, output, width = 360) {
  const select = frames.map(f => `eq(n\\,${f})`).join('+');
  await run('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `select='${select}',scale=${width}:-1,tile=${frames.length}x1`, '-frames:v', '1', output]);
}

async function burnCaption(input, output, frames) {
  const {captionFilter} = await import(join(repo, 'apps/shopshorts/studio-runner.mjs'));
  const textPath = join(out, 'caption.txt');
  await writeFile(textPath, CAPTION_TEXT);
  // Production default for script captions (public/editor-model.js:74): gothic 56px white, boxed, bottom.
  const caption = {font: 'gothic', size: 56, color: '#ffffff', position: 'bottom', background: true, backgroundOpacity: .75, outlineWidth: 0, text: CAPTION_TEXT, startFrame: 0, endFrame: frames};
  await run('ffmpeg', ['-v', 'error', '-y', '-i', input, '-vf', captionFilter(caption, textPath), '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', output]);
}

async function baseline() {
  const {renderAnimationScene} = await import(join(repo, 'apps/shopshorts/studio-animation.mjs'));
  const job = {brief: {aspect: '9:16'}};
  // Same message as the count-up template, expressed with the existing bounded animation plan.
  const scene = {id: 'baseline', duration: 5, animation: {title: '얼마나 깊을까', layout: 'contrast', elements: [
    {icon: 'building', label: '건물 기초', motion: 'enter'},
    {icon: 'truck', label: '지하철 터널', motion: 'enter'},
  ]}};
  const work = join(out, 'baseline-work');
  await mkdir(work, {recursive: true});
  const results = [];
  for (const name of ['baseline.mp4', 'baseline-rerun.mp4']) {
    const t0 = now();
    const {data} = await renderAnimationScene(job, scene, work);
    results.push(+(now() - t0).toFixed(2));
    await writeFile(join(out, name), data);
  }
  return results;
}

await mkdir(out, {recursive: true});
await mkdir(join(project, 'assets'), {recursive: true});
await copyFile(join(repo, 'apps/shopshorts/public/NanumGothic-Regular.ttf'), join(project, 'assets/NanumGothic-Regular.ttf'));
await copyFile(join(tool, 'node_modules/gsap/dist/gsap.min.js'), join(project, 'assets/gsap.min.js'));
const hfVersion = JSON.parse(await readFile(join(tool, 'node_modules/hyperframes/package.json'), 'utf8')).version;
const gsapVersion = JSON.parse(await readFile(join(tool, 'node_modules/gsap/package.json'), 'utf8')).version;

const report = {when: new Date().toISOString(), hyperframes: hfVersion, gsap: gsapVersion, node: process.version, templates: [], baseline: null, failures: []};
for (const {id, duration} of TEMPLATES) {
  const entry = {id, duration};
  try {
    const main = join(out, `${id}.mp4`), rerun = join(out, `${id}-rerun.mp4`);
    entry.renderSeconds = [await render(id, main), await render(id, rerun)];
    entry.probe = await probe(main);
    entry.expectedFrames = Math.round(duration * 30);
    entry.reproducibility = compareHashes(await frameHashes(main), await frameHashes(rerun));
    const n = entry.expectedFrames;
    entry.captionBandMinGray = Math.min(...await bandMinGray(main));
    await sheet(main, [Math.round(n * .2), Math.round(n * .5), n - 6], join(out, `${id}-sheet.png`));
    await render(id, join(out, `${id}-safe.mp4`), {showSafe: true});
    await sheet(join(out, `${id}-safe.mp4`), [n - 6], join(out, `${id}-safe.png`), 540);
    const captioned = join(out, `${id}-caption.mp4`);
    await burnCaption(main, captioned, n);
    await sheet(captioned, [n - 6], join(out, `${id}-caption.png`), 540);
    entry.captionProbe = await probe(captioned);
    const rows = await captionRows(captioned);
    entry.captionRows = rows[Math.floor(n / 2)];
    entry.checks = [
      ...checkVideo(`${id}`, entry.probe, n),
      ...checkReproducibility(`${id}`, entry.reproducibility, n),
      ...checkCaptionBandClear(`${id}`, await bandMinGray(main), n),
      ...checkVideo(`${id}-caption`, entry.captionProbe, n),
      ...checkCaptionPresent(`${id}-caption`, rows, n),
    ];
    if (entry.checks.length) report.failures.push(...entry.checks);
  } catch (e) {
    entry.error = String(e.message).slice(0, 1500);
    report.failures.push(id);
  }
  report.templates.push(entry);
}
try {
  const seconds = await baseline();
  const main = join(out, 'baseline.mp4');
  report.baseline = {renderer: 'apps/shopshorts/studio-animation.mjs renderAnimationScene (SVG→resvg→ffmpeg)', renderSeconds: seconds, probe: await probe(main),
    reproducibility: compareHashes(await frameHashes(main), await frameHashes(join(out, 'baseline-rerun.mp4')))};
  report.baseline.checks = [...checkVideo('baseline', report.baseline.probe, 150), ...checkReproducibility('baseline', report.baseline.reproducibility, 150)];
  report.failures.push(...report.baseline.checks);
  await sheet(main, [30, 75, 144], join(out, 'baseline-sheet.png'));
  await burnCaption(main, join(out, 'baseline-caption.mp4'), 150);
  await sheet(join(out, 'baseline-caption.mp4'), [144], join(out, 'baseline-caption.png'), 540);
} catch (e) {
  report.baseline = {error: String(e.message).slice(0, 1500)};
  report.failures.push('baseline');
}
await writeFile(join(out, 'results.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.failures.length) process.exitCode = 1;

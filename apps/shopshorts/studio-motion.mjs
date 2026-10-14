// Local-worker-only renderer for whitelisted body motion templates (HyperFrames → MP4).
// Pages/Functions never import this file: it spawns Chrome through the HyperFrames CLI.
// Inputs are a template ID and validated variables (public/motion-templates.js); the template
// file comes from a fixed map, so no user-provided path, HTML or script reaches the renderer.
import {spawn} from 'node:child_process';
import {copyFile, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {motionSpec, motionTemplate} from './public/motion-templates.js';

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(here, 'motion-templates');
const FONT = join(here, 'public/NanumGothic-Regular.ttf');
const FPS = 30;
const DEFAULT_TIMEOUT_MS = 180000;

export class MotionRenderError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// Resolve the CLI and GSAP from this app's dependencies; env overrides exist for operators.
function resolveTools(env) {
  const require = createRequire(import.meta.url);
  const find = id => { try { return require.resolve(id); } catch { return null; } };
  const cliPkg = env.SHOPSHORTS_MOTION_CLI || find('hyperframes/package.json');
  const cli = cliPkg && (cliPkg.endsWith('package.json') ? join(dirname(cliPkg), 'bin/hyperframes.mjs') : cliPkg);
  const gsapPkg = find('gsap/package.json');
  const gsap = env.SHOPSHORTS_MOTION_GSAP || (gsapPkg && join(dirname(gsapPkg), 'dist/gsap.min.js'));
  if (!cli || !existsSync(cli)) throw new MotionRenderError('MOTION_DEPENDENCY_MISSING', '모션 템플릿 렌더러(hyperframes)가 제작 워커에 설치되지 않았습니다. apps/shopshorts에서 npm ci를 실행하세요.');
  if (!gsap || !existsSync(gsap)) throw new MotionRenderError('MOTION_DEPENDENCY_MISSING', '모션 템플릿 애니메이션 라이브러리(gsap)가 제작 워커에 설치되지 않았습니다. apps/shopshorts에서 npm ci를 실행하세요.');
  return {cli, gsap};
}

function run(cmd, args, {env, cwd, timeoutMs, spawnImpl = spawn}) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawnImpl(cmd, args, {env, cwd, stdio: ['ignore', 'pipe', 'pipe']}); } catch (e) { reject(e); return; }
    let stdout = '', stderr = '', timedOut = false;
    child.stdout?.on('data', d => { stdout = (stdout + d).slice(-4000); });
    child.stderr?.on('data', d => { stderr = (stderr + d).slice(-4000); });
    const timer = timeoutMs ? setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs) : null;
    child.once('error', e => { clearTimeout(timer); reject(e); });
    child.once('close', code => {
      clearTimeout(timer);
      if (timedOut) reject(new MotionRenderError('MOTION_TIMEOUT', `모션 템플릿 렌더가 ${Math.round(timeoutMs / 1000)}초 안에 끝나지 않아 중단했습니다.`));
      else if (code === 0) resolve({stdout, stderr});
      else reject(Object.assign(new MotionRenderError('MOTION_RENDER_FAILED', `모션 템플릿 렌더 실패: ${(stderr || stdout).trim().split('\n').slice(-3).join(' ').slice(0, 400)}`), {exitCode: code}));
    });
  });
}

// The node binary that runs the CLI. Production workers may still run Node 20, so the
// renderer accepts a separate Node 22+ binary via SHOPSHORTS_MOTION_NODE.
async function motionNode(env, spawnImpl) {
  const node = env.SHOPSHORTS_MOTION_NODE || process.execPath;
  let version;
  try { version = (await run(node, ['-p', 'process.versions.node'], {env, timeoutMs: 15000, spawnImpl})).stdout.trim(); }
  catch { throw new MotionRenderError('MOTION_NODE_MISSING', `모션 템플릿 렌더용 Node를 실행하지 못했습니다(${node}). SHOPSHORTS_MOTION_NODE를 확인하세요.`); }
  if (Number(version.split('.')[0]) < 22) throw new MotionRenderError('MOTION_NODE_TOO_OLD', `모션 템플릿 렌더에는 Node 22 이상이 필요합니다(현재 ${version}). SHOPSHORTS_MOTION_NODE에 Node 22 이상 경로를 설정하세요.`);
  return node;
}

// Cheap synchronous readiness hint for the worker heartbeat. It does not execute the
// configured node binary; renderMotionScene still verifies the version and fails clearly.
export function motionCapability(env = {}) {
  try { resolveTools(env); } catch { return false; }
  if (env.SHOPSHORTS_MOTION_NODE) return existsSync(env.SHOPSHORTS_MOTION_NODE);
  return Number(process.versions.node.split('.')[0]) >= 22;
}

export async function renderMotionScene(job, scene, work, env = {}, {spawnImpl = spawn} = {}) {
  if (scene.kind !== 'video') throw new MotionRenderError('MOTION_INVALID', '모션 템플릿 장면은 영상으로 만들어야 해요.');
  const spec = motionSpec(scene.motion);
  const template = motionTemplate(spec.template);
  if (!Number.isFinite(scene.duration) || scene.duration < 1 || scene.duration > 30) throw new MotionRenderError('MOTION_INVALID', '장면 길이를 확인해 주세요.');
  const {cli, gsap} = resolveTools(env);
  const node = await motionNode({...process.env, ...env}, spawnImpl);
  const timeoutMs = Number(env.SHOPSHORTS_MOTION_TIMEOUT_MS) > 0 ? Number(env.SHOPSHORTS_MOTION_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;

  // Per-scene project copy: fixed template files plus local font and GSAP, nothing else.
  const project = join(work, `${scene.id}-motion`);
  await rm(project, {recursive: true, force: true});
  await mkdir(join(project, 'assets'), {recursive: true});
  let templateHtml=await readFile(join(TEMPLATE_DIR, `${template.id}.html`),'utf8');
  if(job.brief?.aspect==='16:9'&&template.id==='summary') {
    templateHtml=templateHtml.replace('data-resolution="portrait"','data-resolution="landscape"').replaceAll('width=1080, height=1920','width=1920, height=1080').replaceAll('data-width="1080" data-height="1920"','data-width="1920" data-height="1080"').replace('viewBox="0 0 1080 1920"','viewBox="0 0 1920 1080"');
    templateHtml=templateHtml.replace('translate(270 560)','translate(390 420)').replace('translate(270 870)','translate(960 420)').replace('translate(270 1180)','translate(1530 420)').replace('x1="270" y1="660" x2="270" y2="780"','x1="510" y1="420" x2="830" y2="420"').replace('x1="270" y1="970" x2="270" y2="1090"','x1="1090" y1="420" x2="1410" y2="420"');
    templateHtml=templateHtml.replace('</head>',`<style>html,body,svg.full{width:1920px;height:1080px}#heading{left:0;width:1920px;top:130px;font-size:70px}.item{top:590px!important;width:500px;text-align:center;font-size:56px}#it1{left:140px}#it2{left:710px}#it3{left:1280px}</style></head>`);
  }
  await writeFile(join(project, `${template.id}.html`),templateHtml);
  await copyFile(join(TEMPLATE_DIR, 'shared.css'), join(project, 'shared.css'));
  await copyFile(FONT, join(project, 'assets/NanumGothic-Regular.ttf'));
  await copyFile(gsap, join(project, 'assets/gsap.min.js'));
  const varsFile = join(project, 'variables.json');
  await writeFile(varsFile, JSON.stringify(spec.vars));
  const rendered = join(work, `${scene.id}-motion-raw.mp4`), target = join(work, `${scene.id}-motion.mp4`);
  const childEnv = {...process.env, ...env, HYPERFRAMES_NO_TELEMETRY: '1', HYPERFRAMES_SKIP_SKILLS: '1'};
  try {
    await run(node, [cli, 'render', project, '-c', `${template.id}.html`, '-o', rendered, '--fps', String(FPS), '--quiet', '--strict', '--strict-variables', '--variables-file', varsFile], {env: childEnv, cwd: project, timeoutMs, spawnImpl});
    if (!existsSync(rendered)) throw new MotionRenderError('MOTION_RENDER_FAILED', '모션 템플릿 렌더 결과 파일이 없습니다.');
    // Longer scenes hold the last frame (no looping of a transition); shorter scenes are trimmed in the editor.
    const pad = Math.max(0, scene.duration - template.duration);
    await run('ffmpeg', ['-y', '-v', 'error', '-i', rendered, '-vf', pad > 0 ? `tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)}` : 'null', '-an', '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', target], {env: childEnv, timeoutMs, spawnImpl});
    return {data: await readFile(target), type: 'video/mp4', provider: 'motion-hyperframes', template: template.id};
  } finally {
    await rm(project, {recursive: true, force: true});
    await rm(rendered, {force: true});
    await rm(target, {force: true});
  }
}

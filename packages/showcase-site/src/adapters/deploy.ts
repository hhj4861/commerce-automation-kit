/**
 * 빌드·배포 어댑터 — dist 조립과 Cloudflare Pages(wrangler) 배포.
 *
 * 규약:
 *  - buildDist: dist 를 비우고 html→index.html, works.js, media/ 를 복사한다.
 *    vercel.json 이 사이트에 없으면 기본값을 생성한다(cleanUrls 등 정적 호스팅 관용 설정).
 *  - 토큰: CLOUDFLARE_API_TOKEN(env) → <siteDir>/.cf-token 파일 → null.
 *    **토큰 값은 로그·반환 어디에도 노출 금지** — 존재 여부만 다룬다.
 *  - deploy 실패는 throw 하지 않고 ShowcaseDeployReport(ok:false)로 투명하게 보고한다.
 *  - 배포는 명시적 명령으로만 — 자동 트리거 금지(계약 주석 참조).
 */
import { spawn } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ShowcaseDeployReport, ShowcaseSiteConfig } from '@cak/contracts';
import type { Site } from './site.js';
import { createLogger } from '../obs/logger.js';

const log = createLogger();

const DEFAULT_VERCEL_JSON = '{ "cleanUrls": true, "trailingSlash": false }';
const DEPLOY_TIMEOUT_MS = 300_000;

export interface BuildDistResult {
  files: number;
  bytes: number;
}

/** dist 하위 파일 수·바이트 합산 (재귀) */
function distStats(dir: string): BuildDistResult {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      const sub = distStats(p);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += st.size;
    }
  }
  return { files, bytes };
}

/**
 * dist 조립: 비우고 → html 을 index.html 로, works.js, media/ 재귀 복사.
 * vercel.json 은 사이트에 있으면 복사, 없으면 기본값 생성.
 */
export function buildDist(site: Site): BuildDistResult {
  const { config } = site;
  const distDir = resolve(site.dir, config.paths.dist);

  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });

  const htmlSrc = resolve(site.dir, config.paths.html);
  if (!existsSync(htmlSrc)) throw new Error(`빌드 실패: HTML 없음 — ${htmlSrc}`);
  copyFileSync(htmlSrc, join(distDir, 'index.html'));

  const worksJsSrc = resolve(site.dir, config.paths.worksJs);
  if (!existsSync(worksJsSrc)) throw new Error(`빌드 실패: works.js 없음 — 먼저 gen 을 실행하세요 (${worksJsSrc})`);
  copyFileSync(worksJsSrc, join(distDir, 'works.js'));

  const mediaSrc = resolve(site.dir, config.paths.media);
  if (existsSync(mediaSrc)) {
    cpSync(mediaSrc, join(distDir, config.paths.media), { recursive: true });
  } else {
    log.warn('build.media_missing', { mediaSrc });
  }

  const vercelSrc = join(site.dir, 'vercel.json');
  if (existsSync(vercelSrc)) copyFileSync(vercelSrc, join(distDir, 'vercel.json'));
  else writeFileSync(join(distDir, 'vercel.json'), DEFAULT_VERCEL_JSON, 'utf8');

  const stats = distStats(distDir);
  log.info('build.done', { distDir, ...stats });
  return stats;
}

/**
 * 배포 토큰: env CLOUDFLARE_API_TOKEN → <siteDir>/.cf-token(trim) → null.
 * 반환값(토큰)은 spawn env 주입에만 쓰고 절대 로그·보고에 싣지 않는다.
 */
export function resolveToken(site: Site): string | null {
  const fromEnv = process.env.CLOUDFLARE_API_TOKEN;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();
  const tokenFile = join(site.dir, '.cf-token');
  if (existsSync(tokenFile)) {
    const fromFile = readFileSync(tokenFile, 'utf8').trim();
    if (fromFile.length > 0) return fromFile;
  }
  return null;
}

/** npx 에 넘길 wrangler pages deploy 인자 (npx --yes 로 미설치 환경에서도 실행) */
export function buildWranglerArgs(config: ShowcaseSiteConfig, distDir: string): string[] {
  return [
    '--yes',
    'wrangler',
    'pages',
    'deploy',
    distDir,
    '--project-name',
    config.deploy.projectName,
    '--branch',
    config.deploy.branch,
    '--commit-dirty=true',
  ];
}

/** wrangler 출력에서 배포 URL(https://*.pages.dev)을 찾는다 */
function extractDeployUrl(output: string): string | undefined {
  const m = output.match(/https:\/\/[a-z0-9][a-z0-9.-]*\.pages\.dev[^\s'"]*/i);
  return m ? m[0] : undefined;
}

/**
 * Cloudflare Pages 배포. 토큰이 없으면 throw 대신 ok:false 보고(투명화).
 * 성공/실패 모두 ShowcaseDeployReport 로 반환한다.
 */
export function deploy(site: Site): Promise<ShowcaseDeployReport> {
  const { config } = site;
  const base = { provider: config.deploy.provider, projectName: config.deploy.projectName };

  const token = resolveToken(site);
  if (token === null) {
    return Promise.resolve({
      ...base,
      ok: false,
      log: '토큰 없음 — CLOUDFLARE_API_TOKEN 또는 <site>/.cf-token 필요',
    });
  }

  const distDir = resolve(site.dir, config.paths.dist);
  const args = buildWranglerArgs(config, distDir);
  log.info('deploy.start', { projectName: config.deploy.projectName, branch: config.deploy.branch, distDir });

  return new Promise((resolvePromise) => {
    const child = spawn('npx', args, {
      cwd: site.dir,
      // 토큰은 자식 프로세스 환경변수로만 전달 — 로그·보고 노출 금지
      env: { ...process.env, CLOUDFLARE_API_TOKEN: token },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, DEPLOY_TIMEOUT_MS);
    child.stdout.on('data', (d: Buffer) => {
      output += d.toString('utf8');
    });
    child.stderr.on('data', (d: Buffer) => {
      output += d.toString('utf8');
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolvePromise({ ...base, ok: false, log: `npx 실행 실패: ${e.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const tail = output.trim().slice(-4000);
      if (timedOut) {
        resolvePromise({ ...base, ok: false, log: `배포 타임아웃(${DEPLOY_TIMEOUT_MS}ms) — 출력 꼬리:\n${tail}` });
        return;
      }
      const url = extractDeployUrl(output);
      if (code === 0) {
        const report: ShowcaseDeployReport = { ...base, ok: true, log: tail };
        if (url !== undefined) report.url = url;
        resolvePromise(report);
      } else {
        resolvePromise({ ...base, ok: false, log: `wrangler 종료코드 ${code}:\n${tail}` });
      }
    });
  });
}

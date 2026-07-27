/**
 * qoo10-catalog CLI — 큐텐 등록 후보 상품 카탈로그(파일 스토리지) 관리.
 *
 * 스토리지: apps/qoo10-catalog/storage/  (git 포함 — 세션 간 인계되는 소싱 기록)
 *   catalog.json          인덱스(단일 진실 소스): [{id, name, brand, status, ...요약}]
 *   items/{id}.json       상세: 소싱·물류·마진·스크리닝 결과·사람 확인 기록
 *
 * 상태: candidate → screened → cleared(사람 게이트) → page-generated → listed
 *
 * 원칙:
 * - 스크리닝(물류·마진)은 @cak/product-page-gen CLI 를 spawn — 로직 재구현 금지.
 * - 브랜드 리스크는 blacklist-brands.json(사람 관리 참고 목록) 대조 — 표시만 하고 차단하지 않음.
 * - "문제없음" 최종 판정(cleared)은 사람 몫: clear 명령이 공급처·브랜드 정책 확인 내용을
 *   인자로 강제하고 기록한다. 기록 없는 cleared 는 존재할 수 없다.
 * - 개인수입 한도(화장품 24개/1품목 등)는 항목에 명시해 상세페이지·운영에서 참조.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KIT = resolve(__dirname, '..', '..');
const STORAGE = join(__dirname, 'storage');
const ITEMS = join(STORAGE, 'items');
const INDEX = join(STORAGE, 'catalog.json');
const BLACKLIST = join(__dirname, 'blacklist-brands.json');

const STATUSES = ['candidate', 'screened', 'cleared', 'page-generated', 'listed', 'rejected'];

// ---------- 저장소 ----------

function loadIndex() {
  if (!existsSync(INDEX)) return [];
  return JSON.parse(readFileSync(INDEX, 'utf8'));
}
function saveIndex(rows) {
  mkdirSync(ITEMS, { recursive: true });
  writeFileSync(INDEX, JSON.stringify(rows, null, 1), 'utf8');
}
function loadItem(id) {
  const p = join(ITEMS, `${id}.json`);
  if (!existsSync(p)) throw new Error(`항목 없음: ${id}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}
function saveItem(item) {
  mkdirSync(ITEMS, { recursive: true });
  writeFileSync(join(ITEMS, `${item.id}.json`), JSON.stringify(item, null, 1), 'utf8');
  const rows = loadIndex();
  const i = rows.findIndex((r) => r.id === item.id);
  const summary = {
    id: item.id,
    name: item.name,
    brand: item.brand ?? null,
    status: item.status,
    opportunity: item.source?.opportunity ?? null,
    brandRisk: item.screen?.brandRisk?.length > 0 ? true : false,
    updatedAt: item.updatedAt,
  };
  if (i >= 0) rows[i] = summary;
  else rows.push(summary);
  saveIndex(rows);
}

function slugify(name) {
  // NFC 유지 — NFKD 는 한글을 자모로 분해해 [가-힣] 매치가 전부 사라진다(실측 결함)
  return (
    name
      .normalize('NFC')
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || `item-${Date.now()}`
  );
}

// ---------- 외부 CLI 브릿지 ----------

function runPpg(args) {
  const r = spawnSync('npm', ['run', '--silent', 'cli', '--', ...args], {
    cwd: join(KIT, 'packages', 'product-page-gen'),
    encoding: 'utf8',
    timeout: 120_000,
  });
  try {
    return { code: r.status ?? -1, data: JSON.parse(r.stdout) };
  } catch {
    return { code: r.status ?? -1, data: null, raw: (r.stdout || r.stderr || '').slice(-300) };
  }
}

function runKeywordIntel(top) {
  const r = spawnSync(
    'npm',
    ['run', '--silent', 'analyze', '-w', '@cak/keyword-intel', '--', '--top', String(top), '--json'],
    { cwd: KIT, encoding: 'utf8', timeout: 120_000 },
  );
  return JSON.parse(r.stdout);
}

// ---------- 명령 ----------

function out(data) {
  console.log(JSON.stringify(data, null, 1));
}

function cmdImportKeywords(o) {
  const top = Number(o.top ?? 20);
  const data = runKeywordIntel(top);
  const rows = loadIndex();
  const added = [];
  const skipped = [];
  for (const it of data.items ?? []) {
    const id = slugify(it.topic);
    if (rows.some((r) => r.id === id)) {
      skipped.push(it.topic);
      continue;
    }
    const item = {
      id,
      name: it.topic,
      brand: null,
      status: 'candidate',
      source: { kind: 'keyword-intel', opportunity: it.opportunity, importedAt: new Date().toISOString() },
      notes: ['keyword-intel 후보 — 스코어는 참고 지표(자동 선정 아님). 브랜드·공급처는 사람이 특정'],
      updatedAt: new Date().toISOString(),
    };
    saveItem(item);
    added.push({ id, name: it.topic, opportunity: it.opportunity });
  }
  out({ ok: true, added: added.length, skipped: skipped.length, items: added });
}

function cmdAdd(o) {
  if (!o.name) throw new Error('--name 필수');
  const id = o.id ?? slugify(o.name);
  const rows = loadIndex();
  if (rows.some((r) => r.id === id)) throw new Error(`이미 존재: ${id}`);
  const item = {
    id,
    name: o.name,
    brand: o.brand ?? null,
    volume: o.volume ?? null,
    weightG: o.weight !== undefined ? Number(o.weight) : null,
    dims: o.dims ?? null,
    wholesaleKrw: o['wholesale-krw'] !== undefined ? Number(o['wholesale-krw']) : null,
    category: o.category ?? null,
    /** 화장품 개인수입 기준 1품목 24개 이내(역직구 전제) — 운영 참조용 */
    personalImportNote: '화장품 개인수입 24개/품목 한도(일본) — 대량 구매 유도 금지',
    imageRights: o['image-rights'] ?? 'none', // none | user-photo | supplier-licensed
    status: 'candidate',
    source: { kind: 'manual', importedAt: new Date().toISOString() },
    notes: [],
    updatedAt: new Date().toISOString(),
  };
  saveItem(item);
  out({ ok: true, id, status: 'candidate' });
}

function checkBrandRisk(item) {
  const bl = JSON.parse(readFileSync(BLACKLIST, 'utf8'));
  const hay = `${item.name} ${item.brand ?? ''}`.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  return bl.entries.filter((e) => hay.includes(e.match.toLowerCase().replace(/\s+/g, '')));
}

async function cmdScreen(o) {
  const ids = o.id ? [o.id] : loadIndex().filter((r) => r.status === 'candidate').map((r) => r.id);
  const results = [];
  for (const id of ids) {
    const item = loadItem(id);
    const screen = { at: new Date().toISOString(), notes: [] };

    // ① 브랜드 리스크(참고 목록 대조 — 차단 아님)
    screen.brandRisk = checkBrandRisk(item).map((e) => e.reason);

    // ② 물류 게이트(무게 있으면)
    if (item.weightG !== null && item.weightG !== undefined) {
      const args = ['logistics', '--name', item.name, '--weight', String(item.weightG)];
      if (item.dims) args.push('--dims', item.dims);
      const r = runPpg(args);
      screen.logistics = r.data;
      if (r.data?.flammable) screen.notes.push('⛔ 인화성 의심 — Qxpress 발송 불가(기각 권장)');
    } else {
      screen.notes.push('물류 미검증 — weightG 없음');
    }

    // ③ 마진(도매가+판매가+환율 있으면)
    const saleJpy = o['sale-jpy'] !== undefined ? Number(o['sale-jpy']) : null;
    const rate = o.rate !== undefined ? Number(o.rate) : null;
    if (item.wholesaleKrw !== null && saleJpy !== null && rate !== null) {
      const qx = screen.logistics?.estimatedJpy ?? 675;
      const r = runPpg([
        'margin', '--sale-jpy', String(saleJpy), '--wholesale-krw', String(item.wholesaleKrw),
        '--rate', String(rate), '--qxpress-jpy', String(qx), '--scenario', 'megawari', '--domestic-ship', '300',
      ]);
      screen.margin = r.data;
      if (r.data && r.data.pass !== true) screen.notes.push(`마진 미달(메가와리 ${r.data.netMarginPct}%)`);
    } else {
      screen.notes.push('마진 미검증 — wholesaleKrw/--sale-jpy/--rate 중 누락');
    }

    item.screen = screen;
    if (item.status === 'candidate') item.status = 'screened';
    item.updatedAt = new Date().toISOString();
    saveItem(item);
    results.push({ id, brandRisk: screen.brandRisk, notes: screen.notes });
  }
  out({ ok: true, screened: results.length, results });
}

function cmdClear(o) {
  if (!o.id) throw new Error('--id 필수');
  // 사람 게이트: 확인 내용 없이는 cleared 불가(기록 강제).
  if (!o.supplier) throw new Error('--supplier "공급처/소싱 경로" 필수 (사람 확인 기록)');
  if (!o['brand-policy']) throw new Error('--brand-policy "병행판매 정책 확인 내용" 필수 (사람 확인 기록)');
  const item = loadItem(o.id);
  if (item.status !== 'screened') throw new Error(`screened 상태에서만 clear 가능 (현재: ${item.status})`);
  if (item.screen?.logistics?.flammable) throw new Error('인화성 품목은 clear 불가(Qxpress 발송 불가)');
  item.humanCheck = {
    supplier: o.supplier,
    brandPolicy: o['brand-policy'],
    imageRights: o['image-rights'] ?? item.imageRights ?? 'none',
    clearedAt: new Date().toISOString(),
  };
  item.status = 'cleared';
  item.updatedAt = new Date().toISOString();
  saveItem(item);
  out({ ok: true, id: item.id, status: 'cleared', humanCheck: item.humanCheck });
}

function cmdMark(o) {
  // page-generated / listed 기록 (산출물 경로·상품번호 연결)
  if (!o.id || !o.status) throw new Error('--id, --status 필수');
  if (!STATUSES.includes(o.status)) throw new Error(`status 는 ${STATUSES.join('|')}`);
  const item = loadItem(o.id);
  if (o.status === 'page-generated' && item.status !== 'cleared') {
    throw new Error('cleared 이후에만 page-generated 가능(사람 게이트 우회 금지)');
  }
  if (o.status === 'listed' && item.status !== 'page-generated') {
    throw new Error('page-generated 이후에만 listed 가능');
  }
  item.status = o.status;
  if (o.ref) (item.refs ??= []).push({ status: o.status, ref: o.ref, at: new Date().toISOString() });
  item.updatedAt = new Date().toISOString();
  saveItem(item);
  out({ ok: true, id: item.id, status: item.status });
}

function cmdList(o) {
  let rows = loadIndex();
  if (o.status) rows = rows.filter((r) => r.status === o.status);
  rows.sort((a, b) => (b.opportunity ?? 0) - (a.opportunity ?? 0));
  out({ total: rows.length, items: rows });
}

function cmdShow(o) {
  if (!o.id) throw new Error('--id 필수');
  out(loadItem(o.id));
}

// ---------- 진입 ----------

const [cmd, ...rest] = process.argv.slice(2);
const OPTS = {
  top: { type: 'string' }, id: { type: 'string' }, name: { type: 'string' }, brand: { type: 'string' },
  volume: { type: 'string' }, weight: { type: 'string' }, dims: { type: 'string' },
  'wholesale-krw': { type: 'string' }, category: { type: 'string' }, 'image-rights': { type: 'string' },
  'sale-jpy': { type: 'string' }, rate: { type: 'string' }, supplier: { type: 'string' },
  'brand-policy': { type: 'string' }, status: { type: 'string' }, ref: { type: 'string' },
};

try {
  const { values: o } = parseArgs({ args: rest, options: OPTS, allowPositionals: false });
  switch (cmd) {
    case 'import-keywords': cmdImportKeywords(o); break;
    case 'add': cmdAdd(o); break;
    case 'screen': await cmdScreen(o); break;
    case 'clear': cmdClear(o); break;
    case 'mark': cmdMark(o); break;
    case 'list': cmdList(o); break;
    case 'show': cmdShow(o); break;
    default:
      throw new Error('명령: import-keywords | add | screen | clear | mark | list | show');
  }
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: String(e?.message ?? e) }, null, 1));
  process.exitCode = 1;
}

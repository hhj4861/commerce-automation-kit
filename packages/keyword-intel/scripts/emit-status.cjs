/**
 * 일일 자가복구 상태파일 발행 — 로컬 daily-collect.sh 가 수집/리포트 후 호출한다.
 *
 * 왜 존재하나: keyword-intel 수집은 로컬 launchd 로 돌고 그 로그(data/daily.log)·DB(data/intel.db)는
 * gitignore 라 클라우드에서 못 본다. wp-auto-blog 가 data/*.json 을 레포에 커밋해 클라우드 GHA 가 읽는
 * 것과 동일하게, **비밀정보 없는 상태 요약만** tracked 경로(status/daily-status.json)로 발행하고
 * daily-collect 가 커밋·푸시한다. 클라우드 GHA(.github/workflows/keyword-intel-selfheal.yml)가 이걸
 * 읽어 "예약 수집이 오늘 성공했는지 / wake-DNS 자가복구가 발동했는지"를 검증한다.
 *
 * 출력 필드는 counts·booleans·날짜뿐 — 키워드 원문·자격증명은 담지 않는다(public 레포 안전).
 * self-heal 관련 값은 셸이 ST_* 환경변수로 주입하고, signals/failures 는 DB 에서 직접 센다.
 */
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..');
const db = new Database(path.join(PKG, 'data/intel.db'), { readonly: true, fileMustExist: true });

const run = db
  .prepare('SELECT run_id, finished_at, failures FROM runs ORDER BY finished_at DESC, run_id DESC LIMIT 1')
  .get();
let signals = 0;
let failures = 0;
let lastRunFinishedAt = null;
if (run) {
  signals = db.prepare('SELECT COUNT(*) AS c FROM signals WHERE run_id = ?').get(run.run_id).c;
  failures = JSON.parse(run.failures || '[]').length; // runs.failures 는 TTL 무관(purge 영향 없음)
  lastRunFinishedAt = run.finished_at;
}
db.close();

const env = process.env;
const status = {
  day: env.ST_DAY || null, // 이 수집이 돈 KST 날짜(YYYY-MM-DD) — GHA 가 "오늘 것인지" 판정
  generatedAt: new Date().toISOString(),
  dnsReady: env.ST_DNS === 'true', // 준비 프로브가 DNS 안정 확인 후 수집했는지
  collectAttempts: Number(env.ST_ATTEMPTS || 0), // 래퍼가 collect 를 시도한 횟수(1=재시도 없음)
  selfHealTriggered: env.ST_SELFHEAL === 'true', // exit 75(wake-DNS 전량 미도달) → 재시도 발동 여부
  finalOk: env.ST_OK === 'true', // collect 최종 성공 여부
  signals,
  failures,
  lastRunFinishedAt,
};

const out = path.join(PKG, 'status/daily-status.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(status, null, 2) + '\n');
console.log('status written:', JSON.stringify(status));

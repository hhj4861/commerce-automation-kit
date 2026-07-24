/**
 * 클라우드 GHA(.github/workflows/keyword-intel-selfheal.yml)가 실행하는 검증기.
 * 로컬 daily-collect 가 커밋·푸시한 status/daily-status.json 을 읽어 "오늘(KST) 예약 수집이
 * 성공했는지 / wake-DNS 자가복구가 발동했는지"를 판정한다.
 *   - 정상 → exit 0 (GHA green)
 *   - 문제(파일 없음·오늘 것 아님·최종 실패) → exit 1 (GHA red → 소유자에게 실패 메일 = 리마인더)
 * GITHUB_STEP_SUMMARY 에 사람이 읽을 표를 남긴다. 비밀정보는 다루지 않는다(counts·booleans만).
 */
const fs = require('node:fs');
const path = require('node:path');

const STATUS = path.resolve(__dirname, '..', 'status', 'daily-status.json');
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD (KST)

const summary = [];
const say = (l) => {
  summary.push(l);
  console.log(l.replace(/[#*`>|]/g, '').trim());
};
function flush() {
  const f = process.env.GITHUB_STEP_SUMMARY;
  if (f) {
    try {
      fs.appendFileSync(f, summary.join('\n') + '\n');
    } catch {
      /* summary 는 부가정보 — 실패해도 판정엔 영향 없음 */
    }
  }
}

if (!fs.existsSync(STATUS)) {
  say(`## ⚠️ keyword-intel 상태파일 없음`);
  say(`\`status/daily-status.json\` 이 없다 — 로컬 수집이 아직 상태를 안 올렸을 수 있음(오늘 KST ${today}).`);
  flush();
  process.exit(1);
}

const s = JSON.parse(fs.readFileSync(STATUS, 'utf8'));
say(`## keyword-intel 자가복구 상태 (${s.day})`);
say('');
say(`| 항목 | 값 |`);
say(`|---|---|`);
say(`| 상태파일 날짜 | ${s.day} (오늘 KST ${today}) |`);
say(`| DNS 준비 | ${s.dnsReady ? '✅' : '⚠️ 미확인'} |`);
say(`| collect 시도 | ${s.collectAttempts}회 |`);
say(`| 자가복구(exit75 재시도) | ${s.selfHealTriggered ? '🔁 발동' : '— 없음(정상)'} |`);
say(`| 최종 성공 | ${s.finalOk ? '✅' : '❌'} |`);
say(`| 신호 / 실패 | ${s.signals} / ${s.failures} |`);
say('');

const problems = [];
if (s.day !== today) problems.push(`상태파일이 오늘(${today}) 것이 아님 — 예약 수집 누락 또는 상태 미푸시 의심`);
if (!s.finalOk) problems.push('collect 최종 실패');

if (s.selfHealTriggered && s.finalOk) {
  say(`> 🔁 **자가복구가 실제로 발동해 복구됨** — wake-DNS exit75 재시도가 프로덕션에서 검증됨.`);
}
say(problems.length ? `> ❌ **문제:** ${problems.join(' / ')}` : `> ✅ 예약 수집 정상.`);
flush();
process.exit(problems.length ? 1 : 0);

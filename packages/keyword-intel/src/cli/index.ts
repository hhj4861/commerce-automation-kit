/**
 * CLI 진입점 — 모듈을 독립 실행/검증하기 위한 얇은 껍데기.
 * 조합 단계에서는 이 CLI 대신 collectSignals() 를 라이브러리로 import 한다.
 *
 * 사용:
 *   npm run collect -- "루테인,밀크씨슬,콜라겐"     # 키워드 수집 → IntelBatch JSON(stdout)
 *   npm run collect -- --file seeds/g2-seeds.txt     # 시드 파일 수집(줄당 1키워드, # 주석 허용)
 *   npm run analyze -- --top 20                      # 저장 신호를 opportunity 순 정렬(참고 지표)
 *   npm run dlq                                      # DLQ 목록 (격리·연속실패 현황)
 *   npm run dlq -- clear [키워드]                    # DLQ 즉시 해제(전체 또는 특정 키워드)
 *   npm run report                                   # 일일 다이제스트 → 텔레그램 전송
 *   npm run report -- --dry-run                      # 전송 없이 내용만 stdout 확인
 *   npm run report -- --setup                        # 봇 chat_id 후보 탐색(.env 설정 도우미)
 *
 * 출력 규약: stdout = 데이터(JSON/표), stderr = 로그·경고·알림.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSignals } from './collect.js';
import { openDb } from '../store/db.js';

// .env 자동 로드(CLI 전용, Node 20.12+ 내장) — cwd 가 아닌 "패키지 루트" 기준(DB_PATH 와 동일 원칙).
// 기존 환경변수를 덮어쓰지 않으며, 파일이 없으면(테스트/CI) 조용히 넘어간다.
try {
  process.loadEnvFile(resolve(fileURLToPath(new URL('../..', import.meta.url)), '.env'));
} catch {
  /* .env 없음 — 환경변수 직접 주입 경로 그대로 동작 */
}
import { purgeExpired, topOpportunities } from '../store/signals.js';
import { clearAll, clearFailure, dlqReport, dlqThresholdFromEnv } from '../store/dlq.js';
import { buildDigest } from './report.js';
import {
  loadTelegramCredentials,
  listRecentChats,
  sendMessage,
  TelegramApiError,
} from '../adapters/telegram.js';
import { withRetry } from '../obs/retry.js';
import { setGlobalDispatcher } from 'undici';
import { tunedNaverAgent } from '../adapters/naver-client.js';

// 죽은 keep-alive 소켓 재사용으로 인한 60초 행+ECONNRESET 방지(G2 실측 관측) — 어댑터 주석 참조.
setGlobalDispatcher(tunedNaverAgent);

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case 'collect': {
      let keywords: string[];
      const fileIdx = rest.indexOf('--file');
      if (fileIdx >= 0) {
        const p = rest[fileIdx + 1];
        if (!p) {
          console.error('사용법: npm run collect -- --file seeds/g2-seeds.txt');
          process.exit(1);
        }
        // 줄당 1키워드, `#` 이후는 주석(카테고리 헤더·플래그 표기용)
        keywords = readFileSync(p, 'utf8')
          .split('\n')
          .map((l) => l.replace(/#.*$/, '').trim())
          .filter(Boolean);
      } else {
        keywords = (rest[0] ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
      if (keywords.length === 0) {
        console.error('사용법: npm run collect -- "키워드1,키워드2" 또는 --file <경로>');
        process.exit(1);
      }
      const batch = await collectSignals(keywords);
      console.log(JSON.stringify(batch, null, 2));
      if (batch.failures.length) {
        console.error(`\n⚠️ 실패/스킵 ${batch.failures.length}건:`);
        for (const f of batch.failures) console.error(`  - ${f.keyword}: ${f.reason}`);
      }
      break;
    }
    case 'analyze': {
      const topIdx = rest.indexOf('--top');
      const topRaw = topIdx >= 0 ? Number(rest[topIdx + 1]) : 20;
      const top = Number.isInteger(topRaw) && topRaw > 0 ? topRaw : 20;

      const db = openDb();
      const purged = purgeExpired(db);
      if (purged > 0) console.error(`(약관 TTL 만료 캐시 ${purged}건 무효화)`);

      const rows = topOpportunities(db, top);
      if (rows.length === 0) {
        console.log('저장된 신호가 없습니다. 먼저 collect 를 실행하세요.');
        break;
      }
      // ⚠️ 참고 지표: 이 순위로 제조/발주/광고를 자동 실행하지 않는다(LEGAL-BOUNDARY 경계 5).
      console.log(`opportunity 상위 ${rows.length}개 (참고 지표 — 사람 판단의 입력):`);
      console.table(
        rows.map((r) => ({
          키워드: r.keyword,
          opportunity: r.opportunity,
          confidence: r.confidence,
          '상품수(total)': r.totalProducts,
          '트렌드(0~100)': r.trendLatest ?? '-',
          수집시각: r.capturedAt,
        })),
      );

      const dlq = dlqReport(db, dlqThresholdFromEnv());
      if (dlq.length) {
        console.error(`\n⚠️ DLQ 격리 키워드 ${dlq.length}건 (원인 해소 후 재시도 필요):`);
        for (const d of dlq)
          console.error(`  - ${d.keyword}: ${d.failCount}회 연속 실패, 마지막=${d.lastReason.slice(0, 100)}`);
      }
      break;
    }
    case 'dlq': {
      const sub = rest[0] ?? 'list';
      const db = openDb();
      if (sub === 'clear') {
        const kw = rest[1];
        if (kw) {
          clearFailure(db, kw);
          console.log(`DLQ 해제: ${kw}`);
        } else {
          const n = clearAll(db);
          console.log(`DLQ 전체 해제: ${n}건`);
        }
        break;
      }
      const threshold = dlqThresholdFromEnv();
      const entries = dlqReport(db, 1); // 연속 1회 이상 전부 (격리는 임계 표시로 구분)
      if (entries.length === 0) {
        console.log('DLQ 비어 있음.');
        break;
      }
      console.table(
        entries.map((d) => ({
          키워드: d.keyword,
          연속실패: d.failCount,
          격리여부: d.failCount >= threshold ? `격리(임계 ${threshold})` : '-',
          마지막실패: d.lastFailedAt,
          사유: d.lastReason.slice(0, 60),
        })),
      );
      break;
    }
    case 'report': {
      if (rest.includes('--setup')) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) {
          console.error('TELEGRAM_BOT_TOKEN 미설정 — @BotFather 로 봇을 만들고 .env 에 직접 넣으세요.');
          process.exit(1);
        }
        const chats = await listRecentChats(token);
        if (chats.length === 0) {
          console.error('최근 대화 없음 — 텔레그램에서 봇에게 아무 메시지나 1개 보낸 뒤 다시 실행하세요.');
          process.exit(1);
        }
        console.log('chat_id 후보 (.env 의 TELEGRAM_CHAT_ID 에 입력):');
        for (const c of chats) console.log(`  ${c.chatId}  (${c.label})`);
        break;
      }

      const topIdx = rest.indexOf('--top');
      const topRaw = topIdx >= 0 ? Number(rest[topIdx + 1]) : 10;
      const top = Number.isInteger(topRaw) && topRaw > 0 ? topRaw : 10;
      const db = openDb();
      purgeExpired(db);
      const digest = buildDigest(db, top);

      if (rest.includes('--dry-run')) {
        console.log(digest);
        break;
      }
      const cred = loadTelegramCredentials();
      if (!cred) {
        // 텔레그램 미설정이어도 크론의 수집은 계속되게 exit 0 — 내용은 stderr 로 남긴다(투명화).
        console.error('TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID 미설정 — 전송 생략, 다이제스트만 출력:');
        console.error(digest);
        break;
      }
      // 429/5xx/네트워크 순단은 백오프 재시도. 기본 다이제스트는 1청크(<4000자)라
      // 전체 재시도의 중복 전송 위험은 사실상 없다(다청크+부분성공 재시도는 중복 가능 — 허용 트레이드오프).
      await withRetry(() => sendMessage(cred, digest), {
        shouldRetry: (e) =>
          (e instanceof TelegramApiError && (e.status === 429 || e.status >= 500)) ||
          ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH'].includes(
            String(
              (e as { code?: string } | null)?.code ??
                (e as { cause?: { code?: string } } | null)?.cause?.code,
            ),
          ),
      });
      console.error(`텔레그램 전송 완료 (${digest.length}자)`);
      break;
    }
    default:
      console.error('명령: collect | analyze | dlq | report');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

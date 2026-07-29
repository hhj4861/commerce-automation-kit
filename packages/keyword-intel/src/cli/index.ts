/**
 * CLI 진입점 — 모듈을 독립 실행/검증하기 위한 얇은 껍데기.
 * 조합 단계에서는 이 CLI 대신 collectSignals() 를 라이브러리로 import 한다.
 *
 * 사용:
 *   npm run collect -- "루테인,밀크씨슬,콜라겐"     # 키워드 수집 → IntelBatch JSON(stdout)
 *   npm run collect -- --file seeds/g2-seeds.txt     # 시드 파일 수집(줄당 1키워드, # 주석 허용)
 *   npm run analyze -- --top 20                      # 트렌드용: 저장 신호를 opportunity(데이터랩) 순 정렬
 *   npm run analyze -- --blog --top 15               # 블로그용: 검색광고 절대검색량×승산 랭킹(NAVER_AD_* 필요)
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
import { collectSignals, isWholesaleUnreachable } from './collect.js';
import { openDb } from '../store/db.js';

// .env 자동 로드(CLI 전용, Node 20.12+ 내장) — cwd 가 아닌 "패키지 루트" 기준(DB_PATH 와 동일 원칙).
// 기존 환경변수를 덮어쓰지 않으며, 파일이 없으면(테스트/CI) 조용히 넘어간다.
try {
  process.loadEnvFile(resolve(fileURLToPath(new URL('../..', import.meta.url)), '.env'));
} catch {
  /* .env 없음 — 환경변수 직접 주입 경로 그대로 동작 */
}
import { purgeExpired, topOpportunities, signalsForExport } from '../store/signals.js';
import { buildBlogExport, resolveProfile } from './export.js';
import { loadSearchAdCredentials, keywordTool, SearchAdApiError } from '../adapters/searchad-client.js';
import { scoreBlog } from '../core/analyzer.js';
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

/**
 * seeds/shopping-categories.json 의 keyword→cat_id 맵을 로드해 collect 용 resolver 를 만든다.
 * cat_id 전체목록/조회 API 가 없어(수동 확인, D1-4) 정적 맵으로 둔다. 파일 없음/빈 맵/파싱 실패면
 * undefined → 쇼핑인사이트 아예 미수집(기존 동작 하위호환). 맵에 없는 키워드는 null(그 키워드만 미수집).
 */
function loadShoppingCategoryResolver(): ((kw: string) => string | null) | undefined {
  try {
    const p = resolve(fileURLToPath(new URL('../..', import.meta.url)), 'seeds/shopping-categories.json');
    const raw = JSON.parse(readFileSync(p, 'utf8')) as { map?: Record<string, string> };
    const map = raw.map ?? {};
    if (Object.keys(map).length === 0) return undefined;
    return (kw: string) => map[kw] ?? null;
  } catch {
    return undefined;
  }
}

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
      // exactOptionalPropertyTypes: resolver 미존재 시 키를 아예 넘기지 않는다(undefined 명시 금지).
      const shoppingResolver = loadShoppingCategoryResolver();
      const batch = await collectSignals(
        keywords,
        shoppingResolver ? { shoppingCategory: shoppingResolver } : {},
      );
      console.log(JSON.stringify(batch, null, 2));
      if (batch.failures.length) {
        console.error(`\n⚠️ 실패/스킵 ${batch.failures.length}건:`);
        for (const f of batch.failures) console.error(`  - ${f.keyword}: ${f.reason}`);
      }
      // 전량이 "서버 미도달"로 실패했는가 → 전용 종료코드 75(EX_TEMPFAIL)로 끝낸다. wake 직후
      // DNS/네트워크 미준비가 대표 사례(실측 2026-07-24 09:37). 크론 래퍼는 **75일 때만** 대기 후
      // 재시도(자가 복구)하고, 다른 비정상 종료(1=사용법 오류·예상외 크래시/DB 실패)는 재시도하지
      // 않는다 — 그래야 성공 후 저장 실패 같은 케이스에서 쿼터를 헛되이 재소비하지 않는다(적대적 리뷰
      // 확정). 부분 실패·예산 스킵은 정상 결과라 exit 0 유지(위에서 이미 투명화).
      if (isWholesaleUnreachable(batch)) {
        console.error(
          `\n🚨 전량 미도달 실패 ${batch.failures.length}건 — 네트워크(DNS) 미준비 추정. exit 75 로 종료(래퍼가 재시도).`,
        );
        process.exit(75);
      }
      break;
    }
    case 'analyze': {
      const topIdx = rest.indexOf('--top');
      const topRaw = topIdx >= 0 ? Number(rest[topIdx + 1]) : 20;
      const top = Number.isInteger(topRaw) && topRaw > 0 ? topRaw : 20;

      // --blog : 블로그용 랭킹(검색광고 절대 검색량×승산). 트렌드용 opportunity 와 별개 지표.
      //   검색광고(searchad) API 는 openapi 와 auth·약관·한도가 달라 코어 예산원장에 끼우지 않고,
      //   이 명령에서 후보(트렌드 상위)에 대해 **일시 조회 → blogScore 계산** 만 한다(raw 미영속).
      //   ⚠️ 이 데이터는 재판매 금지 — 본인 시스템 랭킹 표시에만 사용.
      if (rest.includes('--blog')) {
        const cred = loadSearchAdCredentials();
        if (!cred) {
          console.error(
            '검색광고 자격증명(NAVER_AD_CUSTOMER_ID/NAVER_AD_API_KEY/NAVER_AD_SECRET_KEY) 미설정 — 블로그 랭킹은 검색광고 키워드도구 API 가 필요합니다.',
          );
          process.exitCode = 2;
          break;
        }
        const db = openDb();
        const purgedB = purgeExpired(db);
        if (purgedB > 0) console.error(`(약관 TTL 만료 캐시 ${purgedB}건 무효화)`);
        // 후보 풀: 저장된 신호 상위(트렌드 순). 여기서 검색광고 절대량으로 재랭킹한다.
        const candidates = topOpportunities(db, Math.max(top * 2, 40));
        if (candidates.length === 0) {
          console.log('저장된 신호가 없습니다. 먼저 collect 를 실행하세요.');
          break;
        }
        const norm = (s: string): string => s.replace(/\s+/g, '');
        const netCode = (e: unknown): string =>
          String(
            (e as { code?: string } | null)?.code ??
              (e as { cause?: { code?: string } } | null)?.cause?.code,
          );
        const NET_RETRY = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_SOCKET'];
        interface BlogRow {
          keyword: string;
          blogScore: number;
          monthlyTotal: number;
          compIdx: string;
          shopping: number | null;
          note: string;
        }
        const results: BlogRow[] = [];
        console.error(`검색광고 조회 중 (${candidates.length}개 후보)...`);
        for (const c of candidates) {
          try {
            // 한도 수치 비공개 → 429/5xx/일시 네트워크는 적응형 백오프(코어 예산원장과 무관).
            const rows = await withRetry(() => keywordTool(cred, c.keyword), {
              maxAttempts: 4,
              baseDelayMs: 1500,
              shouldRetry: (e) =>
                (e instanceof SearchAdApiError && (e.rateLimited || e.status >= 500)) ||
                NET_RETRY.includes(netCode(e)),
            });
            const exact = rows.find((r) => norm(r.relKeyword) === norm(c.keyword)) ?? null;
            if (!exact) {
              results.push({
                keyword: c.keyword,
                blogScore: 0,
                monthlyTotal: 0,
                compIdx: '-',
                shopping: c.shoppingTrendLatest,
                note: '검색광고 데이터 없음',
              });
              continue;
            }
            const sc = scoreBlog(exact);
            results.push({
              keyword: c.keyword,
              blogScore: sc.blogScore,
              monthlyTotal: sc.monthlyTotal,
              compIdx: exact.compIdx ?? '-',
              shopping: c.shoppingTrendLatest,
              note: exact.masked ? '검색량 마스킹(<10)' : '',
            });
          } catch (e) {
            // 실패도 조용히 삼키지 않는다(silent drop 금지) — 비고에 사유 표면화.
            results.push({
              keyword: c.keyword,
              blogScore: 0,
              monthlyTotal: 0,
              compIdx: '-',
              shopping: c.shoppingTrendLatest,
              note: `조회실패: ${(e instanceof Error ? e.message : String(e)).slice(0, 50)}`,
            });
          }
        }
        results.sort((a, b) => b.blogScore - a.blogScore || b.monthlyTotal - a.monthlyTotal);
        console.log(
          `🏆 블로그용 상위 ${Math.min(top, results.length)}개 (실제 검색량×승산 — 트렌드용 opportunity와 별개, 참고 지표):`,
        );
        console.table(
          results.slice(0, top).map((r) => ({
            키워드: r.keyword,
            blogScore: r.blogScore,
            '월검색량(pc+mo)': r.monthlyTotal,
            '광고경쟁도': r.compIdx,
            '쇼핑수요(0~100)': r.shopping ?? '-',
            비고: r.note,
          })),
        );
        break;
      }

      // --json [--profile blog-kr|blog-global] : wp-auto-blog 브릿지 export(§8, 단방향).
      // 읽기 전용 뷰 — 추가 API 호출 0. stdout=JSON 데이터, stderr=경고.
      if (rest.includes('--json')) {
        const profIdx = rest.indexOf('--profile');
        const profileArg = profIdx >= 0 ? rest[profIdx + 1] : 'blog-kr';
        let profile;
        try {
          profile = resolveProfile(profileArg ?? 'blog-kr');
        } catch (e) {
          console.error(`(거부) ${(e as Error).message}`);
          process.exitCode = 2;
          break;
        }
        const db = openDb();
        const purgedJ = purgeExpired(db);
        if (purgedJ > 0) console.error(`(약관 TTL 만료 캐시 ${purgedJ}건 무효화)`);
        const exportRows = signalsForExport(db, top);
        if (exportRows.length === 0) {
          console.error('경고: 저장된 신호가 없습니다(먼저 collect 실행). 빈 export 를 출력합니다.');
        }
        const payload = buildBlogExport(exportRows, {
          profile,
          now: new Date().toISOString(),
        });
        console.log(JSON.stringify(payload, null, 2));
        break;
      }

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
          '검색트렌드(0~100)': r.trendLatest ?? '-',
          '쇼핑수요(0~100)': r.shoppingTrendLatest ?? '-', // 커머스 맥락 수요(D1-4). cat_id 미상은 '-'
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

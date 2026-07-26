/**
 * 신호 영속화 — IntelBatch(runs + signals) 저장, 약관 TTL 집행, opportunity 조회.
 *
 * TTL 규약(LEGAL-BOUNDARY §3): expires_at = captured_at + compliance.cacheTtlHours.
 * 만료된 캐시는 purgeExpired() 로 자동 무효화하며, 조회(topOpportunities)도 만료분을 제외한다.
 * D1-5(약관) 확정 전까지 cacheTtlHours 는 보수적 기본값(24h)이 계약에서 내려온다.
 */
import type { IntelBatch } from '@cak/contracts';
import type { Db } from './db.js';
import { kstDay } from '../core/time.js';

export function saveBatch(db: Db, batch: IntelBatch): void {
  const insRun = db.prepare(
    `INSERT INTO runs(run_id, started_at, finished_at, requested_keywords, calls_spent, failures)
     VALUES(?,?,?,?,?,?)`,
  );
  const insSig = db.prepare(
    `INSERT INTO signals(keyword, captured_at, run_id, competition, trend, scores, coverage,
                         compliance, opportunity, confidence, expires_at, shopping_trend)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  // 가공 지표 히스토리(마이그레이션 v3 근거 주석 참조) — TTL purge 와 무관하게 Δ·캘리브레이션 유지
  const insHist = db.prepare(
    `INSERT INTO signal_history(keyword, day, captured_at, opportunity, confidence, total_products, trend_latest)
     VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(keyword, day) DO UPDATE SET
       captured_at = excluded.captured_at, opportunity = excluded.opportunity,
       confidence = excluded.confidence, total_products = excluded.total_products,
       trend_latest = excluded.trend_latest`,
  );
  db.transaction(() => {
    insRun.run(
      batch.runId,
      batch.startedAt,
      batch.finishedAt,
      JSON.stringify(batch.requestedKeywords),
      JSON.stringify(batch.callsSpent),
      JSON.stringify(batch.failures),
    );
    for (const s of batch.signals) {
      const expiresAt = new Date(
        Date.parse(s.capturedAt) + s.compliance.cacheTtlHours * 3600_000,
      ).toISOString();
      insSig.run(
        s.keyword,
        s.capturedAt,
        batch.runId,
        JSON.stringify(s.competition),
        JSON.stringify(s.trend),
        JSON.stringify(s.scores),
        JSON.stringify(s.coverage),
        JSON.stringify(s.compliance),
        s.scores.opportunity,
        s.scores.confidence,
        expiresAt,
        s.shoppingTrend ? JSON.stringify(s.shoppingTrend) : null, // D1-4: 옵셔널 → 미수집이면 NULL
      );
      insHist.run(
        s.keyword,
        kstDay(new Date(s.capturedAt)),
        s.capturedAt,
        s.scores.opportunity,
        s.scores.confidence,
        s.competition.totalProducts,
        s.trend.latest,
      );
    }
  })();
}

/** 약관 TTL 이 지난 캐시를 삭제한다. 반환값 = 삭제 건수(투명화용). */
export function purgeExpired(db: Db, now: Date = new Date()): number {
  return db.prepare(`DELETE FROM signals WHERE expires_at <= ?`).run(now.toISOString()).changes;
}

export interface TopOpportunityRow {
  keyword: string;
  opportunity: number;
  confidence: number;
  totalProducts: number;
  trendLatest: number | null;
  /** 쇼핑인사이트 커머스 수요 최신값(0~100 상대). cat_id 미상·미수집이면 null (D1-4) */
  shoppingTrendLatest: number | null;
  capturedAt: string;
}

/**
 * 키워드별 "최신·미만료" 스냅샷을 opportunity 내림차순으로 반환한다.
 * ⚠️ 이 순위는 사람이 참고하는 지표이며 자동 실행 트리거가 아니다(LEGAL-BOUNDARY 경계 5).
 */
export function topOpportunities(db: Db, limitN = 20, now: Date = new Date()): TopOpportunityRow[] {
  // ROW_NUMBER 로 키워드당 정확히 1행 보장 — captured_at 동률(같은 ms 수집·고정 클록 주입) 시
  // MAX JOIN 이 중복 매칭돼 LIMIT 슬롯을 잠식하는 결함의 수정(리뷰 확정). id 가 tiebreak.
  const rows = db
    .prepare(
      `SELECT keyword, opportunity, confidence, competition, trend, shoppingTrend, capturedAt
       FROM (
         SELECT s.keyword, s.opportunity, s.confidence, s.competition, s.trend,
                s.shopping_trend AS shoppingTrend,
                s.captured_at AS capturedAt,
                ROW_NUMBER() OVER (
                  PARTITION BY s.keyword ORDER BY s.captured_at DESC, s.id DESC
                ) AS rn
         FROM signals s
         WHERE s.expires_at > @now
       )
       WHERE rn = 1
       ORDER BY opportunity DESC, confidence DESC
       LIMIT @limitN`,
    )
    .all({ now: now.toISOString(), limitN }) as Array<{
    keyword: string;
    opportunity: number;
    confidence: number;
    competition: string;
    trend: string;
    shoppingTrend: string | null;
    capturedAt: string;
  }>;
  return rows.map((r) => ({
    keyword: r.keyword,
    opportunity: r.opportunity,
    confidence: r.confidence,
    totalProducts: (JSON.parse(r.competition) as { totalProducts: number }).totalProducts,
    trendLatest: (JSON.parse(r.trend) as { latest: number | null }).latest,
    shoppingTrendLatest: r.shoppingTrend
      ? ((JSON.parse(r.shoppingTrend) as { latest: number | null }).latest)
      : null,
    capturedAt: r.capturedAt,
  }));
}

/** export 뷰용 행 — topOpportunities 에 compliance 를 추가한 읽기 전용 스냅샷. */
export interface ExportRow {
  keyword: string;
  opportunity: number;
  confidence: number;
  compliance: { resaleRestricted: boolean; cacheTtlHours: number };
  capturedAt: string;
}

/**
 * 블로그 export(§8)용 조회 — 키워드별 최신·미만료 신호 + compliance 전파.
 * topOpportunities 와 동일한 ROW_NUMBER 패턴(키워드당 1행)이며 읽기 전용 뷰다.
 */
export function signalsForExport(db: Db, limitN = 50, now: Date = new Date()): ExportRow[] {
  const rows = db
    .prepare(
      `SELECT keyword, opportunity, confidence, compliance, capturedAt
       FROM (
         SELECT s.keyword, s.opportunity, s.confidence, s.compliance,
                s.captured_at AS capturedAt,
                ROW_NUMBER() OVER (
                  PARTITION BY s.keyword ORDER BY s.captured_at DESC, s.id DESC
                ) AS rn
         FROM signals s
         WHERE s.expires_at > @now
       )
       WHERE rn = 1
       ORDER BY opportunity DESC, confidence DESC
       LIMIT @limitN`,
    )
    .all({ now: now.toISOString(), limitN }) as Array<{
    keyword: string;
    opportunity: number;
    confidence: number;
    compliance: string;
    capturedAt: string;
  }>;
  return rows.map((r) => ({
    keyword: r.keyword,
    opportunity: r.opportunity,
    confidence: r.confidence,
    compliance: JSON.parse(r.compliance) as { resaleRestricted: boolean; cacheTtlHours: number },
    capturedAt: r.capturedAt,
  }));
}

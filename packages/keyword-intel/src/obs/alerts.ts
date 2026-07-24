/**
 * 알림 — 사람이 반드시 봐야 하는 사건을 구조화 로그(level=error, event=alert)로 표면화한다.
 * IMPLEMENTATION Phase 2 요구: 예산 80% 도달 · 인증 실패(401) · 응답 스키마 불일치.
 *
 * 배치(러너) 단위로 같은 종류 알림은 1회만 낸다 — 100키워드가 같은 알림을 100번 내지 않게.
 * TODO(Phase 4+): 웹훅/슬랙 등 외부 채널 연결 지점. 지금 규모에선 구조화 stderr 로 충분.
 */
import type { Logger } from './logger.js';

export type AlertKind = 'BUDGET_80' | 'AUTH_401' | 'SCHEMA_MISMATCH';

export interface Alerter {
  alert: (kind: AlertKind, message: string, fields?: Record<string, unknown>) => void;
}

export function createAlerter(log: Logger): Alerter {
  const fired = new Set<string>();
  return {
    alert(kind, message, fields = {}) {
      const key = `${kind}:${String(fields.source ?? '')}`;
      if (fired.has(key)) return;
      fired.add(key);
      log.error('alert', { kind, message, ...fields });
    },
  };
}

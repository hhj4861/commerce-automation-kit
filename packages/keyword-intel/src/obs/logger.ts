/**
 * 구조화 로깅 — 모든 로그는 stderr 로 JSON 1줄.
 * (stdout 은 collect 의 IntelBatch JSON 출력 전용으로 깨끗하게 유지한다)
 * 외부 의존성 없이 충분한 규모(1인 로컬 실행)라 pino 등은 넣지 않는다(ARCHITECTURE §5 취지).
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug: (event: string, fields?: Record<string, unknown>) => void;
  info: (event: string, fields?: Record<string, unknown>) => void;
  warn: (event: string, fields?: Record<string, unknown>) => void;
  error: (event: string, fields?: Record<string, unknown>) => void;
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(level?: string): Logger {
  const raw = (level ?? process.env.LOG_LEVEL ?? 'info') as LogLevel;
  const min = ORDER[raw] ?? ORDER.info;
  const emit =
    (lv: LogLevel) =>
    (event: string, fields: Record<string, unknown> = {}): void => {
      if (ORDER[lv] < min) return;
      console.error(JSON.stringify({ ts: new Date().toISOString(), level: lv, event, ...fields }));
    };
  return { debug: emit('debug'), info: emit('info'), warn: emit('warn'), error: emit('error') };
}

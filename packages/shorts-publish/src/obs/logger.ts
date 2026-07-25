/**
 * 구조화 로깅 — 모든 로그는 stderr 로 JSON 1줄.
 * (stdout 은 CLI 의 데이터(JSON) 출력 전용으로 깨끗하게 유지)
 * 원자끼리 import 금지 규칙 때문에 keyword-intel/ad-video-gen 의 logger 패턴을 복제한다.
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

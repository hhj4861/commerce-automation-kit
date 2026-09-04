export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(level?: string): {
  info: (event: string, fields?: Record<string, unknown>) => void;
  warn: (event: string, fields?: Record<string, unknown>) => void;
  error: (event: string, fields?: Record<string, unknown>) => void;
} {
  const raw = (level ?? process.env.LOG_LEVEL ?? 'info') as LogLevel;
  const min = ORDER[raw] ?? ORDER.info;
  const emit =
    (logLevel: LogLevel) =>
    (event: string, fields: Record<string, unknown> = {}): void => {
      if (ORDER[logLevel] < min) return;
      console.error(JSON.stringify({ ts: new Date().toISOString(), level: logLevel, event, ...fields }));
    };
  return { info: emit('info'), warn: emit('warn'), error: emit('error') };
}

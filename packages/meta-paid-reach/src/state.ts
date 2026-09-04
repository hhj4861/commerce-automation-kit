import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { MetaPaidReachState } from '@cak/contracts';
import { configSchema, ConfigError } from './config.js';

export function loadState(path: string): MetaPaidReachState {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    throw new ConfigError(`상태 파일을 읽을 수 없음: ${error instanceof Error ? error.message : String(error)}`);
  }
  const state = raw as Partial<MetaPaidReachState>;
  if (state.schemaVersion !== 1) throw new ConfigError('지원하지 않는 상태 파일 schemaVersion');
  if (typeof state.apiVersion !== 'string' || typeof state.adAccountId !== 'string') {
    throw new ConfigError('상태 파일의 API 버전/광고계정 ID가 유효하지 않음');
  }
  const config = configSchema.safeParse(state.config);
  if (!config.success) throw new ConfigError('상태 파일의 config가 유효하지 않음');
  if (state.ids === undefined || typeof state.ids !== 'object') {
    throw new ConfigError('상태 파일의 ids가 유효하지 않음');
  }
  return { ...state, config: config.data } as MetaPaidReachState;
}

export function saveState(path: string, state: MetaPaidReachState): void {
  const temp = `${path}.tmp`;
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, path);
}

export function assertNewStatePath(path: string): void {
  if (existsSync(path)) {
    throw new ConfigError(`기존 상태 파일을 덮어쓰지 않음: ${path}`);
  }
}

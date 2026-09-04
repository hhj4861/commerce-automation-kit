import { isAbsolute, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { ParseArgsConfig } from 'node:util';
import type { MetaPaidReachState } from '@cak/contracts';
import {
  assertCreateReady,
  assertLiveSafety,
  ConfigError,
  loadConfig,
  normalizeAdAccountId,
  normalizeApiVersion,
} from '../config.js';
import { createLogger } from '../logger.js';
import { MetaApiError, MetaClient } from '../meta-client.js';
import {
  checkAndPause,
  createPaused,
  initialState,
  pauseAll,
  runGuarded,
} from '../orchestrator.js';
import { buildDryRunPlan } from '../plan.js';
import { assertNewStatePath, loadState, saveState } from '../state.js';

const log = createLogger();
const STR = { type: 'string' } as const;
const BOOL = { type: 'boolean' } as const;
type Opts = Record<string, string | boolean | string[] | undefined>;

class UsageError extends Error {}

function parse(rest: string[], options: ParseArgsConfig['options']): Opts {
  const { values } = parseArgs({ args: rest, options, allowPositionals: false });
  return values as Opts;
}

function reqStr(options: Opts, key: string): string {
  const value = options[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new UsageError(`--${key} 필수`);
  }
  return value.trim();
}

function optStr(options: Opts, key: string): string | undefined {
  const value = options[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function flag(options: Opts, key: string): boolean {
  return options[key] === true;
}

function intOption(options: Opts, key: string, fallback: number): number {
  const raw = optStr(options, key);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new UsageError(`--${key}는 양의 정수여야 함`);
  }
  return value;
}

function pathFromCaller(value: string): string {
  if (isAbsolute(value)) return value;
  return resolve(process.env.INIT_CWD ?? process.cwd(), value);
}

function out(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function accessToken(): string {
  const value = process.env.META_ACCESS_TOKEN?.trim();
  if (value === undefined || value.length === 0) {
    throw new UsageError('META_ACCESS_TOKEN 환경변수 필요');
  }
  return value;
}

function accountId(option?: string): string {
  const value = option ?? process.env.META_AD_ACCOUNT_ID;
  if (value === undefined || value.trim().length === 0) {
    throw new UsageError('--account-id 또는 META_AD_ACCOUNT_ID 필요');
  }
  return normalizeAdAccountId(value);
}

function client(adAccountId: string, apiVersion: string): MetaClient {
  const options = {
    accessToken: accessToken(),
    adAccountId,
    apiVersion,
  };
  const appSecret = process.env.META_APP_SECRET;
  return new MetaClient(appSecret === undefined ? options : { ...options, appSecret });
}

function persistTo(path: string): (state: MetaPaidReachState) => void {
  return (state) => saveState(path, state);
}

function requireConfirmation(options: Opts, expected: string): void {
  if (!flag(options, 'execute') || optStr(options, 'confirm') !== expected) {
    throw new UsageError(`실행에는 --execute --confirm ${expected} 필요`);
  }
  if (flag(options, 'dry-run')) {
    throw new UsageError('--dry-run과 --execute는 함께 사용할 수 없음');
  }
}

async function preflight(rest: string[]): Promise<void> {
  const options = parse(rest, { 'account-id': STR });
  const adAccountId = accountId(optStr(options, 'account-id'));
  const apiVersion = normalizeApiVersion(process.env.META_GRAPH_API_VERSION);
  const result = await client(adAccountId, apiVersion).preflight();
  out({
    ok: true,
    readOnly: true,
    apiVersion,
    adAccountId,
    account: result,
    tokenStored: false,
  });
}

async function plan(rest: string[]): Promise<void> {
  const options = parse(rest, { config: STR, 'account-id': STR });
  const configPath = pathFromCaller(reqStr(options, 'config'));
  const config = loadConfig(configPath);
  const adAccountId = accountId(optStr(options, 'account-id'));
  const apiVersion = normalizeApiVersion(process.env.META_GRAPH_API_VERSION);
  out(buildDryRunPlan(config, adAccountId, apiVersion));
}

async function create(rest: string[]): Promise<void> {
  const options = parse(rest, {
    config: STR,
    state: STR,
    'account-id': STR,
    execute: BOOL,
    confirm: STR,
    'dry-run': BOOL,
  });
  const configPath = pathFromCaller(reqStr(options, 'config'));
  const config = loadConfig(configPath);
  const adAccountId = accountId(optStr(options, 'account-id'));
  const apiVersion = normalizeApiVersion(process.env.META_GRAPH_API_VERSION);

  if (!flag(options, 'execute')) {
    out(buildDryRunPlan(config, adAccountId, apiVersion));
    return;
  }

  requireConfirmation(options, 'CREATE_PAUSED');
  assertCreateReady(config);
  const statePath = pathFromCaller(reqStr(options, 'state'));
  assertNewStatePath(statePath);
  const state = initialState(config, adAccountId, apiVersion);
  const persist = persistTo(statePath);
  persist(state);
  try {
    await createPaused(client(adAccountId, apiVersion), state, persist);
  } catch (error) {
    state.failures = [
      ...(state.failures ?? []),
      `PAUSED 구조 생성 실패: ${error instanceof Error ? error.message : String(error)}`,
    ];
    persist(state);
    throw error;
  }
  out({
    ok: true,
    spendsMoney: false,
    allObjectsPaused: true,
    statePath,
    ids: state.ids,
    next: 'Ads Manager에서 소재/타깃/예산을 재검수한 뒤에만 run 실행',
  });
}

async function status(rest: string[]): Promise<void> {
  const options = parse(rest, { state: STR });
  const statePath = pathFromCaller(reqStr(options, 'state'));
  const state = loadState(statePath);
  const result = await checkAndPause(
    client(state.adAccountId, state.apiVersion),
    state,
    persistTo(statePath),
    false,
  );
  out({ ok: true, readOnly: true, ...result });
}

async function check(rest: string[]): Promise<void> {
  const options = parse(rest, {
    state: STR,
    execute: BOOL,
    confirm: STR,
    'dry-run': BOOL,
  });
  const statePath = pathFromCaller(reqStr(options, 'state'));
  const state = loadState(statePath);
  const executePause = flag(options, 'execute');
  if (executePause) requireConfirmation(options, 'PAUSE_AT_LIMIT');
  const result = await checkAndPause(
    client(state.adAccountId, state.apiVersion),
    state,
    persistTo(statePath),
    executePause,
  );
  out({ ok: true, executePause, ...result });
}

async function pause(rest: string[]): Promise<void> {
  const options = parse(rest, { state: STR, execute: BOOL, confirm: STR });
  requireConfirmation(options, 'PAUSE_NOW');
  const statePath = pathFromCaller(reqStr(options, 'state'));
  const state = loadState(statePath);
  const result = await pauseAll(
    client(state.adAccountId, state.apiVersion),
    state,
    'manual',
    persistTo(statePath),
  );
  out({
    ok: result.ok,
    deliveryStopped: result.deliveryStopped,
    statePath,
    pauseReason: state.pauseReason,
    failures: result.failures,
  });
}

async function run(rest: string[]): Promise<void> {
  const options = parse(rest, {
    state: STR,
    execute: BOOL,
    confirm: STR,
    'dry-run': BOOL,
    'interval-seconds': STR,
    'max-checks': STR,
  });
  const statePath = pathFromCaller(reqStr(options, 'state'));
  const state = loadState(statePath);
  if (state.pausedAt !== undefined) {
    throw new UsageError('이미 PAUSE 완료된 상태 파일은 재활성화하지 않음. 새 상태 파일을 사용하세요.');
  }
  const intervalSeconds = intOption(options, 'interval-seconds', 60);
  const maxChecks = intOption(options, 'max-checks', 1_440);
  if (intervalSeconds < 30) throw new UsageError('--interval-seconds는 최소 30');

  if (!flag(options, 'execute')) {
    out({
      dryRun: true,
      spendsMoney: false,
      action: '광고/광고세트/캠페인을 순서대로 ACTIVE 후 목표/지출상한까지 모니터',
      intervalSeconds,
      maxChecks,
      targetImpressions: state.config.limits.targetImpressions,
      pauseAtSpendAccountCurrency: state.config.budget.pauseAtSpendAccountCurrency,
      lifetimeBudgetMinorUnits: state.config.budget.lifetimeBudgetMinorUnits,
      requiredConfirmation: 'LIVE_SPEND',
    });
    return;
  }

  requireConfirmation(options, 'LIVE_SPEND');
  assertCreateReady(state.config);
  assertLiveSafety(state.config);
  const api = client(state.adAccountId, state.apiVersion);
  const persist = persistTo(statePath);
  let stopping = false;
  const emergencyPause = async (signal: NodeJS.Signals): Promise<void> => {
    if (stopping) return;
    stopping = true;
    log.warn('signal_pause', { signal });
    try {
      await pauseAll(api, state, 'manual', persist);
    } finally {
      process.exit(signal === 'SIGINT' ? 130 : 143);
    }
  };
  const onSigint = (): void => void emergencyPause('SIGINT');
  const onSigterm = (): void => void emergencyPause('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  try {
    const result = await runGuarded(api, state, persist, {
      intervalMs: intervalSeconds * 1_000,
      maxChecks,
    });
    out({ ok: true, statePath, ...result });
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'preflight':
      await preflight(rest);
      break;
    case 'plan':
      await plan(rest);
      break;
    case 'create':
      await create(rest);
      break;
    case 'status':
      await status(rest);
      break;
    case 'check':
      await check(rest);
      break;
    case 'run':
      await run(rest);
      break;
    case 'pause':
      await pause(rest);
      break;
    default:
      throw new UsageError('명령: preflight | plan | create | status | check | run | pause');
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof UsageError || error instanceof ConfigError) {
    out({ ok: false, problems: [message] });
    process.exit(1);
  }
  if (error instanceof MetaApiError) {
    out({
      ok: false,
      problems: [message],
      meta: {
        status: error.status,
        code: error.code,
        subcode: error.subcode,
        traceId: error.traceId,
        transient: error.transient,
      },
    });
    process.exit(error.transient ? 75 : 1);
  }
  log.error('cli_error', { message });
  out({ ok: false, problems: [message] });
  process.exit(1);
});

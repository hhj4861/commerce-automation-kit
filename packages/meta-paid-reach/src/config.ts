import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { MetaPaidReachConfig } from '@cak/contracts';
import { z } from 'zod';

const httpsUrl = z.string().url().refine((value) => value.startsWith('https://'), {
  message: 'HTTPS URL만 허용',
});

const sourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('local-file'), value: z.string().min(1) }),
  z.object({ kind: z.literal('hosted-url'), value: httpsUrl }),
  z.object({ kind: z.literal('meta-video-id'), value: z.string().min(1) }),
]);

export const configSchema = z
  .object({
    name: z.string().min(1).max(120),
    creative: z.object({
      source: sourceSchema,
      pageId: z.string().min(1),
      instagramActorId: z.string().min(1).optional(),
      landingPageUrl: httpsUrl,
      message: z.string().min(1).max(2_200),
      headline: z.string().min(1).max(255).optional(),
      thumbnailUrl: httpsUrl.optional(),
      callToAction: z.enum(['LEARN_MORE', 'SHOP_NOW']).default('LEARN_MORE'),
    }),
    targeting: z.object({
      countries: z
        .array(z.string().regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2 대문자 국가코드 필요'))
        .min(1)
        .max(25),
      ageMin: z.number().int().min(18).max(65),
      ageMax: z.number().int().min(18).max(65),
      publisherPlatforms: z.array(z.enum(['facebook', 'instagram'])).min(1).optional(),
    }),
    budget: z.object({
      lifetimeBudgetMinorUnits: z.number().int().positive(),
      pauseAtSpendAccountCurrency: z.number().positive(),
      startTime: z.string().datetime({ offset: true }),
      endTime: z.string().datetime({ offset: true }),
    }),
    limits: z.object({
      targetImpressions: z.number().int().min(1_000).default(1_000),
    }),
    specialAdCategories: z.array(z.string().min(1)).default([]),
    compliance: z.object({
      creativeRightsConfirmed: z.boolean(),
      humanApproved: z.boolean(),
      approvedBy: z.string().min(1).optional(),
      approvedAt: z.string().datetime({ offset: true }).optional(),
      notes: z.string().optional(),
    }),
  })
  .superRefine((config, ctx) => {
    if (config.targeting.ageMax < config.targeting.ageMin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targeting', 'ageMax'],
        message: 'ageMax는 ageMin 이상이어야 함',
      });
    }
    if (Date.parse(config.budget.endTime) <= Date.parse(config.budget.startTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['budget', 'endTime'],
        message: 'endTime은 startTime보다 뒤여야 함',
      });
    }
    if (
      config.targeting.publisherPlatforms?.includes('instagram') === true &&
      config.creative.instagramActorId === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['creative', 'instagramActorId'],
        message: 'instagram placement에는 instagramActorId가 필요',
      });
    }
  });

export class ConfigError extends Error {}

export function loadConfig(path: string): MetaPaidReachConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    throw new ConfigError(`설정 JSON을 읽을 수 없음: ${error instanceof Error ? error.message : String(error)}`);
  }

  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new ConfigError(`설정이 유효하지 않음: ${problems.join('; ')}`);
  }

  const config = parsed.data as MetaPaidReachConfig;
  if (config.creative.source.kind === 'local-file') {
    const value = config.creative.source.value;
    config.creative.source.value = isAbsolute(value) ? value : resolve(dirname(path), value);
  }
  return config;
}

export function assertCreateReady(config: MetaPaidReachConfig): void {
  const problems: string[] = [];
  if (!config.compliance.creativeRightsConfirmed) problems.push('소재 사용권 확인 필요');
  if (!config.compliance.humanApproved) problems.push('광고 문안/표현 사람 승인 필요');
  if (config.compliance.approvedBy === undefined) problems.push('compliance.approvedBy 필요');
  if (config.compliance.approvedAt === undefined) problems.push('compliance.approvedAt 필요');
  if (config.creative.source.kind === 'local-file' && !existsSync(config.creative.source.value)) {
    problems.push(`로컬 영상 파일 없음: ${config.creative.source.value}`);
  }
  if (problems.length > 0) throw new ConfigError(problems.join('; '));
}

export interface LiveSafety {
  hardSpendCapMinorUnits: number;
}

export function assertLiveSafety(
  config: MetaPaidReachConfig,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): LiveSafety {
  const problems: string[] = [];
  if (env.META_POC_ALLOW_LIVE_SPEND !== 'I_UNDERSTAND') {
    problems.push('META_POC_ALLOW_LIVE_SPEND=I_UNDERSTAND 필요');
  }
  const hardCap = Number(env.META_POC_HARD_SPEND_CAP_MINOR);
  if (!Number.isSafeInteger(hardCap) || hardCap <= 0) {
    problems.push('META_POC_HARD_SPEND_CAP_MINOR 양의 정수 필요');
  } else if (config.budget.lifetimeBudgetMinorUnits > hardCap) {
    problems.push(
      `lifetimeBudgetMinorUnits(${config.budget.lifetimeBudgetMinorUnits})가 하드 상한(${hardCap}) 초과`,
    );
  }
  if (Date.parse(config.budget.endTime) <= now) problems.push('budget.endTime이 이미 지남');
  if (!config.compliance.humanApproved) problems.push('사람 승인 없는 광고는 활성화 불가');
  if (problems.length > 0) throw new ConfigError(problems.join('; '));
  return { hardSpendCapMinorUnits: hardCap };
}

export function normalizeApiVersion(value: string | undefined): string {
  const version = value?.trim() || 'v26.0';
  if (!/^v\d+\.\d+$/.test(version)) throw new ConfigError(`META_GRAPH_API_VERSION 형식 오류: ${version}`);
  return version;
}

export function normalizeAdAccountId(value: string): string {
  const id = value.trim().replace(/^act_/, '');
  if (!/^\d+$/.test(id)) throw new ConfigError('광고 계정 ID는 숫자 또는 act_숫자 형식이어야 함');
  return id;
}

# drama-series 연결 우선 파이프라인 — 1단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 컷과 컷, 회차와 회차(1화 마지막 → 2화 첫 컷)가 배경·문맥으로 이어지는 영상을 크레딧 낭비 없이 만들도록, shot-v1 회차에 결정적 관문·키프레임 승인·컷 판정 기반 실행 경계·출시(조립) 관문·토큰 교차 리뷰를 코드로 강제한다. 정책 없는 기존 회차(1화)는 동작이 바뀌지 않는다.

**Architecture:** 계약에 선택 필드·새 타입만 추가한다. "앞 장면"은 `previousCutOf` 한 곳에서만 구한다. 지문은 세 가지 — 내용 지문(`fingerprintOf`), 검토 문맥 지문(`gateFingerprint`: v1 은 앞 회차 연결 컷·장르 팩 포함), 실행 지문(`planHash`). 상태 파일은 원자적 쓰기 + 잠금 + revision 으로 보호한다. 순수 로직은 `src/core`, ffmpeg·파일 IO 는 `src/adapters`, CLI 는 연결만.

**Tech Stack:** TypeScript(ESM, exactOptionalPropertyTypes), zod 3, vitest 2, tsx, ffmpeg/ffprobe.

**Spec:** `docs/superpowers/specs/2026-10-08-drama-keyframe-pipeline-design.md` (r7, 8540a28) — 요구 목록 `docs/superpowers/specs/2026-10-08-drama-pipeline-requirements.md`. 이전 13-Task 계획은 `2026-10-08-drama-keyframe-pipeline-v0-superseded.md`(참고용, 실행 금지).

**범위(사용자 결정 2026-10-08):** 1단계 = 연결·키프레임·컷 판정·실행 경계·지문 3종·파일 대조·상태 보호·조립 관문·세계관 규칙·비어휘 발화·재생성 상한·비용 기록·교차 리뷰(토큰, 작성자 검증). **2단계(이 계획 밖)** = 1080p 확정, 목소리 참조, Ed25519 서명·GCP 키, 배경음악 인계, 업로드 manifest. 목소리는 1단계에서 파일럿·회차 미리보기의 사람 확인 항목으로만 다룬다.

## Global Constraints

- 계약 append-only: 기존 필드 삭제·의미 변경 금지, 새 필드는 `?: T | undefined`(계약 파일 머리말 관례). contracts 에 해시·IO·원자 import 금지.
- `DramaClipMedia.role` 은 `'image_references'` 만(1단계). 시작 이미지는 `DramaClipSpec.startImage`.
- legacy(`shotPolicy` 없음) 회차: validate·judge·plan·assemble 결과와 대사 검증(lineHash)·관문 지문이 변경 전과 같아야 한다. 새 규칙은 legacy 에서 info 만.
- `SHOT_V1` 잠정 품질 정책(제공자 제한 아님): 길이 review >10·block >12초, 대사 review >2·block >3줄(vocal 제외), 화면 인물 block >3, 비트 1~2개, 동작 여유 1.5초/비트(대사만 있는 비트 0.5초), 여유 부족 review <1초, 파일럿 2컷, 컷당 시도 상한 기본 3.
- 발화 속도 `MAX_SYLLABLES_PER_SEC = 2.2`, 대사 대조 `MAX_LINE_CER = 0.15` 재사용. 여분 발화 review 기준 30%. 한글 외 문자(영문·숫자)는 2글자 = 1음절로 추정.
- 생성 화면비는 shot-v1 에서 16:9 고정(쇼츠는 조립 blur-fill).
- SSIM 은 참고 수치 — 자동 pass·승인 근거 금지. 판정 응답의 `unknown` 은 pass 가 아니다.
- 사람 승인 기록은 `approvedBy`·`userQuote`(사용자 발화 원문 한 줄)·`recordedBy`(agent/session) 필수. 인증이 아니라 흔적임을 문서에 명시.
- 상태 파일(run·리뷰·보고서·키프레임 승인이 쓰는 대본)은 `writeJsonAtomic`, 동시 수정은 `withLock`, 1회성 소비는 `createExclusive`.
- "0크레딧"은 생성 크레딧만 뜻한다(whisper·JEV·세션 판정 비용과 구분).
- 원자는 힉스필드·JEV 를 호출하지 않는다(세션이 호출). 실패는 보고서로 남긴다(침묵 금지).
- 임시 산출물: Claude 는 iCloud `claude 작업/tmp/<날짜-작업>/`. `/tmp`·`/private/tmp` 금지(테스트의 `os.tmpdir()` 는 vitest 임시로 예외).
- 검증 명령(worktree 루트): `npm test -w @cak/drama-series`, `npx tsc -p packages/drama-series --noEmit`, `npx tsc -p packages/contracts --noEmit`. 파이프로 exit code 를 가리지 않는다.

## Review Focus

1. 1화(legacy)를 앞 회차로 읽는 2화: 1화 마지막 컷 소품 상태·장소·출연진이 2화 첫 컷으로 이어지고, 1화 대본을 고치면 2화 관문 기록이 무효가 된다 (Task 3·4·5 테스트).
2. 같은 컷을 다시 만들거나 파일을 교체하면 그 컷 판정과 그 끝 프레임에서 시작한 뒤 컷들의 판정이 무효가 된다 (Task 11).
3. 판정 요청을 조작(질문 삭제·다른 질문의 프레임을 근거로)해도 pass 가 되지 않는다 (Task 12).
4. 판정받지 않은 파일로 바꿔 끼우면 조립이 막힌다 (Task 14).
5. 대본(또는 앞 회차)을 고친 뒤 예전 교차 리뷰 응답을 적용하면 거부되고, 같은 토큰을 두 번 소비할 수 없다 (Task 13).

---

## File Structure

| 파일 | 책임 |
|---|---|
| `packages/contracts/src/drama-series.ts` (수정) | 새 타입·선택 필드 |
| `packages/drama-series/src/core/model.ts` (수정) | zod 스키마 |
| `packages/drama-series/test/helpers/v1.ts` (신규) | shot-v1 테스트 픽스처(c4 8초 등), 2화 픽스처 |
| `src/adapters/state-io.ts` (신규) | 원자 쓰기·잠금·create-exclusive |
| `src/core/continuation.ts` (신규) | `previousCutOf`, `episodeLinkFindings`, `blockingCompatible` |
| `src/core/shot-policy.ts` (신규) | `SHOT_V1`, `isShotV1`, `speechSec`, `beatWindows`, `resolveSetup` |
| `src/core/fingerprint.ts`·`line-hash.ts` (수정) | 지문 3종, v1 문맥 대사 지문 |
| `src/core/gates/shot.ts` (신규), `continuity.ts`·`dialogue-lint.ts`·`registry.ts` (수정) | shot 관문, 연결 기준 교체 |
| `src/core/judge-gates.ts` (수정) | 세계관 규칙·충분성 질문, v1 필수 약속 미확정 block, 앞 회차 문맥 |
| `src/core/keyframe.ts` (신규) | 키프레임 지문·요청·승인·plan 검사 |
| `src/adapters/video/seedance-2-5.ts` (수정) | `referenceMap`, v1 프롬프트 |
| `src/core/plan.ts` (수정) | v1 필수 관문, startImage, 화면비 |
| `src/adapters/frames.ts` (신규) | 프레임·마지막 프레임·SSIM·라벨 시트·무음 사본 |
| `src/core/transcript.ts` (수정) | vocal 제외, 순서·여분 발화, 클립 sha |
| `src/core/run-state.ts` (신규) | 실행 상태 v2 |
| `src/core/verdict.ts` (신규) | 컷 판정 요청·검증 |
| `src/core/review.ts` (신규) | 토큰 교차 리뷰 |
| `src/core/release.ts` (신규) | 조립 출시 관문 |
| `src/cli/index.ts` (수정) | 명령 연결 |
| `.claude/skills/drama-series/*`, `docs/PROGRESS.md` (수정) | 절차·지침 |

Task 순서는 의존 순서다: 1(계약) → 2(IO) → 3(연결) → 4(정책·지문) → 5(shot 관문) → 6(판정 질문) → 7(키프레임) → 8(프롬프트) → 9(plan) → 10(프레임·대사) → 11(실행 상태) → 12(컷 판정) → 13(리뷰) → 14(출시 관문) → 15(CLI) → 16(legacy·연결 회귀) → 17(문서·전체 검증).

---

### Task 1: 계약·스키마·v1 테스트 픽스처

**Files:**
- Modify: `packages/contracts/src/drama-series.ts`
- Modify: `packages/drama-series/src/core/model.ts`
- Create: `packages/drama-series/test/helpers/v1.ts`
- Test: `packages/drama-series/test/model-v1.test.ts`

**Interfaces:**
- Produces (계약): `DramaAgent`, `DramaSetup`, `DramaShotPolicy`, `DramaScreenSide`, `DramaBlocking`, `DramaCameraMove`, `DramaBeat`(changes 포함), `DramaWorldRule`, `DramaHumanApproval`, `DramaKeyframe`, `DramaStartImage`(3종), `DramaVerdictValue`, `DramaVerdictItem`, `DramaClipVerdict`, `DramaRunAttempt`, `DramaRunCut`, `DramaRunApproval`, `DramaRunState`, `DramaReviewRequest`, `DramaReviewResponse`; `DramaLineKind` 에 `'vocal'`; 선택 필드(아래 Step 4).
- Produces (테스트 헬퍼): `fx(name)`, `v1Raw(mutate?)`, `v1Ctx(mutate?)`, `legacyCtx(mutate?)`, `ep2(mutate?)`.

- [ ] **Step 1: 테스트 헬퍼 작성**

```ts
// packages/drama-series/test/helpers/v1.ts
import { readFileSync } from 'node:fs';
import { parseEpisode, parseSeries } from '../../src/core/model.js';
import { loadGenre } from '../../src/core/genre.js';
import type { GateContext } from '../../src/core/gates/types.js';

export const fx = (n: string): any => JSON.parse(readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));

/**
 * fixture 를 shot-v1 로 올린다(규칙을 만족하는 기본값):
 * - 장소마다 구도 'front' 1개(장소 소품 전부를 그림에 선언), 컷마다 setupId
 * - 출연진 전원 blocking(1명이어도), 비트 1개(모든 대사 배정)
 * - c4(6초·12음절)는 발화+동작 6.95초로 shot 관문에 걸리므로 8초로 올린다
 * mutate 로 위반 사례를 만든다.
 */
export function v1Raw(mutate?: (s: any, e: any) => void): { s: any; e: any } {
  const s = fx('series.json');
  const e = fx('episode.json');
  for (const l of s.locations) l.setups = [{ id: 'front', name: `${l.name} 정면`, cameraEn: `static eye-level medium-wide shot of ${l.id}`, refAssetId: `set-${l.id}`, visiblePropIds: [...l.props] }];
  e.shotPolicy = { version: 'shot-v1', strict: true };
  e.authoredBy = 'claude';
  for (const c of e.cuts) {
    c.setupId = 'front';
    c.blocking = c.cast.map((m: any, i: number) => ({ characterId: m.characterId, side: i === 0 ? 'left' : i === 1 ? 'right' : 'center' }));
    c.beats = [{ en: 'The scene plays out.', lines: c.lines.map((_: any, i: number) => i) }];
    c.usedPropIds = [];
    if (c.id === 'c4' && c.durationSec < 8) c.durationSec = 8;
  }
  mutate?.(s, e);
  return { s, e };
}

export function v1Ctx(mutate?: (s: any, e: any) => void): GateContext {
  const { s, e } = v1Raw(mutate);
  return { series: parseSeries(s), episode: parseEpisode(e), genre: loadGenre(s.genreId) };
}

export function legacyCtx(mutate?: (s: any, e: any) => void): GateContext {
  const s = fx('series.json');
  const e = fx('episode.json');
  mutate?.(s, e);
  return { series: parseSeries(s), episode: parseEpisode(e), genre: loadGenre(s.genreId) };
}

/** 1화 = legacy fixture(마지막 컷 c4), 2화 = v1 1컷짜리로 1화 c4 에서 바로 이어진다. mutate(e2, e1, s) */
export function ep2(mutate?: (e2: any, e1: any, s: any) => void): GateContext {
  const { s, e } = v1Raw();
  const e1 = fx('episode.json');
  const last = e1.cuts.at(-1);
  const c4v1 = e.cuts.find((c: any) => c.id === last.id);
  const e2 = {
    ...e,
    no: 2,
    title: '2화',
    continuesFromEpisode: { no: 1, cutId: last.id },
    cuts: [{ ...structuredClone(c4v1), id: 'c1', continuesFromPrev: true, propState: { ...(last.propState ?? {}) }, action: '1화 마지막 장면에서 바로 이어진다.', lines: [], beats: [{ en: 'They hold still, breathing.' }] }],
  };
  mutate?.(e2, e1, s);
  return { series: parseSeries(s), episode: parseEpisode(e2), genre: loadGenre(s.genreId), prev: { episode: parseEpisode(e1) } };
}
```

(`ep2` 의 `prev` 는 Task 3 에서 `GateContext` 에 추가된다 — Task 1 에서는 타입 오류가 나지 않도록 `GateContext` 에 `prev?: { episode: DramaEpisode } | undefined` 를 이 Task 에서 먼저 추가한다: `src/core/gates/types.ts`.)

- [ ] **Step 2: 실패 테스트**

```ts
// packages/drama-series/test/model-v1.test.ts
import { describe, expect, it } from 'vitest';
import { parseEpisode, parseSeries } from '../src/core/model.js';
import { fx, v1Raw } from './helpers/v1.js';

describe('shot-v1 model', () => {
  it('keeps legacy fixtures valid with new fields undefined', () => {
    const e = parseEpisode(fx('episode.json'));
    expect(e.shotPolicy).toBeUndefined();
    expect(e.cuts[0]!.setupId).toBeUndefined();
  });
  it('accepts all phase-1 fields', () => {
    const { s, e } = v1Raw((s, e) => {
      s.worldRules = [{ id: 'headshot', ruleKo: '좀비는 머리를 베야 죽는다', ruleEn: 'Zombies die only when the head is destroyed; body blows never drop them.' }];
      s.characters[1].looks[0].outfitRefAssetId = 'o1';
      e.no = 2;
      e.continuesFromEpisode = { no: 1, cutId: 'c4' };
      e.cuts[1].cast[0].carriesPropIds = ['박스'];
      e.cuts[1].beats = [{ en: 'He grabs the collar.', lines: [0], changes: { '빈 박스 더미': '무너짐' } }, { en: 'Minjae pleads.', sec: 4, lines: [1] }];
      e.cuts[1].continuesFromPrev = true;
      e.cuts[1].keyframe = { assetId: 'k1', fileSha256: 'f'.repeat(64), digest: 'kf-v1:d', approvedBy: 'user', userQuote: '좋아', recordedBy: 'claude/s1', at: 'now' };
      e.cuts[1].lines.push({ speaker: 'minjae', text: '아악!', kind: 'vocal' });
    });
    const series = parseSeries(s);
    const ep = parseEpisode(e);
    expect(series.worldRules![0]!.id).toBe('headshot');
    expect(ep.continuesFromEpisode).toEqual({ no: 1, cutId: 'c4' });
    expect(ep.cuts[1]!.beats![0]!.changes).toEqual({ '빈 박스 더미': '무너짐' });
    expect(ep.cuts[1]!.lines.at(-1)!.kind).toBe('vocal');
    expect(ep.cuts[1]!.keyframe!.userQuote).toBe('좋아');
  });
  it('rejects unknown policy, screen side, and startsFresh together with continuesFromEpisode', () => {
    expect(() => parseEpisode({ ...fx('episode.json'), shotPolicy: { version: 'shot-v9', strict: true } })).toThrow(/shotPolicy/);
    expect(() => parseEpisode(v1Raw((_, e) => { e.cuts[1].blocking = [{ characterId: 'changsik', side: 'top' }]; }).e)).toThrow(/blocking/);
    expect(() => parseEpisode(v1Raw((_, e) => { e.no = 2; e.startsFresh = true; e.continuesFromEpisode = { no: 1, cutId: 'c4' }; }).e)).toThrow(/startsFresh/);
  });
});
```

- [ ] **Step 3: Run** `npm test -w @cak/drama-series -- model-v1` → FAIL(새 필드가 zod 에서 제거됨).

- [ ] **Step 4: 계약** — `drama-series.ts` 끝에 append, 기존 interface 에는 필드만 추가:

```ts
// --- 2026-10-08 shot-v1 1단계 (append-only) ---
export type DramaAgent = 'claude' | 'codex';
export interface DramaSetup { id: string; name: string; cameraEn: string; refAssetId?: string | undefined; visiblePropIds: string[] }
export interface DramaShotPolicy { version: 'shot-v1'; strict: true }
export type DramaScreenSide = 'left' | 'center' | 'right';
export interface DramaBlocking { characterId: string; side: DramaScreenSide; depth?: 'front' | 'mid' | 'back' | undefined }
export type DramaCameraMove = 'static' | 'push-in' | 'pull-out' | 'pan' | 'follow';
/** 시간 순 행동 단위. lines = 이 비트의 대사 인덱스, changes = 이 비트에서 바뀌는 소품 상태 */
export interface DramaBeat { en: string; sec?: number | undefined; lines?: number[] | undefined; changes?: Record<string, string> | undefined; /** 대사만 있고 행동이 없는 비트(동작 여유 0.5초) */ talkOnly?: boolean | undefined }
export interface DramaWorldRule { id: string; ruleKo: string; ruleEn: string }
/** 사람 승인 흔적. 인증이 아니다 */
export interface DramaHumanApproval { approvedBy: string; userQuote: string; recordedBy: string; at: string }
export interface DramaKeyframe extends DramaHumanApproval { assetId: string; fileSha256: string; digest: string }
export type DramaStartImage =
  | { source: 'keyframe'; assetId: string }
  | { source: 'prev-clip'; fromCut: string }
  | { source: 'prev-episode-clip'; episodeNo: number; cutId: string };
export type DramaVerdictValue = 'pass' | 'fail' | 'unknown';
export interface DramaVerdictItem { id: string; verdict: DramaVerdictValue; evidenceFrameIds: string[]; note?: string | undefined }
export interface DramaClipVerdict { status: DramaVerdictValue; requestId: string; judge: string; at: string; items: DramaVerdictItem[] }
export interface DramaRunAttempt {
  jobId: string;
  submittedAt: string;
  completedAt?: string | undefined;
  fileSha256?: string | undefined;
  /** get_cost 실측 크레딧. 모르면 null */
  credits: number | null;
  verdict?: DramaClipVerdict | undefined;
  /** 파일럿·예외 사람 승인. fileSha256 에 묶인다 */
  approval?: (DramaHumanApproval & { fileSha256: string; override: boolean; note?: string | undefined }) | undefined;
  invalidated?: { at: string; reason: string } | undefined;
}
export interface DramaRunCut { cutId: string; attempts: DramaRunAttempt[] }
export interface DramaRunApproval extends DramaHumanApproval { kind: 'cost' | 'preview' | 'retry' | 'promise-exception'; scope: string; limitCredits?: number | undefined }
export interface DramaRunState {
  version: 'run-v2';
  planHash: string;
  contextFingerprint: string;
  episodeNo: number;
  owner: { agent: DramaAgent; session: string; since: string };
  revision: number;
  mediaDir: string;
  maxAttemptsPerCut: number;
  cuts: DramaRunCut[];
  approvals: DramaRunApproval[];
  handoffs: { from: string; to: string; at: string; note: string }[];
}
export interface DramaReviewRequest {
  token: string;
  kind: 'scenario';
  seriesPath: string;
  episodePath: string;
  prevEpisodePath?: string | undefined;
  contextFingerprint: string;
  author: DramaAgent;
  reviewer: DramaAgent;
  createdAt: string;
  expiresAt: string;
  summary: string;
}
export interface DramaReviewResponse {
  token: string;
  reviewedContextFingerprint: string;
  verdict: 'pass' | 'changes';
  findings: string[];
  reviewer: DramaAgent;
  session: string;
  respondedAt: string;
}
```

기존 interface 필드 추가:
```ts
export type DramaLineKind = 'dialogue' | 'monologue' | 'vocal'; // (2026-10-08) vocal = 비명·신음 등 비어휘 발화
// DramaCharacterLook
  outfitRefAssetId?: string | undefined;
// DramaLocation
  setups?: DramaSetup[] | undefined;
// DramaCutCast
  carriesPropIds?: string[] | undefined;
// DramaCut
  setupId?: string | undefined;
  blocking?: DramaBlocking[] | undefined;
  blockingChange?: 'move' | 'reverse' | undefined;
  cameraMove?: DramaCameraMove | undefined;
  beats?: DramaBeat[] | undefined;
  usedPropIds?: string[] | undefined;
  continuesFromPrev?: boolean | undefined;
  keyframe?: DramaKeyframe | undefined;
// DramaSeries
  worldRules?: DramaWorldRule[] | undefined;
// DramaEpisode
  shotPolicy?: DramaShotPolicy | undefined;
  authoredBy?: DramaAgent | undefined;
  continuesFromEpisode?: { no: number; cutId: string } | undefined;
  startsFresh?: true | undefined;
// DramaClipSpec
  startImage?: DramaStartImage | undefined;
  keyframeAssetId?: string | undefined;
```

- [ ] **Step 5: zod** (`model.ts`)

```ts
const line = z.object({ speaker: ID, text: z.string().trim().min(1).max(200), kind: z.enum(['dialogue', 'monologue', 'vocal']), verification: verification.default({ status: 'unverified' }) });
const look = z.object({ id: ID, description: z.string().min(3), refAssetId: z.string().min(1).optional(), outfitRefAssetId: z.string().min(1).optional() });
const setup = z.object({ id: ID, name: z.string().min(1), cameraEn: z.string().min(10), refAssetId: z.string().min(1).optional(), visiblePropIds: z.array(z.string().min(1)) });
const location = z.object({ id: ID, name: z.string().min(1), anchorText: z.string().min(20), props: z.array(z.string().min(1)), refAssetId: z.string().min(1).optional(), setups: z.array(setup).optional() });
const keyframe = z.object({ assetId: z.string().min(1), fileSha256: z.string().regex(/^[0-9a-f]{64}$/), digest: z.string().min(1), approvedBy: z.string().min(1), userQuote: z.string().min(1), recordedBy: z.string().min(1), at: z.string().min(1) });
const beat = z.object({ en: z.string().min(3), sec: z.number().positive().optional(), lines: z.array(z.number().int().min(0)).optional(), changes: z.record(z.string().min(1), z.string().min(1)).optional(), talkOnly: z.boolean().optional() });
const cut = z.object({
  id: ID, locationId: ID, durationSec: z.number().int().min(1).max(60),
  cast: z.array(z.object({ characterId: ID, lookId: ID, carriesPropIds: z.array(z.string().min(1)).optional() })),
  action: z.string().min(3), visualEn: z.string().min(10), sfx: z.string().optional(), caption: z.string().max(60).optional(),
  propState: z.record(z.string().min(1), z.string().min(1)).optional(),
  transitionIn: z.enum(['cut', 'flash', 'fade-black']).optional(),
  lines: z.array(line).default([]),
  setupId: ID.optional(),
  blocking: z.array(z.object({ characterId: ID, side: z.enum(['left', 'center', 'right']), depth: z.enum(['front', 'mid', 'back']).optional() })).optional(),
  blockingChange: z.enum(['move', 'reverse']).optional(),
  cameraMove: z.enum(['static', 'push-in', 'pull-out', 'pan', 'follow']).optional(),
  beats: z.array(beat).optional(),
  usedPropIds: z.array(z.string().min(1)).optional(),
  continuesFromPrev: z.boolean().optional(),
  keyframe: keyframe.optional(),
});
// seriesSchema 에 추가
  worldRules: z.array(z.object({ id: ID, ruleKo: z.string().min(3), ruleEn: z.string().min(10) })).optional(),
// episodeSchema
export const episodeSchema = z
  .object({
    seriesId: ID, no: z.number().int().min(1), title: z.string().min(1), cuts: z.array(cut).min(1),
    shotPolicy: z.object({ version: z.literal('shot-v1'), strict: z.literal(true) }).optional(),
    authoredBy: z.enum(['claude', 'codex']).optional(),
    continuesFromEpisode: z.object({ no: z.number().int().min(1), cutId: ID }).optional(),
    startsFresh: z.literal(true).optional(),
  })
  .refine((e) => !(e.startsFresh && e.continuesFromEpisode), { message: 'startsFresh 와 continuesFromEpisode 는 함께 쓸 수 없음', path: ['startsFresh'] });
```

`kind === 'dialogue'` 로 거르는 기존 코드(transcript·sayLine·dialogue judge)는 vocal 을 자동 제외한다 — legacy 영향 없음. `episodeSchema.shape` 를 쓰는 곳이 있으면(검색) refine 전 객체를 `episodeObject` 로 export 해 그쪽을 쓰게 한다.

- [ ] **Step 6: Run** 전체 테스트 + tsc(contracts, drama-series) → PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src/drama-series.ts packages/drama-series/src/core/model.ts packages/drama-series/src/core/gates/types.ts packages/drama-series/test/helpers/v1.ts packages/drama-series/test/model-v1.test.ts
git commit -m "feat(contracts,drama-series): shot-v1 phase-1 contract and v1 test fixtures"
```

---

### Task 2: 원자적 상태 IO

**Files:**
- Create: `packages/drama-series/src/adapters/state-io.ts`
- Test: `packages/drama-series/test/state-io.test.ts`

**Interfaces:**
- Produces: `readJson<T>(path): T`, `writeJsonAtomic(path, value): void`, `createExclusive(path, content): boolean`, `class LockError`, `withLock<T>(target, fn, opts?: { staleMs?; retries?; waitMs? }): T`, `updateJson<T extends { revision: number }>(path, fn): T`

- [ ] **Step 1: 실패 테스트**

```ts
// packages/drama-series/test/state-io.test.ts
import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LockError, createExclusive, readJson, updateJson, withLock, writeJsonAtomic } from '../src/adapters/state-io.js';

const dir = () => mkdtempSync(join(tmpdir(), 'state-io-'));

describe('state io', () => {
  it('writes atomically without leaving temp files', () => {
    const d = dir();
    writeJsonAtomic(join(d, 'a.json'), { x: 1 });
    expect(readJson<{ x: number }>(join(d, 'a.json')).x).toBe(1);
    expect(readdirSync(d)).toEqual(['a.json']);
  });
  it('creates a file exclusively once', () => {
    const d = dir();
    expect(createExclusive(join(d, 'used', 't1'), 'x')).toBe(true);
    expect(createExclusive(join(d, 'used', 't1'), 'y')).toBe(false);
  });
  it('refuses a held lock and breaks a stale one', () => {
    const d = dir();
    const t = join(d, 'run.json');
    expect(() => withLock(t, () => withLock(t, () => 1, { retries: 0 }))).toThrow(LockError);
    expect(existsSync(`${t}.lock`)).toBe(false);
    writeFileSync(`${t}.lock`, 'old');
    const past = new Date(Date.now() - 10 * 60 * 1000);
    utimesSync(`${t}.lock`, past, past);
    expect(withLock(t, () => 2, { staleMs: 60_000, retries: 0 })).toBe(2);
  });
  it('increments revision under lock', () => {
    const d = dir();
    const p = join(d, 'run.json');
    writeJsonAtomic(p, { revision: 0, n: 1 });
    expect(updateJson<{ revision: number; n: number }>(p, (x) => ({ ...x, n: x.n + 1 }))).toEqual({ revision: 1, n: 2 });
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: 구현**

```ts
// packages/drama-series/src/adapters/state-io.ts
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';

export class LockError extends Error {}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** 같은 폴더의 고유 임시 파일에 쓰고 rename — 중단돼도 반쯤 쓴 JSON 이 남지 않는다. */
export function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  renameSync(tmp, path);
}

/** 이미 있으면 false — 토큰 소비·응답 저장처럼 1회만 허용할 때. */
export function createExclusive(path: string, content: string): boolean {
  mkdirSync(dirname(path), { recursive: true });
  try {
    const fd = openSync(path, 'wx');
    writeSync(fd, content);
    closeSync(fd);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw e;
  }
}

const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function withLock<T>(target: string, fn: () => T, opts: { staleMs?: number; retries?: number; waitMs?: number } = {}): T {
  const lock = `${target}.lock`;
  const { staleMs = 5 * 60 * 1000, retries = 20, waitMs = 100 } = opts;
  for (let i = 0; ; i++) {
    if (createExclusive(lock, `${process.pid} ${new Date().toISOString()}`)) break;
    try {
      if (Date.now() - statSync(lock).mtimeMs > staleMs) { unlinkSync(lock); continue; }
    } catch { continue; }
    if (i >= retries) throw new LockError(`잠금 사용 중: ${lock}`);
    sleep(waitMs);
  }
  try {
    return fn();
  } finally {
    try { unlinkSync(lock); } catch { /* 이미 정리됨 */ }
  }
}

export function updateJson<T extends { revision: number }>(path: string, fn: (v: T) => T): T {
  return withLock(path, () => {
    const cur = readJson<T>(path);
    const next = { ...fn(cur), revision: cur.revision + 1 };
    writeJsonAtomic(path, next);
    return next;
  });
}
```

(중첩 잠금 테스트: 안쪽 `withLock` 이 LockError 를 던지면 바깥 `finally` 가 잠금을 지우므로 `existsSync(lock)` 은 false.)

- [ ] **Step 4: Run** → PASS, 전체 + tsc.

- [ ] **Step 5: Commit** `git add packages/drama-series/src/adapters/state-io.ts packages/drama-series/test/state-io.test.ts && git commit -m "feat(drama-series): atomic state io — temp+rename, exclusive create, lock, revisioned update"`

---

### Task 3: 연결 기준 — previousCutOf·회차 연결·블로킹 호환

**Files:**
- Create: `packages/drama-series/src/core/continuation.ts`
- Modify: `packages/drama-series/src/core/join.ts`
- Test: `packages/drama-series/test/continuation.test.ts`

**Interfaces:**
- Produces: `interface PrevCut { cut: DramaCut; episodeNo: number; sameEpisode: boolean }`, `previousCutOf(ctx, index): PrevCut | undefined`, `episodeLinkFindings(ctx): DramaFinding[]`, `blockingCompatible(prev, cut): boolean`, `chainsFromV1(prev, cut): boolean`(join.ts)

- [ ] **Step 1: 실패 테스트**

```ts
// packages/drama-series/test/continuation.test.ts
import { describe, expect, it } from 'vitest';
import { blockingCompatible, episodeLinkFindings, previousCutOf } from '../src/core/continuation.js';
import { chainsFromV1 } from '../src/core/join.js';
import type { GateContext } from '../src/core/gates/types.js';
import { ep2, legacyCtx, v1Ctx } from './helpers/v1.js';

const msgs = (ctx: GateContext) => episodeLinkFindings(ctx).map((f) => `${f.severity}:${f.message}`);

describe('previousCutOf', () => {
  it('returns the previous cut in the same episode, none for a first cut without a link', () => {
    const ctx = v1Ctx();
    expect(previousCutOf(ctx, 1)).toMatchObject({ episodeNo: 1, sameEpisode: true, cut: { id: 'c1' } });
    expect(previousCutOf(ctx, 0)).toBeUndefined();
    expect(previousCutOf(legacyCtx(), 0)).toBeUndefined();
  });
  it('returns the linked previous-episode cut for the first cut', () => {
    expect(previousCutOf(ep2(), 0)).toMatchObject({ episodeNo: 1, sameEpisode: false, cut: { id: 'c4' } });
  });
});

describe('episodeLinkFindings', () => {
  it('passes a correct link to the previous episode last cut', () => {
    expect(msgs(ep2())).toEqual([]);
  });
  it('requires episode 2+ to declare a link or a fresh start', () => {
    expect(msgs(ep2((e) => { delete e.continuesFromEpisode; })).join('\n')).toMatch(/block:.*continuesFromEpisode 또는 startsFresh/);
    expect(msgs(ep2((e) => { delete e.continuesFromEpisode; e.startsFresh = true; }))).toEqual([]);
  });
  it('blocks a missing previous script, missing cut, other series; reviews a skipped episode and a non-last cut', () => {
    expect(msgs({ ...ep2(), prev: undefined }).join('\n')).toMatch(/block:앞 회차 대본/);
    expect(msgs(ep2((e) => { e.continuesFromEpisode.cutId = 'zz'; })).join('\n')).toMatch(/block:앞 회차에 컷 없음: zz/);
    expect(msgs(ep2((_, e1) => { e1.seriesId = 'other-series'; })).join('\n')).toMatch(/block:다른 시리즈/);
    expect(msgs(ep2((e) => { e.no = 3; })).join('\n')).toMatch(/review:바로 앞 회차가 아님/);
    expect(msgs(ep2((e) => { e.continuesFromEpisode.cutId = 'c1'; })).join('\n')).toMatch(/review:.*마지막 컷이 아님/);
  });
});

describe('chainsFromV1 / blockingCompatible', () => {
  it('chains only when declared, same place and set (legacy prev without set allowed), compatible blocking', () => {
    const ctx = v1Ctx((_, e) => { e.cuts[0] = { ...structuredClone(e.cuts[1]), id: 'c1' }; e.cuts[1].continuesFromPrev = true; });
    const [a, b] = ctx.episode.cuts;
    expect(blockingCompatible(a!, b!)).toBe(true);
    expect(chainsFromV1(a, b!)).toBe(true);
    expect(chainsFromV1(a, { ...b!, continuesFromPrev: false })).toBe(false);
    expect(chainsFromV1({ ...a!, setupId: undefined }, b!)).toBe(true);
    expect(chainsFromV1({ ...a!, setupId: 'other' }, b!)).toBe(false);
    const swapped = { ...b!, blocking: b!.blocking!.map((x) => ({ ...x, side: x.side === 'left' ? ('right' as const) : ('left' as const) })) };
    expect(blockingCompatible(a!, swapped)).toBe(false);
    expect(blockingCompatible(a!, { ...swapped, blockingChange: 'move' })).toBe(true);
    expect(blockingCompatible(a!, { ...b!, cast: [b!.cast[0]!] })).toBe(false);
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: 구현**

```ts
// packages/drama-series/src/core/continuation.ts
import type { DramaCut, DramaFinding } from '@cak/contracts';
import type { GateContext } from './gates/types.js';

export interface PrevCut { cut: DramaCut; episodeNo: number; sameEpisode: boolean }

/** "이 컷 바로 앞 장면"의 유일한 기준. 다른 모듈은 episode.cuts[i - 1] 에 직접 접근하지 않는다(Task 16 이 검색으로 확인). */
export function previousCutOf(ctx: GateContext, index: number): PrevCut | undefined {
  if (index > 0) {
    const cut = ctx.episode.cuts[index - 1];
    return cut ? { cut, episodeNo: ctx.episode.no, sameEpisode: true } : undefined;
  }
  if (index !== 0) return undefined;
  const link = ctx.episode.continuesFromEpisode;
  const prev = ctx.prev?.episode;
  if (!link || !prev || prev.no !== link.no || prev.seriesId !== ctx.episode.seriesId) return undefined;
  const cut = prev.cuts.find((c) => c.id === link.cutId);
  return cut ? { cut, episodeNo: link.no, sameEpisode: false } : undefined;
}

export function episodeLinkFindings(ctx: GateContext): DramaFinding[] {
  const e = ctx.episode;
  const f: DramaFinding[] = [];
  if (e.no >= 2 && !e.continuesFromEpisode && !e.startsFresh) f.push({ severity: 'block', message: `${e.no}화는 continuesFromEpisode 또는 startsFresh 중 하나를 적어야 함` });
  const link = e.continuesFromEpisode;
  if (!link) return f;
  const prev = ctx.prev?.episode;
  if (!prev || prev.no !== link.no) { f.push({ severity: 'block', message: `앞 회차 대본(${link.no}화)이 입력되지 않음 — --prev-episode` }); return f; }
  if (prev.seriesId !== e.seriesId) f.push({ severity: 'block', message: `다른 시리즈의 회차: ${prev.seriesId}` });
  if (link.no >= e.no) f.push({ severity: 'block', message: `앞 회차 번호(${link.no})가 현재 회차(${e.no})보다 앞이 아님` });
  else if (link.no !== e.no - 1) f.push({ severity: 'review', message: `바로 앞 회차가 아님(${link.no}화 → ${e.no}화) — 사유를 대본에 적고 사람 확인` });
  const cut = prev.cuts.find((c) => c.id === link.cutId);
  if (!cut) f.push({ severity: 'block', message: `앞 회차에 컷 없음: ${link.cutId}` });
  else if (prev.cuts.at(-1)!.id !== cut.id) f.push({ severity: 'review', message: `지정 컷(${cut.id})이 앞 회차 마지막 컷이 아님` });
  return f;
}

/** 같은 인물 집합이고 좌우가 같거나, 이동·리버스를 명시했으면 호환. 앞 컷에 블로킹이 없으면(legacy) 인물 집합만 본다. */
export function blockingCompatible(prev: DramaCut, cut: DramaCut): boolean {
  const ids = (c: DramaCut) => c.cast.map((m) => m.characterId).sort().join(',');
  if (ids(prev) !== ids(cut)) return !!cut.blockingChange;
  if (!prev.blocking?.length) return true;
  const side = (c: DramaCut, id: string) => c.blocking?.find((b) => b.characterId === id)?.side;
  return cut.cast.every((m) => side(prev, m.characterId) === side(cut, m.characterId)) || !!cut.blockingChange;
}
```

```ts
// join.ts 에 추가
import { blockingCompatible } from './continuation.js';
/** shot-v1: 명시 + 같은 장소 + 같은 구도(앞 컷이 legacy 면 장소만) + 전환 cut + 블로킹 호환일 때만 앞 컷 마지막 프레임에서 시작 */
export function chainsFromV1(prev: DramaCut | undefined, cut: DramaCut): boolean {
  return !!prev && cut.continuesFromPrev === true && prev.locationId === cut.locationId
    && (prev.setupId === undefined || prev.setupId === cut.setupId)
    && (cut.transitionIn ?? 'cut') === 'cut' && blockingCompatible(prev, cut);
}
```

- [ ] **Step 4: Run** → PASS, 전체 + tsc.

- [ ] **Step 5: Commit** `git commit -m "feat(drama-series): single previousCutOf, episode link validation, blocking compatibility, chainsFromV1"`

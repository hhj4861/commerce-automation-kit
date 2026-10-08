# drama-series 키프레임 우선 파이프라인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** shot-v1 정책 회차에서 구도·블로킹·비트 관문, 키프레임 승인, 컷별 판정 기반 실행 경계(`ds next`), 토큰 기반 교차 리뷰(Ed25519, GCP Secret Manager)를 코드로 강제하고, 정책 없는 기존 회차는 그대로 동작하게 한다.

**Architecture:** 계약(`@cak/contracts`)에 선택 필드·새 타입만 추가한다. `packages/drama-series/src/core` 에 순수 로직(shot 관문, 키프레임 지문, 실행 상태, 컷 판정, 리뷰 토큰)을 파일 단위로 두고, 외부 의존(ffmpeg 프레임, gcloud 비밀 조회)은 `src/adapters` 에 둔다. CLI 는 얇게 연결만 한다. 모든 신규 규칙은 `episode.shotPolicy?.version === 'shot-v1'` 일 때만 강제하고 legacy 는 info 만 남긴다.

**Tech Stack:** TypeScript(ESM), zod 3, vitest 2, tsx, node:crypto(Ed25519), ffmpeg/ffprobe, gcloud CLI.

**Spec:** `docs/superpowers/specs/2026-10-08-drama-keyframe-pipeline-design.md` (r5, f258088)

## Global Constraints

- 계약은 append-only: 기존 필드 삭제·의미 변경 금지, 새 필드는 `?: T | undefined`. contracts 에 해시·파일 IO·원자 import 금지.
- `DramaClipMedia.role` 은 계속 `'image_references'` 만. 시작 이미지는 `DramaClipSpec.startImage`.
- legacy(정책 없음) 회차: validate·plan 결과가 변경 전과 같아야 한다(새 관문은 info 만, plan 은 키프레임·교차 리뷰·shot 기록을 요구하지 않음, `chainsFrom` 의미 불변).
- 경계값은 `SHOT_V1` 상수(잠정 품질 정책, 제공자 제한 아님): 길이 review >10초·block >12초, 대사 review >2·block >3, 화면 인물 block >3, 비트 1~2개, 동작 여유 1.5초/비트, 여유 부족 review <1초, 파일럿 2컷.
- 발화 속도 상수는 기존 `MAX_SYLLABLES_PER_SEC = 2.2`, 대사 대조는 기존 `MAX_LINE_CER = 0.15` 재사용.
- SSIM 은 참고 수치. 어떤 값도 자동 pass/승인 근거가 되지 않는다.
- 개인 키는 GCP Secret Manager(`gen-lang-client-0881453127`, 비밀 `cak-drama-review-<agent>-ed25519`)에만. 디스크·iCloud·메일함·저장소·stdout 에 쓰지 않는다. 클라우드 설정 변경(API 사용, 비밀 생성)은 사용자 승인 후에만 실행.
- 외부 호출 금지 원칙 유지: 원자는 힉스필드·JEV 를 호출하지 않는다. (gcloud 비밀 조회·ffmpeg 는 기존 whisper·ffmpeg 처럼 adapters 로 허용)
- 실패를 침묵하지 않는다: 판정·검증 실패는 항상 보고서 findings 로 남긴다.
- 테스트 실행: `npm test -w @cak/drama-series`, 타입체크 `npx tsc -p packages/drama-series --noEmit` (worktree 루트에서).

## Review Focus

1. 기존 gates 디렉터리(1화 `gates-9min`)에 `shot` 기록이 없는 legacy 회차 → plan 이 이전처럼 통과해야 한다 (Task 5 테스트 `legacy plan does not require shot/keyframes/cross-review`).
2. 판정·승인 후 같은 cut 의 클립 파일을 교체(sha 변경) → 판정·승인이 무효가 되어 다음 컷이 막혀야 한다 (Task 8 테스트 `replaced clip file voids verdict and approval`).
3. 리뷰 응답 후 대본을 고침 → cross-review-apply 거부, plan 차단 (Task 10 테스트 `rejects a response whose fingerprint is no longer current`).
4. 비트 sec 합이 컷 길이 초과, lines 인덱스 범위 밖·중복·누락 → block, beatWindows 는 음수 구간을 만들지 않는다 (Task 3 테스트).
5. 무음 클립·빈 받아쓰기 → 컷 판정의 대사 항목이 크래시 없이 fail (Task 9 테스트 `empty transcript fails dialogue item`).

---

## File Structure

| 파일 | 책임 |
|---|---|
| `packages/contracts/src/drama-series.ts` (수정) | 새 타입·선택 필드 |
| `packages/drama-series/src/core/model.ts` (수정) | zod 스키마에 새 필드 |
| `packages/drama-series/src/core/fingerprint.ts` (수정) | `cut.keyframe` 제외 |
| `packages/drama-series/src/core/shot-policy.ts` (신규) | `SHOT_V1`, `isShotV1`, `speechSec`, `beatWindows` |
| `packages/drama-series/src/core/gates/shot.ts` (신규) | `shot` 결정적 관문 |
| `packages/drama-series/src/core/gates/registry.ts`, `dialogue-lint.ts` (수정) | 등록, shot-v1 줄 수 중복 제거 |
| `packages/drama-series/src/core/keyframe.ts` (신규) | `keyframeDigest`, 요청 생성, 승인, plan 검사 |
| `packages/drama-series/src/core/join.ts` (수정) | `chainsFromV1` |
| `packages/drama-series/src/adapters/video/seedance-2-5.ts` (수정) | `referenceMap`, v1 프롬프트 |
| `packages/drama-series/src/core/plan.ts` (수정) | v1 필수 관문·startImage·keyframeAssetId |
| `packages/drama-series/src/core/run-state.ts` (신규) | 회차 잠금, `nextCuts`, 기록·승인·인계 |
| `packages/drama-series/src/adapters/frames.ts` (신규) | 프레임 추출·마지막 프레임·SSIM·시트 |
| `packages/drama-series/src/core/verdict.ts` (신규) | 컷 판정 요청·응답 검증 |
| `packages/drama-series/src/core/review.ts` (신규) | 리뷰 토큰·서명·검증·관문 |
| `packages/drama-series/src/adapters/secrets/gcp.ts` (신규) | gcloud 비밀 조회·키 등록 |
| `packages/drama-series/review-keys/*.pub.json` (키 생성 시) | 공개 키 |
| `packages/drama-series/src/cli/index.ts` (수정) | 새 명령 |
| `.claude/skills/drama-series/SKILL.md`, `WRITING-GUIDE.md` (수정) | 절차 |
| 테스트: `packages/drama-series/test/{model-v1,shot,keyframe,plan-v1,seedance-v1,run-state,frames,verdict,review,cli-v1}.test.ts` | |

---

### Task 1: 계약·스키마에 shot-v1 필드 추가

**Files:**
- Modify: `packages/contracts/src/drama-series.ts`
- Modify: `packages/drama-series/src/core/model.ts`
- Test: `packages/drama-series/test/model-v1.test.ts`

**Interfaces:**
- Produces: 타입 `DramaSetup, DramaShotPolicy, DramaScreenSide, DramaBlocking, DramaCameraMove, DramaBeat, DramaKeyframe, DramaAgent, DramaStartImage, DramaRunOwner, DramaVerdictItem, DramaClipVerdict, DramaClipApproval, DramaRunClip, DramaRunState, DramaReviewRequest, DramaReviewResponse`; 필드 `DramaLocation.setups`, `DramaEpisode.shotPolicy`, `DramaEpisode.authoredBy`, `DramaCut.{setupId,blocking,blockingChange,cameraMove,beats,usedPropIds,continuesFromPrev,keyframe}`, `DramaCutCast.carriesPropIds`, `DramaCharacterLook.outfitRefAssetId`, `DramaClipSpec.{startImage,keyframeAssetId}`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/drama-series/test/model-v1.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseEpisode, parseSeries } from '../src/core/model.js';

const fx = (n: string): any => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));

describe('shot-v1 model fields', () => {
  it('keeps legacy fixtures valid and leaves new fields undefined', () => {
    const e = parseEpisode(fx('episode.json'));
    expect(e.shotPolicy).toBeUndefined();
    expect(e.cuts[0]!.setupId).toBeUndefined();
  });
  it('accepts setups, policy, blocking, beats, props, keyframe and outfit refs', () => {
    const s = fx('series.json');
    s.locations[0].setups = [{ id: 'side-door', name: '쪽문 정면', cameraEn: 'static medium-wide shot facing the side door', refAssetId: 'a1', visiblePropIds: ['박스'] }];
    s.characters[1].looks[0].outfitRefAssetId = 'o1';
    const series = parseSeries(s);
    expect(series.locations[0]!.setups![0]!.visiblePropIds).toEqual(['박스']);
    expect(series.characters[1]!.looks[0]!.outfitRefAssetId).toBe('o1');
    const e = fx('episode.json');
    e.shotPolicy = { version: 'shot-v1', strict: true };
    e.authoredBy = 'claude';
    Object.assign(e.cuts[1], {
      setupId: 'side-door',
      blocking: [{ characterId: 'changsik', side: 'left' }, { characterId: 'minjae', side: 'right', depth: 'mid' }],
      cameraMove: 'static',
      beats: [{ en: 'He grabs the collar.', lines: [0] }, { en: 'Minjae pleads.', sec: 4, lines: [1] }],
      usedPropIds: ['박스'],
      continuesFromPrev: true,
      keyframe: { assetId: 'k1', fileSha256: 'f'.repeat(64), digest: 'd1', approvedBy: 'user', at: '2026-10-08T00:00:00Z' },
    });
    e.cuts[1].cast[0].carriesPropIds = ['박스'];
    const ep = parseEpisode(e);
    expect(ep.shotPolicy).toEqual({ version: 'shot-v1', strict: true });
    expect(ep.authoredBy).toBe('claude');
    expect(ep.cuts[1]!.beats![1]!.sec).toBe(4);
    expect(ep.cuts[1]!.cast[0]!.carriesPropIds).toEqual(['박스']);
  });
  it('rejects unknown policy versions and screen sides', () => {
    const e = fx('episode.json');
    e.shotPolicy = { version: 'shot-v9', strict: true };
    expect(() => parseEpisode(e)).toThrow(/shotPolicy/);
    const e2 = fx('episode.json');
    e2.cuts[1].blocking = [{ characterId: 'changsik', side: 'top' }];
    expect(() => parseEpisode(e2)).toThrow(/blocking/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @cak/drama-series -- model-v1`
Expected: FAIL — `e.shotPolicy` is stripped (undefined) / setups not in output.

- [ ] **Step 3: Add contract types** — append to `packages/contracts/src/drama-series.ts` (end of file) and add fields to existing interfaces:

```ts
// --- 2026-10-08 shot-v1 (키프레임 우선 파이프라인) — append-only ---

export type DramaAgent = 'claude' | 'codex';

/** 장소 안의 고정 구도. 구도마다 배경 그림 1장 */
export interface DramaSetup {
  id: string;
  name: string;
  /** 카메라 구도(영어) */
  cameraEn: string;
  refAssetId?: string | undefined;
  /** 배경 그림에 그려 넣었다고 선언한 소품(장소 props 의 부분집합). 이미지 인식 검증이 아니다 */
  visiblePropIds: string[];
}

export interface DramaShotPolicy { version: 'shot-v1'; strict: true }
export type DramaScreenSide = 'left' | 'center' | 'right';
export interface DramaBlocking { characterId: string; side: DramaScreenSide; depth?: 'front' | 'mid' | 'back' | undefined }
export type DramaCameraMove = 'static' | 'push-in' | 'pull-out' | 'pan' | 'follow';
/** 시간 순 행동 단위. lines = 이 비트에서 말하는 대사 인덱스 */
export interface DramaBeat { en: string; sec?: number | undefined; lines?: number[] | undefined }
/** 사람 승인 증거. 내용 지문(fingerprintOf)에서 제외된다 */
export interface DramaKeyframe { assetId: string; fileSha256: string; digest: string; approvedBy: string; at: string }

export type DramaStartImage = { source: 'keyframe'; assetId: string } | { source: 'prev-clip'; fromCut: string };

export interface DramaRunOwner { agent: DramaAgent; session: string; since: string }
export interface DramaVerdictItem { id: string; verdict: 'pass' | 'fail'; evidenceFrameIds: string[]; note?: string | undefined }
export interface DramaClipVerdict { status: 'pass' | 'fail'; judge: string; at: string; items: DramaVerdictItem[] }
export interface DramaClipApproval { by: string; at: string; override: boolean; note?: string | undefined }
export interface DramaRunClip { cutId: string; jobId: string; fileSha256: string; verdict?: DramaClipVerdict | undefined; approval?: DramaClipApproval | undefined }
export interface DramaRunState {
  planFingerprint: string;
  episodeNo: number;
  owner?: DramaRunOwner | undefined;
  clips: DramaRunClip[];
  handoffs?: { from: DramaAgent; to: DramaAgent; at: string; note: string }[] | undefined;
}

export interface DramaReviewRequest {
  token: string;
  kind: 'scenario';
  episodePath: string;
  fingerprint: string;
  author: DramaAgent;
  reviewer: DramaAgent;
  createdAt: string;
  expiresAt: string;
  summary: string;
}
export interface DramaReviewResponse {
  token: string;
  reviewedFingerprint: string;
  verdict: 'pass' | 'changes';
  findings: string[];
  reviewer: DramaAgent;
  respondedAt: string;
  keyId: string;
  /** base64 Ed25519 서명(서명 필드를 뺀 canonical 본문) */
  signature: string;
}
```

Add to existing interfaces (keep existing fields):

```ts
// DramaCharacterLook
  /** (2026-10-08) 의상 전신 참조(얼굴 참조와 분리) */
  outfitRefAssetId?: string | undefined;
// DramaCutCast
  /** (2026-10-08) 이 인물이 들고 들어오는 소품 */
  carriesPropIds?: string[] | undefined;
// DramaLocation
  /** (2026-10-08) 고정 구도별 배경 */
  setups?: DramaSetup[] | undefined;
// DramaCut
  /** (2026-10-08) shot-v1 필드 */
  setupId?: string | undefined;
  blocking?: DramaBlocking[] | undefined;
  blockingChange?: 'move' | 'reverse' | undefined;
  cameraMove?: DramaCameraMove | undefined;
  beats?: DramaBeat[] | undefined;
  usedPropIds?: string[] | undefined;
  continuesFromPrev?: boolean | undefined;
  keyframe?: DramaKeyframe | undefined;
// DramaEpisode
  /** (2026-10-08) 없으면 legacy */
  shotPolicy?: DramaShotPolicy | undefined;
  authoredBy?: DramaAgent | undefined;
// DramaClipSpec
  /** (2026-10-08) 시작 이미지. medias 와 분리 */
  startImage?: DramaStartImage;
  /** (2026-10-08) 승인 키프레임 자산 id 사본 */
  keyframeAssetId?: string;
```

- [ ] **Step 4: Extend zod schemas** in `packages/drama-series/src/core/model.ts`:

```ts
const look = z.object({ id: ID, description: z.string().min(3), refAssetId: z.string().min(1).optional(), outfitRefAssetId: z.string().min(1).optional() });

const setup = z.object({ id: ID, name: z.string().min(1), cameraEn: z.string().min(10), refAssetId: z.string().min(1).optional(), visiblePropIds: z.array(z.string().min(1)) });

const location = z.object({
  id: ID,
  name: z.string().min(1),
  anchorText: z.string().min(20),
  props: z.array(z.string().min(1)),
  refAssetId: z.string().min(1).optional(),
  setups: z.array(setup).optional(),
});

const keyframe = z.object({ assetId: z.string().min(1), fileSha256: z.string().regex(/^[0-9a-f]{64}$/), digest: z.string().min(1), approvedBy: z.string().min(1), at: z.string().min(1) });

const cut = z.object({
  id: ID,
  locationId: ID,
  durationSec: z.number().int().min(1).max(60),
  cast: z.array(z.object({ characterId: ID, lookId: ID, carriesPropIds: z.array(z.string().min(1)).optional() })),
  action: z.string().min(3),
  visualEn: z.string().min(10),
  sfx: z.string().optional(),
  caption: z.string().max(60).optional(),
  propState: z.record(z.string().min(1), z.string().min(1)).optional(),
  transitionIn: z.enum(['cut', 'flash', 'fade-black']).optional(),
  lines: z.array(line).default([]),
  setupId: ID.optional(),
  blocking: z.array(z.object({ characterId: ID, side: z.enum(['left', 'center', 'right']), depth: z.enum(['front', 'mid', 'back']).optional() })).optional(),
  blockingChange: z.enum(['move', 'reverse']).optional(),
  cameraMove: z.enum(['static', 'push-in', 'pull-out', 'pan', 'follow']).optional(),
  beats: z.array(z.object({ en: z.string().min(3), sec: z.number().positive().optional(), lines: z.array(z.number().int().min(0)).optional() })).optional(),
  usedPropIds: z.array(z.string().min(1)).optional(),
  continuesFromPrev: z.boolean().optional(),
  keyframe: keyframe.optional(),
});

export const episodeSchema = z.object({
  seriesId: ID,
  no: z.number().int().min(1),
  title: z.string().min(1),
  cuts: z.array(cut).min(1),
  shotPolicy: z.object({ version: z.literal('shot-v1'), strict: z.literal(true) }).optional(),
  authoredBy: z.enum(['claude', 'codex']).optional(),
});
```

- [ ] **Step 5: Run tests**

Run: `npm test -w @cak/drama-series -- model-v1` → PASS. Then `npm test -w @cak/drama-series` → all pass (89 + 3). `npx tsc -p packages/drama-series --noEmit` → 0 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/drama-series.ts packages/drama-series/src/core/model.ts packages/drama-series/test/model-v1.test.ts
git commit -m "feat(contracts,drama-series): shot-v1 fields — setups, blocking, beats, keyframe, run state, review types"
```

---

### Task 2: 내용 지문에서 키프레임 승인 증거 제외

**Files:**
- Modify: `packages/drama-series/src/core/fingerprint.ts`
- Test: `packages/drama-series/test/keyframe.test.ts` (새 파일, 이 Task 에서는 지문 테스트만)

**Interfaces:**
- Produces: `fingerprintOf(series, episode)` — `cut.keyframe` 를 무시. 기존 시그니처 불변.

- [ ] **Step 1: Write the failing test**

```ts
// packages/drama-series/test/keyframe.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseEpisode, parseSeries } from '../src/core/model.js';
import { fingerprintOf } from '../src/core/fingerprint.js';

const fx = (n: string): any => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));

describe('content fingerprint', () => {
  it('does not change when a keyframe approval is recorded', () => {
    const s = parseSeries(fx('series.json'));
    const e = parseEpisode(fx('episode.json'));
    const before = fingerprintOf(s, e);
    e.cuts[0]!.keyframe = { assetId: 'k', fileSha256: 'a'.repeat(64), digest: 'd', approvedBy: 'user', at: 'now' };
    expect(fingerprintOf(s, e)).toBe(before);
  });
  it('changes when the scene changes', () => {
    const s = parseSeries(fx('series.json'));
    const e = parseEpisode(fx('episode.json'));
    const before = fingerprintOf(s, e);
    e.cuts[0]!.action = '바뀐 장면 설명';
    expect(fingerprintOf(s, e)).not.toBe(before);
  });
});
```

- [ ] **Step 2: Run** `npm test -w @cak/drama-series -- keyframe` → FAIL (first test: fingerprints differ).

- [ ] **Step 3: Implement** — in `fingerprintOf`:

```ts
export function fingerprintOf(series: DramaSeries, episode: DramaEpisode): string {
  // 대사 검증 상태·키프레임 승인 증거는 빼고 계산한다 — 승인을 기록해도 다른 관문 기록이 무효가 되지 않는다.
  const stripped = {
    ...episode,
    cuts: episode.cuts.map(({ keyframe: _k, ...c }) => ({ ...c, lines: c.lines.map(({ verification: _v, ...rest }) => rest) })),
  };
  return sha16(canonical({ series: { ...series, topic: stripTopic(series.topic) }, episode: stripped }));
}
```

- [ ] **Step 4: Run** `npm test -w @cak/drama-series` → all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/drama-series/src/core/fingerprint.ts packages/drama-series/test/keyframe.test.ts
git commit -m "fix(drama-series): keyframe approval evidence excluded from content fingerprint"
```

---

### Task 3: shot 정책 상수·비트 시간 배분·shot 관문

**Files:**
- Create: `packages/drama-series/src/core/shot-policy.ts`
- Create: `packages/drama-series/src/core/gates/shot.ts`
- Modify: `packages/drama-series/src/core/gates/registry.ts`
- Modify: `packages/drama-series/src/core/gates/dialogue-lint.ts`
- Test: `packages/drama-series/test/shot.test.ts`

**Interfaces:**
- Consumes: `syllableCount`, `MAX_SYLLABLES_PER_SEC` (dialogue-lint.ts)
- Produces:
  - `SHOT_V1` const, `isShotV1(ep: DramaEpisode): boolean`, `speechSec(text: string): number`
  - `interface BeatWindow { index: number; start: number; end: number; beat: DramaBeat }`, `beatWindows(cut: DramaCut): BeatWindow[]` (beats 없으면 `[]`)
  - `resolveSetup(ctx: GateContext, cut: DramaCut): DramaSetup | undefined`
  - `shotGate: DeterministicGate` (id `'shot'`, stage `'episode'`)

- [ ] **Step 1: Write the failing tests**

```ts
// packages/drama-series/test/shot.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseEpisode, parseSeries } from '../src/core/model.js';
import { loadGenre } from '../src/core/genre.js';
import { shotGate } from '../src/core/gates/shot.js';
import { SHOT_V1, beatWindows } from '../src/core/shot-policy.js';
import type { GateContext } from '../src/core/gates/types.js';

const fx = (n: string): any => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
/** fixture 를 shot-v1 로 올리고 c2 를 규칙에 맞게 채운다. mutate 로 위반을 만든다. */
function v1(mutate?: (s: any, e: any) => void): GateContext {
  const s = fx('series.json');
  const e = fx('episode.json');
  s.locations.find((l: any) => l.id === 'aisle').setups = [{ id: 'front', name: '정면', cameraEn: 'static eye-level medium-wide shot of the aisle', refAssetId: 'set1', visiblePropIds: ['박스', '컨베이어'] }];
  e.shotPolicy = { version: 'shot-v1', strict: true };
  e.authoredBy = 'claude';
  for (const c of e.cuts) {
    const loc = s.locations.find((l: any) => l.id === c.locationId);
    if (loc.setups) c.setupId = 'front';
    c.blocking = c.cast.map((m: any, i: number) => ({ characterId: m.characterId, side: i === 0 ? 'left' : 'right' }));
    c.beats = [{ en: 'The scene plays out.', lines: c.lines.map((_: any, i: number) => i) }];
    c.usedPropIds = [];
  }
  mutate?.(s, e);
  return { series: parseSeries(s), episode: parseEpisode(e), genre: loadGenre(s.genreId) };
}
const msgs = (ctx: GateContext, sev = 'block') => shotGate.run(ctx).filter((f) => f.severity === sev).map((f) => `${f.cutId}:${f.message}`);

describe('shot gate (shot-v1)', () => {
  it('passes a well-formed v1 episode', () => {
    expect(msgs(v1())).toEqual([]);
  });
  it('only emits info on legacy episodes', () => {
    const s = fx('series.json');
    const e = fx('episode.json');
    const ctx = { series: parseSeries(s), episode: parseEpisode(e), genre: loadGenre(s.genreId) };
    expect(shotGate.run(ctx).every((f) => f.severity === 'info')).toBe(true);
  });
  it('blocks cuts over 12s and reviews cuts over 10s', () => {
    expect(msgs(v1((_, e) => { e.cuts[1].durationSec = 13; }))).toContain('c2:컷 길이 13초 > 12초');
    expect(msgs(v1((_, e) => { e.cuts[1].durationSec = 11; }), 'review')).toContain('c2:컷 길이 11초 > 10초(권장)');
  });
  it('blocks more than 3 lines, 3 on-screen people and 2 beats', () => {
    expect(msgs(v1((_, e) => { e.cuts[1].lines.push(...[0, 1].map(() => ({ speaker: 'minjae', text: '네.', kind: 'dialogue' }))); e.cuts[1].beats = [{ en: 'All.', lines: [0, 1, 2, 3] }]; }))).toContain('c2:대사 4줄 > 3줄');
    expect(msgs(v1((_, e) => { e.cuts[1].beats = [{ en: 'a b c', lines: [0] }, { en: 'd e f', lines: [1] }, { en: 'g h i' }]; }))).toContain('c2:비트 3개 > 2개');
  });
  it('blocks speech plus action time that exceeds the cut', () => {
    const r = msgs(v1((_, e) => { e.cuts[1].durationSec = 4; }));
    expect(r.some((m) => m.startsWith('c2:발화+동작'))).toBe(true);
  });
  it('blocks beat sec sums over duration and bad line indexes', () => {
    expect(msgs(v1((_, e) => { e.cuts[1].beats = [{ en: 'a b c', sec: 8, lines: [0] }, { en: 'd e f', sec: 5, lines: [1] }]; }))).toContain('c2:비트 시간 합 13초 > 컷 10초');
    expect(msgs(v1((_, e) => { e.cuts[1].beats = [{ en: 'a b c', lines: [0, 0, 5] }]; })).join('\n')).toMatch(/대사 인덱스/);
    expect(msgs(v1((_, e) => { e.cuts[1].beats = [{ en: 'a b c', lines: [0] }]; })).join('\n')).toMatch(/비트에 배정되지 않은 대사: 1/);
  });
  it('blocks props that are not drawn, carried or carried over', () => {
    expect(msgs(v1((_, e) => { e.cuts[1].usedPropIds = ['팔레트']; }))).toContain('c2:배경 그림에 없는 소품: 팔레트');
    expect(msgs(v1((_, e) => { e.cuts[1].usedPropIds = ['팔레트']; e.cuts[1].cast[0].carriesPropIds = ['팔레트']; }))).toEqual([]);
    expect(msgs(v1((_, e) => { e.cuts[1].usedPropIds = ['빈 박스 더미']; e.cuts[0].propState = { '빈 박스 더미': '쌓여 있음' }; }))).toEqual([]);
  });
  it('flags prop names in text that are not declared, as review only', () => {
    const r = v1((_, e) => { e.cuts[1].action = '오창식이 팔레트 위로 민재를 민다.'; });
    expect(msgs(r)).toEqual([]);
    expect(msgs(r, 'review')).toContain('c2:지문에 소품 "팔레트"가 보이지만 usedPropIds 에 없음');
  });
  it('blocks blocking that does not cover the cast or repeats a person', () => {
    expect(msgs(v1((_, e) => { e.cuts[1].blocking = [{ characterId: 'changsik', side: 'left' }]; }))).toContain('c2:블로킹 누락: minjae');
    expect(msgs(v1((_, e) => { e.cuts[1].blocking.push({ characterId: 'changsik', side: 'center' }); }))).toContain('c2:블로킹 중복: changsik');
    expect(msgs(v1((_, e) => { e.cuts[1].blocking.push({ characterId: 'seoyun', side: 'center' }); }))).toContain('c2:출연진에 없는 블로킹: seoyun');
  });
  it('reviews a left/right swap without a declared reason and accepts a declared one', () => {
    const swap = (e: any) => { const c = e.cuts.find((x: any, i: number) => i > 0 && x.cast.length >= 2 && e.cuts[i - 1].setupId === x.setupId); return c; };
    const r = v1((_, e) => { const c = swap(e); if (!c) return; const prev = e.cuts[e.cuts.indexOf(c) - 1]; prev.cast = c.cast; prev.blocking = c.blocking.map((b: any) => ({ ...b })); c.blocking = c.blocking.map((b: any) => ({ ...b, side: b.side === 'left' ? 'right' : 'left' })); });
    expect(msgs(r, 'review').some((m) => m.includes('좌우가 뒤바뀜'))).toBe(true);
  });
  it('requires a setup when the location has setups', () => {
    expect(msgs(v1((_, e) => { delete e.cuts[1].setupId; }))).toContain('c2:구도(setupId) 없음 — 장소 aisle 에 구도가 있음');
    expect(msgs(v1((_, e) => { e.cuts[1].setupId = 'nope'; }))).toContain('c2:없는 구도: nope');
  });
  it('blocks continuesFromPrev across a setup or blocking change', () => {
    expect(msgs(v1((s, e) => { s.locations[0].setups.push({ id: 'side', name: '옆', cameraEn: 'static side shot of the aisle', visiblePropIds: [] }); e.cuts[1].setupId = 'side'; e.cuts[1].continuesFromPrev = true; })).join('\n')).toMatch(/이어 붙일 수 없음/);
  });
});

describe('beatWindows', () => {
  it('honours fixed sec and spreads the rest by speech weight, never negative', () => {
    const w = beatWindows({ id: 'c', locationId: 'a', durationSec: 10, cast: [], action: 'x x x', visualEn: 'x x x x x x x x x x', lines: [{ speaker: 'a', text: '가나다라마바사아자차카타파하', kind: 'dialogue', verification: { status: 'unverified' } }], beats: [{ en: 'one', sec: 3 }, { en: 'two', lines: [0] }] } as any);
    expect(w.map((x) => [x.start, x.end])).toEqual([[0, 3], [3, 10]]);
    const over = beatWindows({ id: 'c', locationId: 'a', durationSec: 5, cast: [], action: 'x x x', visualEn: 'x x x x x x x x x x', lines: [], beats: [{ en: 'one', sec: 4 }, { en: 'two', sec: 4 }] } as any);
    expect(over.every((x) => x.end >= x.start && x.end <= 5)).toBe(true);
    expect(SHOT_V1.pilotCuts).toBe(2);
  });
});
```

- [ ] **Step 2: Run** `npm test -w @cak/drama-series -- shot` → FAIL (modules missing).

- [ ] **Step 3: Implement `shot-policy.ts`**

```ts
// packages/drama-series/src/core/shot-policy.ts
import type { DramaBeat, DramaCut, DramaEpisode, DramaSetup } from '@cak/contracts';
import { MAX_SYLLABLES_PER_SEC, syllableCount } from './gates/dialogue-lint.js';
import type { GateContext } from './gates/types.js';

/**
 * shot-v1 잠정 제작 품질 정책(제공자 제한 아님 — Seedance 2.5 API 는 4~30초).
 * 근거: 2026-10-08 2화 실측(17초·인물 4·대사 5·행동 4 컷에서 행동 누락·배경 붕괴),
 * 공식 Seedance 2.5 가이드·제작 사례의 '컷당 행동 1~2개' 권고(주장 수준).
 */
export const SHOT_V1 = {
  version: 'shot-v1',
  maxSecReview: 10,
  maxSecBlock: 12,
  maxLinesReview: 2,
  maxLinesBlock: 3,
  maxCast: 3,
  maxBeats: 2,
  actionMarginSec: 1.5,
  minSlackSec: 1,
  pilotCuts: 2,
} as const;

export const isShotV1 = (ep: DramaEpisode): boolean => ep.shotPolicy?.version === 'shot-v1';

export const speechSec = (text: string): number => syllableCount(text) / MAX_SYLLABLES_PER_SEC;

export interface BeatWindow { index: number; start: number; end: number; beat: DramaBeat }

const round = (n: number) => Math.round(n * 10) / 10;

/** 비트 시간 구간. sec 지정값을 먼저 쓰고, 나머지는 (비트 대사 발화 시간 + 동작 여유) 비례로 나눈다. */
export function beatWindows(cut: DramaCut): BeatWindow[] {
  const beats = cut.beats ?? [];
  if (!beats.length) return [];
  const fixed = beats.reduce((n, b) => n + (b.sec ?? 0), 0);
  const free = Math.max(0, cut.durationSec - fixed);
  const weight = (b: DramaBeat) => (b.lines ?? []).reduce((n, i) => n + speechSec(cut.lines[i]?.text ?? ''), 0) + SHOT_V1.actionMarginSec;
  const flexTotal = beats.filter((b) => b.sec === undefined).reduce((n, b) => n + weight(b), 0);
  let t = 0;
  return beats.map((beat, index) => {
    const len = beat.sec ?? (flexTotal > 0 ? (free * weight(beat)) / flexTotal : 0);
    const start = Math.min(t, cut.durationSec);
    const end = index === beats.length - 1 && beat.sec === undefined ? cut.durationSec : Math.min(cut.durationSec, t + len);
    t += len;
    return { index, start: round(start), end: round(Math.max(start, end)), beat };
  });
}

export function resolveSetup(ctx: GateContext, cut: DramaCut): DramaSetup | undefined {
  const loc = ctx.series.locations.find((l) => l.id === cut.locationId);
  return cut.setupId ? loc?.setups?.find((s) => s.id === cut.setupId) : undefined;
}
```

- [ ] **Step 4: Implement `gates/shot.ts`**

```ts
// packages/drama-series/src/core/gates/shot.ts
import type { DramaCut, DramaFinding, DramaFindingSeverity } from '@cak/contracts';
import { SHOT_V1, isShotV1, resolveSetup, speechSec } from '../shot-policy.js';
import type { DeterministicGate, GateContext } from './types.js';

function cutFindings(ctx: GateContext, cut: DramaCut, prev: DramaCut | undefined, sev: (s: DramaFindingSeverity) => DramaFindingSeverity): DramaFinding[] {
  const f: DramaFinding[] = [];
  const push = (s: DramaFindingSeverity, message: string) => f.push({ severity: sev(s), message, cutId: cut.id });
  const loc = ctx.series.locations.find((l) => l.id === cut.locationId);
  const dialogue = cut.lines.filter((l) => l.kind === 'dialogue');

  if (cut.durationSec > SHOT_V1.maxSecBlock) push('block', `컷 길이 ${cut.durationSec}초 > ${SHOT_V1.maxSecBlock}초`);
  else if (cut.durationSec > SHOT_V1.maxSecReview) push('review', `컷 길이 ${cut.durationSec}초 > ${SHOT_V1.maxSecReview}초(권장)`);
  if (dialogue.length > SHOT_V1.maxLinesBlock) push('block', `대사 ${dialogue.length}줄 > ${SHOT_V1.maxLinesBlock}줄`);
  else if (dialogue.length > SHOT_V1.maxLinesReview) push('review', `대사 ${dialogue.length}줄 > ${SHOT_V1.maxLinesReview}줄(권장)`);
  if (cut.cast.length > SHOT_V1.maxCast) push('block', `화면 인물 ${cut.cast.length}명 > ${SHOT_V1.maxCast}명`);

  const beats = cut.beats ?? [];
  if (!beats.length) push('block', '비트(beats) 없음');
  if (beats.length > SHOT_V1.maxBeats) push('block', `비트 ${beats.length}개 > ${SHOT_V1.maxBeats}개`);
  const fixed = beats.reduce((n, b) => n + (b.sec ?? 0), 0);
  if (fixed > cut.durationSec) push('block', `비트 시간 합 ${fixed}초 > 컷 ${cut.durationSec}초`);
  const assigned = beats.flatMap((b) => b.lines ?? []);
  const bad = assigned.filter((i, k) => i >= cut.lines.length || assigned.indexOf(i) !== k);
  if (bad.length) push('block', `비트의 대사 인덱스가 범위 밖이거나 중복: ${[...new Set(bad)].join(', ')}`);
  const unassigned = cut.lines.map((_, i) => i).filter((i) => cut.lines[i]!.kind === 'dialogue' && !assigned.includes(i));
  if (beats.length && unassigned.length) push('block', `비트에 배정되지 않은 대사: ${unassigned.join(', ')}`);

  const need = dialogue.reduce((n, l) => n + speechSec(l.text), 0) + Math.max(1, beats.length) * SHOT_V1.actionMarginSec;
  if (need > cut.durationSec) push('block', `발화+동작 ${need.toFixed(1)}초 > 컷 ${cut.durationSec}초`);
  else if (cut.durationSec - need < SHOT_V1.minSlackSec) push('review', `발화+동작 여유 ${(cut.durationSec - need).toFixed(1)}초 < ${SHOT_V1.minSlackSec}초`);

  const setup = resolveSetup(ctx, cut);
  if (loc?.setups?.length && !cut.setupId) push('block', `구도(setupId) 없음 — 장소 ${loc.id} 에 구도가 있음`);
  if (cut.setupId && !setup) push('block', `없는 구도: ${cut.setupId}`);

  const visible = new Set(setup ? setup.visiblePropIds : (loc?.props ?? []));
  const carried = new Set(cut.cast.flatMap((m) => m.carriesPropIds ?? []));
  const carriedOver = new Set(prev && prev.locationId === cut.locationId ? Object.keys(prev.propState ?? {}) : []);
  for (const p of cut.usedPropIds ?? []) if (!visible.has(p) && !carried.has(p) && !carriedOver.has(p)) push('block', `배경 그림에 없는 소품: ${p}`);
  const text = `${cut.action} ${(cut.beats ?? []).map((b) => b.en).join(' ')}`;
  for (const p of loc?.props ?? []) if (text.includes(p) && !(cut.usedPropIds ?? []).includes(p)) push('review', `지문에 소품 "${p}"가 보이지만 usedPropIds 에 없음`);

  const castIds = cut.cast.map((m) => m.characterId);
  const blocking = cut.blocking ?? [];
  if (castIds.length >= 2 && !blocking.length) push('block', '블로킹(인물 좌·우) 없음');
  const seen = new Set<string>();
  for (const b of blocking) {
    if (seen.has(b.characterId)) push('block', `블로킹 중복: ${b.characterId}`);
    seen.add(b.characterId);
    if (!castIds.includes(b.characterId)) push('block', `출연진에 없는 블로킹: ${b.characterId}`);
  }
  if (blocking.length) for (const id of castIds) if (!seen.has(id)) push('block', `블로킹 누락: ${id}`);

  if (prev && prev.setupId && prev.setupId === cut.setupId && !cut.blockingChange) {
    const side = (c: DramaCut, id: string) => c.blocking?.find((b) => b.characterId === id)?.side;
    const shared = castIds.filter((id) => prev.cast.some((m) => m.characterId === id));
    for (let i = 0; i < shared.length; i++)
      for (let j = i + 1; j < shared.length; j++) {
        const [a, b] = [shared[i]!, shared[j]!];
        const was = [side(prev, a), side(prev, b)];
        const now = [side(cut, a), side(cut, b)];
        if (was[0] && was[1] && now[0] && now[1] && was[0] === now[1] && was[1] === now[0] && was[0] !== was[1])
          push('review', `같은 구도에서 ${a}·${b} 좌우가 뒤바뀜 — 이동·리버스면 blockingChange 를 적을 것`);
      }
  }

  if (cut.continuesFromPrev) {
    const sameSet = !!prev && prev.setupId === cut.setupId && prev.locationId === cut.locationId;
    const sameCast = !!prev && castIds.every((id) => prev.cast.some((m) => m.characterId === id));
    const transition = (cut.transitionIn ?? 'cut') === 'cut';
    if (!prev || !sameSet || !transition || (!sameCast && !cut.blockingChange))
      push('block', '앞 컷 마지막 프레임에서 이어 붙일 수 없음(구도·장소·전환·출연진 불일치) — continuesFromPrev 를 지우고 자체 키프레임으로 시작');
  }
  return f;
}

export const shotGate: DeterministicGate = {
  id: 'shot',
  stage: 'episode',
  run(ctx) {
    const strict = isShotV1(ctx.episode);
    const sev = (s: DramaFindingSeverity): DramaFindingSeverity => (strict ? s : 'info');
    return ctx.episode.cuts.flatMap((cut, i) => cutFindings(ctx, cut, ctx.episode.cuts[i - 1], sev));
  },
};
```

- [ ] **Step 5: Register and de-duplicate line-count message**

`registry.ts`:
```ts
import { shotGate } from './shot.js';
export const EPISODE_GATES: DeterministicGate[] = [schemaGate, dialogueLintGate, continuityGate, shotGate];
```

`dialogue-lint.ts` — wrap the existing `MAX_LINES_PER_CUT` review push:
```ts
import { isShotV1 } from '../shot-policy.js';
// inside run():
      if (cut.lines.length > MAX_LINES_PER_CUT && !isShotV1(episode))
```
(Use the existing `run({ episode, genre })` destructuring — add `episode` usage only.)

- [ ] **Step 6: Run** `npm test -w @cak/drama-series` → all pass (existing `gates.test.ts` may assert the list of report ids; if it lists `['schema','dialogue-lint','continuity']`, update that expectation to include `'shot'` — that is the only allowed change to an existing test). `npx tsc -p packages/drama-series --noEmit` → 0.

- [ ] **Step 7: Commit**

```bash
git add packages/drama-series/src/core/shot-policy.ts packages/drama-series/src/core/gates packages/drama-series/test/shot.test.ts packages/drama-series/test/gates.test.ts
git commit -m "feat(drama-series): shot-v1 gate — duration, lines, cast, beats, speech time, props, blocking, continuation"
```

---

### Task 4: 키프레임 지문·요청·승인·plan 검사

**Files:**
- Modify: `packages/drama-series/src/core/keyframe.ts` (create)
- Test: `packages/drama-series/test/keyframe.test.ts` (append)

**Interfaces:**
- Consumes: `resolveSetup`, `beatWindows`, `canonical` (fingerprint.ts)
- Produces:
  - `type Aspect = '16:9' | '9:16'`
  - `keyframeDigest(ctx: GateContext, cut: DramaCut, aspect: Aspect): string` (prefix `kf-v1:`)
  - `interface KeyframeRequest { cutId: string; model: 'gpt_image_2_5'; aspect_ratio: Aspect; medias: { role: 'image_references'; assetId: string; label: string }[]; prompt: string; digest: string }`
  - `buildKeyframeRequests(ctx: GateContext, aspect: Aspect): KeyframeRequest[]` (throws `PlanError` if a ref asset is missing)
  - `approveKeyframe(ctx, cutId, assetId, fileSha256, aspect, by, now): DramaEpisode`
  - `keyframeFindings(ctx, aspect, fileSha: (cutId: string) => string | null): DramaFinding[]`

- [ ] **Step 1: Append failing tests**

```ts
// append to packages/drama-series/test/keyframe.test.ts
import { loadGenre } from '../src/core/genre.js';
import { approveKeyframe, buildKeyframeRequests, keyframeDigest, keyframeFindings } from '../src/core/keyframe.js';
import type { GateContext } from '../src/core/gates/types.js';

function v1ctx(mutate?: (s: any, e: any) => void): GateContext {
  const s = fx('series.json');
  const e = fx('episode.json');
  s.locations[0].setups = [{ id: 'front', name: '정면', cameraEn: 'static eye-level medium-wide shot of the aisle', refAssetId: 'set1', visiblePropIds: ['박스'] }];
  s.characters.find((c: any) => c.id === 'minjae').looks[0].outfitRefAssetId = 'outfit-mj';
  e.shotPolicy = { version: 'shot-v1', strict: true };
  for (const c of e.cuts) {
    if (c.locationId === 'aisle') c.setupId = 'front';
    c.blocking = c.cast.map((m: any, i: number) => ({ characterId: m.characterId, side: i ? 'right' : 'left' }));
    c.beats = [{ en: 'The scene starts.', lines: c.lines.map((_: any, i: number) => i) }];
  }
  mutate?.(s, e);
  return { series: parseSeries(s), episode: parseEpisode(e), genre: loadGenre(s.genreId) };
}

describe('keyframes', () => {
  it('builds one image request per cut with setup, face and outfit refs in that order', () => {
    const reqs = buildKeyframeRequests(v1ctx(), '9:16');
    const c2 = reqs.find((r) => r.cutId === 'c2')!;
    expect(c2.aspect_ratio).toBe('9:16');
    expect(c2.medias.map((m) => m.assetId)).toEqual(['set1', fx('series.json').characters.find((c: any) => c.id === 'changsik').looks[0].refAssetId, fx('series.json').characters.find((c: any) => c.id === 'minjae').looks[0].refAssetId, 'outfit-mj']);
    expect(c2.prompt).toContain('static eye-level medium-wide shot of the aisle');
    expect(c2.prompt).toContain('screen-left');
    expect(c2.prompt).toContain('do not add or remove set pieces');
  });
  it('digest changes with scene, look and aspect but not with line wording', () => {
    const base = v1ctx();
    const c = base.episode.cuts[1]!;
    const d = keyframeDigest(base, c, '16:9');
    expect(keyframeDigest(base, c, '9:16')).not.toBe(d);
    expect(keyframeDigest(v1ctx((_, e) => { e.cuts[1].action = '다른 장면'; }), v1ctx((_, e) => { e.cuts[1].action = '다른 장면'; }).episode.cuts[1]!, '16:9')).not.toBe(d);
    const worded = v1ctx((_, e) => { e.cuts[1].lines[0].text = '문구만 바뀐 대사'; });
    expect(keyframeDigest(worded, worded.episode.cuts[1]!, '16:9')).toBe(d);
    const relook = v1ctx((s) => { s.characters.find((x: any) => x.id === 'minjae').looks[0].outfitRefAssetId = 'other'; });
    expect(keyframeDigest(relook, relook.episode.cuts[1]!, '16:9')).not.toBe(d);
  });
  it('requires an approved, current, untouched keyframe for every cut', () => {
    let ctx = v1ctx();
    const sha = 'b'.repeat(64);
    for (const c of ctx.episode.cuts) ctx = { ...ctx, episode: approveKeyframe(ctx, c.id, `k-${c.id}`, sha, '16:9', 'user', 'now') };
    expect(keyframeFindings(ctx, '16:9', () => sha)).toEqual([]);
    expect(keyframeFindings(ctx, '9:16', () => sha).map((f) => f.message)[0]).toMatch(/키프레임 승인 이후 장면이 바뀜/);
    expect(keyframeFindings(ctx, '16:9', () => 'c'.repeat(64)).map((f) => f.message)[0]).toMatch(/키프레임 파일이 승인 때와 다름/);
    const missing = v1ctx();
    expect(keyframeFindings(missing, '16:9', () => null).map((f) => f.message)[0]).toMatch(/승인된 키프레임 없음/);
  });
});
```

- [ ] **Step 2: Run** `npm test -w @cak/drama-series -- keyframe` → FAIL (module missing).

- [ ] **Step 3: Implement `keyframe.ts`**

```ts
// packages/drama-series/src/core/keyframe.ts
import { createHash } from 'node:crypto';
import type { DramaCut, DramaEpisode, DramaFinding } from '@cak/contracts';
import { PlanError } from '../adapters/video/seedance-2-5.js';
import { canonical } from './fingerprint.js';
import type { GateContext } from './gates/types.js';
import { resolveSetup } from './shot-policy.js';

export type Aspect = '16:9' | '9:16';
export const KEYFRAME_MODEL = 'gpt_image_2_5' as const;
const VERSION = 'kf-v1';

export interface KeyframeRequest {
  cutId: string;
  model: typeof KEYFRAME_MODEL;
  aspect_ratio: Aspect;
  medias: { role: 'image_references'; assetId: string; label: string }[];
  prompt: string;
  digest: string;
}

/** 정지 그림에 영향을 주는 입력만 묶는다. 대사는 화자·줄 수만 — 문구 변경은 대사 검증이 따로 잡는다. */
export function keyframeDigest(ctx: GateContext, cut: DramaCut, aspect: Aspect): string {
  const loc = ctx.series.locations.find((l) => l.id === cut.locationId);
  const setup = resolveSetup(ctx, cut);
  const i = ctx.episode.cuts.indexOf(cut);
  const prev = i > 0 ? ctx.episode.cuts[i - 1] : undefined;
  const cast = cut.cast.map((m) => {
    const c = ctx.series.characters.find((x) => x.id === m.characterId);
    const look = c?.looks.find((l) => l.id === m.lookId);
    return { id: m.characterId, look: m.lookId, description: look?.description, ref: look?.refAssetId, outfit: look?.outfitRefAssetId, carries: m.carriesPropIds };
  });
  const body = {
    version: VERSION,
    cutId: cut.id,
    aspect,
    location: { id: loc?.id, anchor: loc?.anchorText, ref: loc?.refAssetId },
    setup: setup ? { id: setup.id, camera: setup.cameraEn, ref: setup.refAssetId, visible: setup.visiblePropIds } : null,
    cast,
    blocking: cut.blocking,
    blockingChange: cut.blockingChange,
    cameraMove: cut.cameraMove ?? 'static',
    firstBeat: cut.beats?.[0]?.en,
    action: cut.action,
    visualEn: cut.visualEn,
    usedProps: cut.usedPropIds,
    propsIn: prev && prev.locationId === cut.locationId ? prev.propState : undefined,
    style: ctx.series.styleEn,
    speakers: cut.lines.map((l) => l.speaker),
  };
  return `${VERSION}:${createHash('sha256').update(canonical(body)).digest('hex').slice(0, 16)}`;
}

function sideWord(side: string) {
  return side === 'left' ? 'screen-left' : side === 'right' ? 'screen-right' : 'center frame';
}

export function buildKeyframeRequests(ctx: GateContext, aspect: Aspect): KeyframeRequest[] {
  return ctx.episode.cuts.map((cut) => {
    const loc = ctx.series.locations.find((l) => l.id === cut.locationId);
    if (!loc) throw new PlanError(`장소 없음: ${cut.locationId}`, cut.id);
    const setup = resolveSetup(ctx, cut);
    const setRef = setup?.refAssetId ?? loc.refAssetId;
    if (!setRef) throw new PlanError(`배경 참조 이미지 미등록: ${setup?.name ?? loc.name}`, cut.id);
    const medias: KeyframeRequest['medias'] = [{ role: 'image_references', assetId: setRef, label: setup?.name ?? loc.name }];
    const who: string[] = [];
    for (const m of cut.cast) {
      const c = ctx.series.characters.find((x) => x.id === m.characterId);
      const look = c?.looks.find((l) => l.id === m.lookId);
      if (!c || !look?.refAssetId) throw new PlanError(`인물 참조 이미지 미등록: ${m.characterId}/${m.lookId}`, cut.id);
      medias.push({ role: 'image_references', assetId: look.refAssetId, label: `${c.name}(${look.id}) 얼굴` });
      const face = medias.length;
      let outfit = '';
      if (look.outfitRefAssetId) {
        medias.push({ role: 'image_references', assetId: look.outfitRefAssetId, label: `${c.name}(${look.id}) 의상` });
        outfit = ` wearing exactly the outfit of @Image${medias.length}`;
      }
      const b = cut.blocking?.find((x) => x.characterId === m.characterId);
      who.push(`@Image${face} (${look.description})${outfit}${b ? `, ${sideWord(b.side)}${b.depth ? `, ${b.depth}ground` : ''}` : ''}`);
    }
    const prompt = [
      `A single still frame. @Image1 is the set and camera framing: keep it identical; do not add or remove set pieces.`,
      setup ? `Camera: ${setup.cameraEn}.` : `Location: ${loc.anchorText}`,
      who.length ? `People: ${who.join('; ')}.` : 'No people in frame.',
      `Moment: the very start of this action — ${cut.beats?.[0]?.en ?? cut.visualEn}`,
      cut.usedPropIds?.length ? `Visible props: ${cut.usedPropIds.join(', ')}.` : '',
      ctx.series.styleEn,
      'No text, no subtitles, no logos.',
    ].filter(Boolean).join(' ');
    return { cutId: cut.id, model: KEYFRAME_MODEL, aspect_ratio: aspect, medias, prompt, digest: keyframeDigest(ctx, cut, aspect) };
  });
}

export function approveKeyframe(ctx: GateContext, cutId: string, assetId: string, fileSha256: string, aspect: Aspect, by: string, now: string): DramaEpisode {
  const cut = ctx.episode.cuts.find((c) => c.id === cutId);
  if (!cut) throw new PlanError(`컷 없음: ${cutId}`, cutId);
  const digest = keyframeDigest(ctx, cut, aspect);
  return { ...ctx.episode, cuts: ctx.episode.cuts.map((c) => (c.id === cutId ? { ...c, keyframe: { assetId, fileSha256, digest, approvedBy: by, at: now } } : c)) };
}

export function keyframeFindings(ctx: GateContext, aspect: Aspect, fileSha: (cutId: string) => string | null): DramaFinding[] {
  return ctx.episode.cuts.flatMap((cut): DramaFinding[] => {
    const k = cut.keyframe;
    if (!k) return [{ severity: 'block', message: '승인된 키프레임 없음', cutId: cut.id }];
    if (k.digest !== keyframeDigest(ctx, cut, aspect)) return [{ severity: 'block', message: '키프레임 승인 이후 장면이 바뀜(또는 화면비 불일치) — 다시 승인', cutId: cut.id }];
    const sha = fileSha(cut.id);
    if (sha !== null && sha !== k.fileSha256) return [{ severity: 'block', message: '키프레임 파일이 승인 때와 다름', cutId: cut.id }];
    return [];
  });
}
```

- [ ] **Step 4: Run** `npm test -w @cak/drama-series` → all pass; tsc 0.

- [ ] **Step 5: Commit**

```bash
git add packages/drama-series/src/core/keyframe.ts packages/drama-series/test/keyframe.test.ts
git commit -m "feat(drama-series): keyframe digest, image requests, approval and plan check"
```

---

### Task 5: plan — shot-v1 필수 관문·연결·시작 이미지

**Files:**
- Modify: `packages/drama-series/src/core/join.ts`
- Modify: `packages/drama-series/src/core/plan.ts`
- Test: `packages/drama-series/test/plan-v1.test.ts`

**Interfaces:**
- Consumes: `keyframeFindings` (Task 4), `isShotV1` (Task 3)
- Produces:
  - `chainsFromV1(prev: DramaCut | undefined, cut: DramaCut): boolean`
  - `PlanInput.keyframeFileSha?: (cutId: string) => string | null` (기본 `() => null`)
  - plan 보고서에 v1 일 때 `keyframes` 추가; `REQUIRED_GATES_V1 = [...REQUIRED_GATES, 'shot', 'cross-review']`
  - v1 clip: `startImage` = `{source:'prev-clip', fromCut}` (chainsFromV1) 또는 `{source:'keyframe', assetId}`, `keyframeAssetId = cut.keyframe.assetId`, `startFromCut` 는 prev-clip 일 때만

- [ ] **Step 1: Write the failing tests**

```ts
// packages/drama-series/test/plan-v1.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { DramaGateReport } from '@cak/contracts';
import { parseEpisode, parseSeries } from '../src/core/model.js';
import { loadGenre } from '../src/core/genre.js';
import { runEpisodeGates } from '../src/core/gates/registry.js';
import { fingerprintOf, topicFingerprint } from '../src/core/fingerprint.js';
import { toReport } from '../src/core/report.js';
import { buildPlan } from '../src/core/plan.js';
import { lineHash } from '../src/core/line-hash.js';
import { approveKeyframe } from '../src/core/keyframe.js';
import type { GateContext } from '../src/core/gates/types.js';

const fx = (n: string): any => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const video = { resolution: '480p' as const, draft: true, aspectRatio: '16:9' as const };
const SHA = 'e'.repeat(64);

function build(v1: boolean, mutate?: (s: any, e: any) => void) {
  const s = fx('series.json');
  const e = fx('episode.json');
  if (v1) {
    s.locations[0].setups = [{ id: 'front', name: '정면', cameraEn: 'static eye-level medium-wide shot of the aisle', refAssetId: 'set1', visiblePropIds: [] }];
    e.shotPolicy = { version: 'shot-v1', strict: true };
    e.authoredBy = 'claude';
    for (const c of e.cuts) {
      if (c.locationId === 'aisle') c.setupId = 'front';
      c.blocking = c.cast.map((m: any, i: number) => ({ characterId: m.characterId, side: i ? 'right' : 'left' }));
      c.beats = [{ en: 'The scene plays out.', lines: c.lines.map((_: any, i: number) => i) }];
    }
  }
  mutate?.(s, e);
  let ctx: GateContext = { series: parseSeries(s), episode: parseEpisode(e), genre: loadGenre(s.genreId) };
  for (const c of ctx.episode.cuts) for (const l of c.lines) l.verification = { status: 'verified', judgeRef: 'r', lineHash: lineHash(c, l) };
  if (v1) for (const c of ctx.episode.cuts) ctx = { ...ctx, episode: approveKeyframe(ctx, c.id, `k-${c.id}`, SHA, '16:9', 'user', 'now') };
  return ctx;
}
function reports(ctx: GateContext, extra: string[] = []): DramaGateReport[] {
  const fp = fingerprintOf(ctx.series, ctx.episode);
  return [
    ...runEpisodeGates(ctx),
    toReport('props', 'episode', [], fp),
    toReport('scenario', 'episode', [], fp),
    toReport('topic-night-shift', 'topic', [], topicFingerprint(ctx.series.topic, ctx.series.genreId)),
    ...extra.map((g) => toReport(g, 'episode', [], fp)),
  ];
}
const run = (ctx: GateContext, rs: DramaGateReport[], sha: (id: string) => string | null = () => SHA) =>
  buildPlan({ ctx, reports: rs, budgetCredits: 500, video, now: 'now', keyframeFileSha: sha });

describe('plan shot-v1', () => {
  it('legacy plan does not require shot/keyframes/cross-review', () => {
    const ctx = build(false);
    const legacyReports = reports(ctx).filter((r) => r.gate !== 'shot');
    const r = run(ctx, legacyReports);
    expect(r.ok).toBe(true);
    expect(r.plan!.clips.every((c) => c.startImage === undefined && c.keyframeAssetId === undefined)).toBe(true);
  });
  it('v1 requires shot and cross-review records', () => {
    const ctx = build(true);
    const r = run(ctx, reports(ctx));
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r.reports)).toContain('관문 기록 없음: cross-review');
    expect(run(ctx, reports(ctx, ['cross-review'])).ok).toBe(true);
  });
  it('v1 blocks without approved keyframes', () => {
    const ctx = build(true);
    const noKf = { ...ctx, episode: { ...ctx.episode, cuts: ctx.episode.cuts.map(({ keyframe: _k, ...c }) => c) } };
    const r = run(noKf, reports(noKf, ['cross-review']));
    expect(r.ok).toBe(false);
    expect(r.reports.find((x) => x.gate === 'keyframes')!.findings.length).toBe(noKf.episode.cuts.length);
  });
  it('v1 starts from the keyframe unless the cut explicitly continues from the previous one', () => {
    const ctx = build(true, (_, e) => { e.cuts[1].continuesFromPrev = true; e.cuts[0].cast = e.cuts[1].cast; e.cuts[0].blocking = e.cuts[1].blocking; e.cuts[0].locationId = e.cuts[1].locationId; e.cuts[0].setupId = 'front'; });
    const r = run(ctx, reports(ctx, ['cross-review']));
    expect(r.ok).toBe(true);
    const [c1, c2] = r.plan!.clips;
    expect(c1!.startImage).toEqual({ source: 'keyframe', assetId: 'k-c1' });
    expect(c2!.startImage).toEqual({ source: 'prev-clip', fromCut: 'c1' });
    expect(c2!.startFromCut).toBe('c1');
    expect(c2!.keyframeAssetId).toBe('k-c2');
    expect(c2!.medias.every((m) => m.role === 'image_references')).toBe(true);
  });
});
```

- [ ] **Step 2: Run** `npm test -w @cak/drama-series -- plan-v1` → FAIL.

- [ ] **Step 3: `join.ts` — add**

```ts
/** shot-v1: 명시(continuesFromPrev) + 같은 장소·구도 + 전환 cut 일 때만 앞 컷 마지막 프레임에서 시작한다. */
export function chainsFromV1(prev: DramaCut | undefined, cut: DramaCut): boolean {
  return !!prev && cut.continuesFromPrev === true && prev.locationId === cut.locationId && prev.setupId === cut.setupId && (cut.transitionIn ?? 'cut') === 'cut';
}
```

- [ ] **Step 4: `plan.ts` changes**

```ts
import { chainsFrom, chainsFromV1 } from './join.js';
import { isShotV1 } from './shot-policy.js';
import { keyframeFindings } from './keyframe.js';

export const REQUIRED_GATES_V1 = [...REQUIRED_GATES, 'shot', 'cross-review'] as const;

export interface PlanInput {
  ctx: GateContext;
  reports: DramaGateReport[];
  budgetCredits: number;
  video: VideoOptions;
  now: string;
  /** 승인된 키프레임 파일의 현재 sha256. 파일을 확인할 수 없으면 null */
  keyframeFileSha?: (cutId: string) => string | null;
}
```

In `buildPlan`:
```ts
  const v1 = isShotV1(ctx.episode);
  for (const gate of v1 ? REQUIRED_GATES_V1 : REQUIRED_GATES) { /* existing body */ }
  ...
  const keyframes: DramaFinding[] = v1 ? keyframeFindings(ctx, input.video.aspectRatio, input.keyframeFileSha ?? (() => null)) : [];
  ...
  ctx.episode.cuts.forEach((cut, i) => {
    const prev = ctx.episode.cuts[i - 1];
    const chained = prev && (v1 ? chainsFromV1(prev, cut) : chainsFrom(prev, cut));
    try {
      const spec = toSeedanceClip(ctx, cut, input.video);
      const v1Fields = v1 && cut.keyframe
        ? { keyframeAssetId: cut.keyframe.assetId, startImage: chained ? { source: 'prev-clip' as const, fromCut: prev!.id } : { source: 'keyframe' as const, assetId: cut.keyframe.assetId } }
        : {};
      clips.push({ ...spec, estCredits: creditsFor(spec.model, input.video.resolution, input.video.draft, spec.durationSec), ...(chained ? { startFromCut: prev!.id } : {}), ...v1Fields });
    } catch (e) { /* unchanged */ }
  });
  ...
  const reports = [
    toReport('required-gates', 'plan', required, fp),
    toReport('verified-lines', 'plan', lines, fp),
    ...(v1 ? [toReport('keyframes', 'plan', keyframes, fp)] : []),
    toReport('backend', 'plan', backend, fp),
    toReport('budget', 'plan', budget, fp),
  ];
```

- [ ] **Step 5: Run** `npm test -w @cak/drama-series` → all pass (existing plan.test.ts unchanged and green). tsc 0.

- [ ] **Step 6: Commit**

```bash
git add packages/drama-series/src/core/join.ts packages/drama-series/src/core/plan.ts packages/drama-series/test/plan-v1.test.ts
git commit -m "feat(drama-series): plan enforces shot-v1 gates, keyframes and explicit continuation"
```

---

### Task 6: Seedance 프롬프트 v1 조립 (참조 역할·블로킹·비트·N줄·BGM 금지)

**Files:**
- Modify: `packages/drama-series/src/adapters/video/seedance-2-5.ts`
- Test: `packages/drama-series/test/seedance-v1.test.ts`

**Interfaces:**
- Consumes: `beatWindows`, `resolveSetup`, `isShotV1`, `chainsFromV1`
- Produces: `referenceMap(ctx, cut): { medias: DramaClipMedia[]; tag: Map<string, string> }` (`tag` keys = characterId, `'set'`, `'keyframe'`, values `@ImageN`); `toSeedanceClip` returns v1 prompt when `isShotV1`. Legacy output byte-identical.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/drama-series/test/seedance-v1.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseEpisode, parseSeries } from '../src/core/model.js';
import { loadGenre } from '../src/core/genre.js';
import { referenceMap, toSeedanceClip } from '../src/adapters/video/seedance-2-5.js';
import type { GateContext } from '../src/core/gates/types.js';

const fx = (n: string): any => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const opts = { resolution: '480p' as const, draft: true, aspectRatio: '16:9' as const };
function ctx(v1: boolean): GateContext {
  const s = fx('series.json');
  const e = fx('episode.json');
  if (v1) {
    s.locations[0].setups = [{ id: 'front', name: '정면', cameraEn: 'static eye-level medium-wide shot of the aisle', refAssetId: 'set1', visiblePropIds: [] }];
    s.characters.find((c: any) => c.id === 'minjae').looks[0].outfitRefAssetId = 'outfit-mj';
    e.shotPolicy = { version: 'shot-v1', strict: true };
    Object.assign(e.cuts[1], { setupId: 'front', blocking: [{ characterId: 'changsik', side: 'left' }, { characterId: 'minjae', side: 'right' }], beats: [{ en: 'Changsik grabs the collar of Minjae.', lines: [0] }, { en: 'Minjae pleads.', lines: [1] }], continuesFromPrev: true, keyframe: { assetId: 'k-c2', fileSha256: 'a'.repeat(64), digest: 'd', approvedBy: 'u', at: 'n' } });
  }
  return { series: parseSeries(s), episode: parseEpisode(e), genre: loadGenre(s.genreId) };
}

describe('seedance v1 prompt', () => {
  it('leaves legacy prompts unchanged', () => {
    const c = ctx(false);
    expect(toSeedanceClip(c, c.episode.cuts[1]!, opts).prompt).toContain('@Image1 says in Korean: "야, 막내. 이번 주 몫 내놔."');
  });
  it('orders references face → outfit → set → keyframe and numbers them once', () => {
    const c = ctx(true);
    const { medias, tag } = referenceMap(c, c.episode.cuts[1]!);
    expect(medias.map((m) => m.label)).toEqual(['오창식(base) 얼굴', '최민재(base) 얼굴', '최민재(base) 의상', '정면', '승인 키프레임']);
    expect(tag.get('changsik')).toBe('@Image1');
    expect(tag.get('set')).toBe('@Image4');
    expect(tag.get('keyframe')).toBe('@Image5');
  });
  it('puts roles, continuity, locked camera, blocking, timed beats, exact line count and no music in the prompt', () => {
    const c = ctx(true);
    const p = toSeedanceClip(c, c.episode.cuts[1]!, opts).prompt;
    expect(p).toMatch(/^Reference roles: @Image1 = face of/);
    expect(p).toContain('@Image3 = outfit of');
    expect(p).toContain('@Image4 = the set and camera framing');
    expect(p).toContain('Start exactly from the start image');
    expect(p).toContain('Locked-off camera, no camera movement, no cut.');
    expect(p).toContain('@Image1 stays screen-left');
    expect(p).toMatch(/0\.0–\d+\.\ds: Changsik grabs the collar/);
    expect(p).toContain('Exactly 2 spoken lines, nothing else is said');
    expect(p).toContain('No background music.');
    expect(p.indexOf('Reference roles')).toBeLessThan(p.indexOf('Exactly 2'));
  });
});
```

- [ ] **Step 2: Run** `npm test -w @cak/drama-series -- seedance-v1` → FAIL.

- [ ] **Step 3: Implement** — in `seedance-2-5.ts`, keep the existing legacy function body as `toSeedanceClipLegacy` and add:

```ts
import { beatWindows, isShotV1, resolveSetup } from '../../core/shot-policy.js';
import { chainsFromV1 } from '../../core/join.js';

const sideWord = (s: string) => (s === 'left' ? 'screen-left' : s === 'right' ? 'screen-right' : 'center frame');

/** image_references 순서 = @Image 번호. start_image 는 medias 에 넣지 않는다(번호 포함 여부 TODO(D1) — 파일럿에서 확인). */
export function referenceMap(ctx: GateContext, cut: DramaCut): { medias: DramaClipMedia[]; tag: Map<string, string>; roles: string[] } {
  const medias: DramaClipMedia[] = [];
  const tag = new Map<string, string>();
  const roles: string[] = [];
  for (const m of cut.cast) {
    const c = ctx.series.characters.find((x) => x.id === m.characterId);
    const look = c?.looks.find((l) => l.id === m.lookId);
    if (!c || !look) throw new PlanError(`출연진 정보 없음: ${m.characterId}/${m.lookId}`, cut.id);
    if (!look.refAssetId) throw new PlanError(`참조 이미지 미등록: ${c.name}(${look.id})`, cut.id);
    medias.push({ role: 'image_references', assetId: look.refAssetId, label: `${c.name}(${look.id}) 얼굴` });
    tag.set(c.id, `@Image${medias.length}`);
    roles.push(`@Image${medias.length} = face of ${c.name} (${look.description})`);
    if (look.outfitRefAssetId) {
      medias.push({ role: 'image_references', assetId: look.outfitRefAssetId, label: `${c.name}(${look.id}) 의상` });
      roles.push(`@Image${medias.length} = outfit of ${c.name} (keep every garment in every frame)`);
    }
  }
  const loc = ctx.series.locations.find((l) => l.id === cut.locationId);
  if (!loc) throw new PlanError(`장소 없음: ${cut.locationId}`, cut.id);
  const setup = resolveSetup(ctx, cut);
  const setRef = setup?.refAssetId ?? loc.refAssetId;
  if (!setRef) throw new PlanError(`장소 참조 이미지 미등록: ${setup?.name ?? loc.name}`, cut.id);
  medias.push({ role: 'image_references', assetId: setRef, label: setup?.name ?? loc.name });
  tag.set('set', `@Image${medias.length}`);
  roles.push(`@Image${medias.length} = the set and camera framing — keep it identical`);
  const i = ctx.episode.cuts.indexOf(cut);
  if (cut.keyframe && chainsFromV1(ctx.episode.cuts[i - 1], cut)) {
    medias.push({ role: 'image_references', assetId: cut.keyframe.assetId, label: '승인 키프레임' });
    tag.set('keyframe', `@Image${medias.length}`);
    roles.push(`@Image${medias.length} = approved composition for this shot`);
  }
  return { medias, tag, roles };
}

function toSeedanceClipV1(ctx: GateContext, cut: DramaCut, opts: VideoOptions): Omit<DramaClipSpec, 'estCredits'> {
  const { medias, tag, roles } = referenceMap(ctx, cut);
  const setup = resolveSetup(ctx, cut);
  const nameOf = (id: string) => ctx.series.characters.find((c) => c.id === id)?.name ?? id;
  const who = (id: string) => tag.get(id) ?? `An off-screen voice of ${nameOf(id)}`;
  const move = cut.cameraMove ?? 'static';
  const camera = `${setup?.cameraEn ?? 'Camera framing as in the set reference'}. ${move === 'static' ? 'Locked-off camera, no camera movement, no cut.' : `Single ${move} camera move only, no cut.`}`;
  const blocking = (cut.blocking ?? []).map((b) => `${who(b.characterId)} stays ${sideWord(b.side)}${cut.blockingChange === 'move' ? ' at the start' : ' for the whole shot'}`).join('; ');
  const dialogue = cut.lines.map((l, idx) => ({ l, idx })).filter((x) => x.l.kind === 'dialogue');
  const windows = beatWindows(cut);
  const beatText = windows
    .map((w) => {
      const said = (w.beat.lines ?? []).map((n) => cut.lines[n]).filter((l) => l && l.kind === 'dialogue').map((l) => `${who(l!.speaker)} says in Korean: "${l!.text}"`).join(' ');
      return `${w.start.toFixed(1)}–${w.end.toFixed(1)}s: ${w.beat.en.replace(/\{([a-z0-9-]+)\}/g, (all, t: string) => tag.get(t) ?? all)}${said ? ` ${said}` : ''}`;
    })
    .join(' ');
  const startImage = cut.keyframe ? 'Start exactly from the start image; background, lighting and wardrobe stay identical to it for the whole shot.' : '';
  const parts = [
    `Reference roles: ${roles.join('. ')}.`,
    startImage,
    `Camera: ${camera}`,
    blocking ? `Blocking: ${blocking}.` : '',
    `Action: ${beatText || cut.visualEn}`,
    dialogue.length ? `Exactly ${dialogue.length} spoken lines, nothing else is said. One speaker at a time, accurate Korean lip sync.` : 'No dialogue spoken on screen.',
    `Sound: ${cut.sfx ? `${cut.sfx}. ` : ''}No background music.`,
    setup ? `Set: ${setup.name}; visible props: ${setup.visiblePropIds.join(', ') || 'none'}.` : ctx.series.locations.find((l) => l.id === cut.locationId)!.anchorText,
    ctx.series.styleEn,
  ].filter((p) => p.length > 0);
  return {
    cutId: cut.id,
    backend: SEEDANCE_2_5.backend,
    model: SEEDANCE_2_5.model,
    durationSec: cut.durationSec,
    params: { mode: 'omni_reference', duration: cut.durationSec, resolution: opts.resolution, draft: opts.draft, aspect_ratio: opts.aspectRatio, generate_audio: true },
    medias,
    prompt: parts.join(' '),
    voiceOver: cut.lines.filter((l) => l.kind === 'monologue').map((l) => ({ speaker: l.speaker, text: l.text })),
  };
}

export function toSeedanceClip(ctx: GateContext, cut: DramaCut, opts: VideoOptions): Omit<DramaClipSpec, 'estCredits'> {
  // 길이·draft 검사는 두 정책 공통(기존 코드의 첫 두 if 를 여기로 올린다)
  if (!Number.isInteger(cut.durationSec) || cut.durationSec < SEEDANCE_2_5.minSec || cut.durationSec > SEEDANCE_2_5.maxSec)
    throw new PlanError(`길이 ${cut.durationSec}초는 Seedance 2.5 범위(${SEEDANCE_2_5.minSec}~${SEEDANCE_2_5.maxSec}초 정수) 밖`, cut.id);
  if (opts.draft && opts.resolution !== '480p') throw new PlanError('draft 는 480p 에서만 가능', cut.id);
  return isShotV1(ctx.episode) ? toSeedanceClipV1(ctx, cut, opts) : toSeedanceClipLegacy(ctx, cut, opts);
}
```

(`toSeedanceClipLegacy` = the current function body minus the two validation `if`s, unchanged otherwise.)

- [ ] **Step 4: Run** `npm test -w @cak/drama-series` → all pass (plan.test.ts legacy assertions still green). tsc 0.

- [ ] **Step 5: Commit**

```bash
git add packages/drama-series/src/adapters/video/seedance-2-5.ts packages/drama-series/test/seedance-v1.test.ts
git commit -m "feat(drama-series): shot-v1 Seedance prompt — reference roles, locked camera, blocking, timed beats, exact line count"
```

---

### Task 7: 프레임 어댑터 (구간 프레임·실제 마지막 프레임·이미지 SSIM·시트)

**Files:**
- Create: `packages/drama-series/src/adapters/frames.ts`
- Test: `packages/drama-series/test/frames.test.ts`

**Interfaces:**
- Consumes: `runFfmpeg`, `FfmpegError`, `ffmpegAvailable`
- Produces:
  - `extractFrameAt(clip: string, sec: number, out: string): void`
  - `extractLastFrame(clip: string, out: string): void` (끝 0.5초를 디코딩해 마지막으로 나온 프레임; 길이 시각 seek 금지)
  - `imageSsim(a: string, b: string): number` (640×360 회색조)
  - `tileSheet(files: string[], cols: number, out: string): void`
  - `sha256File(file: string): string`

- [ ] **Step 1: Write the failing test**

```ts
// packages/drama-series/test/frames.test.ts
import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegAvailable, runFfmpeg } from '../src/adapters/ffmpeg.js';
import { extractFrameAt, extractLastFrame, imageSsim, sha256File, tileSheet } from '../src/adapters/frames.js';

describe.skipIf(!ffmpegAvailable())('frames', () => {
  it('extracts mid and true last frames, compares and tiles them', () => {
    const d = mkdtempSync(join(tmpdir(), 'frames-'));
    const bars = join(d, 'bars.mp4');
    const noise = join(d, 'noise.mp4');
    runFfmpeg(['-y', '-f', 'lavfi', '-i', 'smptebars=s=320x180', '-t', '2', '-pix_fmt', 'yuv420p', bars]);
    runFfmpeg(['-y', '-f', 'lavfi', '-i', 'nullsrc=s=320x180,geq=lum=random(1)*255:cb=128:cr=128', '-t', '1', '-pix_fmt', 'yuv420p', noise]);
    const [a, b, c] = ['a.png', 'b.png', 'c.png'].map((n) => join(d, n));
    extractFrameAt(bars, 1, a!);
    extractLastFrame(bars, b!);
    extractLastFrame(noise, c!);
    expect(imageSsim(a!, b!)).toBeGreaterThan(0.9);
    expect(imageSsim(a!, c!)).toBeLessThan(0.45);
    const sheet = join(d, 'sheet.jpg');
    tileSheet([a!, b!, c!], 2, sheet);
    expect(existsSync(sheet)).toBe(true);
    expect(sha256File(a!)).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run** `npm test -w @cak/drama-series -- frames` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// packages/drama-series/src/adapters/frames.ts
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { FfmpegError, runFfmpeg } from './ffmpeg.js';

export function extractFrameAt(clip: string, sec: number, out: string): void {
  runFfmpeg(['-y', '-ss', sec.toFixed(2), '-i', clip, '-frames:v', '1', out]);
}

/** 끝 0.5초를 디코딩해 마지막으로 나온 프레임을 남긴다(-update 1). 길이 시각 seek 는 마지막 프레임을 놓칠 수 있다. */
export function extractLastFrame(clip: string, out: string): void {
  runFfmpeg(['-y', '-sseof', '-0.5', '-i', clip, '-update', '1', '-frames:v', '9999', out]);
}

export function imageSsim(a: string, b: string): number {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', a, '-i', b, '-filter_complex', '[0:v]scale=640:360,format=gray[x];[1:v]scale=640:360,format=gray[y];[x][y]ssim', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /All:([0-9.]+)/.exec(r.stderr);
  if (r.status !== 0 || !m) throw new FfmpegError(`이미지 비교 실패: ${a} ↔ ${b}`);
  return Number(m[1]);
}

/** 프레임을 같은 크기(480×270, 비율 유지·검은 여백)로 맞춰 cols 열 격자로 붙인다. */
export function tileSheet(files: string[], cols: number, out: string): void {
  if (!files.length) throw new FfmpegError('시트에 넣을 프레임 없음');
  const W = 480;
  const H = 270;
  const inputs = files.flatMap((f) => ['-i', f]);
  const fit = files.map((_, i) => `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1[s${i}]`).join(';');
  const filter = files.length === 1
    ? `${fit};[s0]null`
    : `${fit};${files.map((_, i) => `[s${i}]`).join('')}xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % cols) * W}_${Math.floor(i / cols) * H}`).join('|')}:fill=black`;
  runFfmpeg(['-y', ...inputs, '-filter_complex', filter, '-frames:v', '1', out]);
}

export function sha256File(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
```

- [ ] **Step 4: Run** `npm test -w @cak/drama-series -- frames` → PASS. Full suite + tsc.

- [ ] **Step 5: Commit**

```bash
git add packages/drama-series/src/adapters/frames.ts packages/drama-series/test/frames.test.ts
git commit -m "feat(drama-series): frame adapter — timed frames, true last frame, image SSIM, contact sheet"
```

---

### Task 8: 실행 상태 — 회차 잠금·다음 컷·기록·승인·인계

**Files:**
- Create: `packages/drama-series/src/core/run-state.ts`
- Test: `packages/drama-series/test/run-state.test.ts`

**Interfaces:**
- Consumes: `DramaPlan`, `DramaRunState` 계약, `SHOT_V1.pilotCuts`
- Produces:
  - `class RunError extends Error {}`
  - `newRunState(plan: DramaPlan, owner: DramaRunOwner): DramaRunState`
  - `assertOwner(run: DramaRunState, agent: DramaAgent): void`
  - `recordGenerated(run, cutId, jobId, fileSha256): DramaRunState` (같은 컷의 이전 판정·승인 제거)
  - `applyVerdict(run, cutId, fileSha256, verdict: DramaClipVerdict): DramaRunState`
  - `approveClip(run, cutId, fileSha256, approval: DramaClipApproval): DramaRunState`
  - `handoff(run, from, to, session, note, now): DramaRunState`
  - `interface NextItem { cutId: string; action: 'generate' | 'regenerate'; startImage: DramaStartImage | undefined; useLastFrameOf?: { cutId: string; jobId: string } }`
  - `nextCuts(plan: DramaPlan, run: DramaRunState, agent: DramaAgent, currentSha: (cutId: string) => string | null, pilotCuts?: number): { items: NextItem[]; waiting: string | null; done: boolean }`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/drama-series/test/run-state.test.ts
import { describe, expect, it } from 'vitest';
import type { DramaClipVerdict, DramaPlan } from '@cak/contracts';
import { RunError, applyVerdict, approveClip, handoff, newRunState, nextCuts, recordGenerated } from '../src/core/run-state.js';

const plan: DramaPlan = {
  seriesId: 's', episodeNo: 2, fingerprint: 'fp', totalCredits: 90, budgetCredits: 100, rateMeasuredAt: 'x', createdAt: 'x',
  clips: ['c1', 'c2', 'c3'].map((cutId, i) => ({ cutId, backend: 'b', model: 'm', durationSec: 10, params: {}, medias: [], prompt: 'p', voiceOver: [], estCredits: 30, keyframeAssetId: `k-${cutId}`, startImage: i === 2 ? { source: 'prev-clip', fromCut: 'c2' } : { source: 'keyframe', assetId: `k-${cutId}` }, ...(i === 2 ? { startFromCut: 'c2' } : {}) })),
};
const owner = { agent: 'claude' as const, session: 'sess-1', since: 'now' };
const pass: DramaClipVerdict = { status: 'pass', judge: 'claude-session', at: 'now', items: [] };
const fail: DramaClipVerdict = { status: 'fail', judge: 'claude-session', at: 'now', items: [{ id: 'beat-0', verdict: 'fail', evidenceFrameIds: ['f1'] }] };
const sha = (m: Record<string, string>) => (id: string) => m[id] ?? null;

describe('run state', () => {
  it('opens only the first cut, then waits for verdict and pilot approval', () => {
    let run = newRunState(plan, owner);
    expect(nextCuts(plan, run, 'claude', sha({})).items.map((x) => x.cutId)).toEqual(['c1']);
    run = recordGenerated(run, 'c1', 'job1', 'A');
    expect(nextCuts(plan, run, 'claude', sha({ c1: 'A' })).waiting).toMatch(/판정 대기: c1/);
    run = applyVerdict(run, 'c1', 'A', pass);
    expect(nextCuts(plan, run, 'claude', sha({ c1: 'A' })).waiting).toMatch(/파일럿 사람 승인 대기: c1/);
    run = approveClip(run, 'c1', 'A', { by: 'user', at: 'now', override: false });
    expect(nextCuts(plan, run, 'claude', sha({ c1: 'A' })).items.map((x) => x.cutId)).toEqual(['c2']);
  });
  it('after the pilot, a pass verdict alone opens the next cut and passes the last-frame source', () => {
    let run = newRunState(plan, owner);
    for (const [id, s] of [['c1', 'A'], ['c2', 'B']] as const) {
      run = recordGenerated(run, id, `job-${id}`, s);
      run = applyVerdict(run, id, s, pass);
      run = approveClip(run, id, s, { by: 'user', at: 'now', override: false });
    }
    const n = nextCuts(plan, run, 'claude', sha({ c1: 'A', c2: 'B' }));
    expect(n.items).toEqual([{ cutId: 'c3', action: 'generate', startImage: { source: 'prev-clip', fromCut: 'c2' }, useLastFrameOf: { cutId: 'c2', jobId: 'job-c2' } }]);
    run = recordGenerated(run, 'c3', 'job-c3', 'C');
    run = applyVerdict(run, 'c3', 'C', pass);
    expect(nextCuts(plan, run, 'claude', sha({ c1: 'A', c2: 'B', c3: 'C' })).done).toBe(true);
  });
  it('a fail verdict offers only regeneration of that cut', () => {
    let run = recordGenerated(newRunState(plan, owner), 'c1', 'job1', 'A');
    run = applyVerdict(run, 'c1', 'A', fail);
    expect(nextCuts(plan, run, 'claude', sha({ c1: 'A' })).items).toEqual([{ cutId: 'c1', action: 'regenerate', startImage: { source: 'keyframe', assetId: 'k-c1' } }]);
  });
  it('override approval needs a note and a fail verdict', () => {
    let run = recordGenerated(newRunState(plan, owner), 'c1', 'job1', 'A');
    run = applyVerdict(run, 'c1', 'A', fail);
    expect(() => approveClip(run, 'c1', 'A', { by: 'user', at: 'now', override: true })).toThrow(RunError);
    run = approveClip(run, 'c1', 'A', { by: 'user', at: 'now', override: true, note: '손 위치만 다름 — 허용' });
    expect(nextCuts(plan, run, 'claude', sha({ c1: 'A' })).items.map((x) => x.cutId)).toEqual(['c2']);
  });
  it('replaced clip file voids verdict and approval', () => {
    let run = recordGenerated(newRunState(plan, owner), 'c1', 'job1', 'A');
    run = applyVerdict(run, 'c1', 'A', pass);
    run = approveClip(run, 'c1', 'A', { by: 'user', at: 'now', override: false });
    expect(nextCuts(plan, run, 'claude', sha({ c1: 'Z' })).waiting).toMatch(/파일이 기록과 다름: c1/);
    expect(() => applyVerdict(run, 'c1', 'Z', pass)).toThrow(/sha/);
  });
  it('rejects another agent until a handoff is recorded', () => {
    let run = newRunState(plan, owner);
    expect(() => nextCuts(plan, run, 'codex', sha({}))).toThrow(/claude/);
    run = handoff(run, 'claude', 'codex', 'cx-9', '생성은 claude, 판정은 codex', 'now');
    expect(nextCuts(plan, run, 'codex', sha({})).items[0]!.cutId).toBe('c1');
    expect(run.handoffs).toHaveLength(1);
  });
  it('refuses a run state made for a different plan', () => {
    const run = { ...newRunState(plan, owner), planFingerprint: 'other' };
    expect(() => nextCuts(plan, run, 'claude', sha({}))).toThrow(/계획/);
  });
});
```

- [ ] **Step 2: Run** `npm test -w @cak/drama-series -- run-state` → FAIL.

- [ ] **Step 3: Implement**

```ts
// packages/drama-series/src/core/run-state.ts
import type { DramaAgent, DramaClipApproval, DramaClipVerdict, DramaPlan, DramaRunClip, DramaRunOwner, DramaRunState, DramaStartImage } from '@cak/contracts';
import { SHOT_V1 } from './shot-policy.js';

export class RunError extends Error {}

export function newRunState(plan: DramaPlan, owner: DramaRunOwner): DramaRunState {
  return { planFingerprint: plan.fingerprint, episodeNo: plan.episodeNo, owner, clips: [] };
}

export function assertOwner(run: DramaRunState, agent: DramaAgent): void {
  if (run.owner && run.owner.agent !== agent) throw new RunError(`이 회차는 ${run.owner.agent}(${run.owner.session}) 가 진행 중 — handoff 로 넘겨받을 것`);
}

const find = (run: DramaRunState, cutId: string) => run.clips.find((c) => c.cutId === cutId);
const replace = (run: DramaRunState, clip: DramaRunClip): DramaRunState => ({ ...run, clips: [...run.clips.filter((c) => c.cutId !== clip.cutId), clip] });

export function recordGenerated(run: DramaRunState, cutId: string, jobId: string, fileSha256: string): DramaRunState {
  return replace(run, { cutId, jobId, fileSha256 });
}

function current(run: DramaRunState, cutId: string, fileSha256: string): DramaRunClip {
  const c = find(run, cutId);
  if (!c) throw new RunError(`생성 기록 없음: ${cutId}`);
  if (c.fileSha256 !== fileSha256) throw new RunError(`기록된 클립과 파일 sha 가 다름: ${cutId} — record-clip 부터`);
  return c;
}

export function applyVerdict(run: DramaRunState, cutId: string, fileSha256: string, verdict: DramaClipVerdict): DramaRunState {
  const c = current(run, cutId, fileSha256);
  const { approval: _a, ...rest } = c;
  return replace(run, { ...rest, verdict });
}

export function approveClip(run: DramaRunState, cutId: string, fileSha256: string, approval: DramaClipApproval): DramaRunState {
  const c = current(run, cutId, fileSha256);
  if (!c.verdict) throw new RunError(`판정 전에는 승인할 수 없음: ${cutId}`);
  if (approval.override) {
    if (c.verdict.status !== 'fail') throw new RunError('예외 승인은 fail 판정에만');
    if (!approval.note?.trim()) throw new RunError('예외 승인은 --note 필수');
  } else if (c.verdict.status !== 'pass') throw new RunError(`fail 판정은 --override --note 로만 승인: ${cutId}`);
  return replace(run, { ...c, approval });
}

export function handoff(run: DramaRunState, from: DramaAgent, to: DramaAgent, session: string, note: string, now: string): DramaRunState {
  assertOwner(run, from);
  if (!note.trim()) throw new RunError('handoff 는 --note 필수');
  return { ...run, owner: { agent: to, session, since: now }, handoffs: [...(run.handoffs ?? []), { from, to, at: now, note }] };
}

export interface NextItem { cutId: string; action: 'generate' | 'regenerate'; startImage: DramaStartImage | undefined; useLastFrameOf?: { cutId: string; jobId: string } }

export function nextCuts(plan: DramaPlan, run: DramaRunState, agent: DramaAgent, currentSha: (cutId: string) => string | null, pilotCuts: number = SHOT_V1.pilotCuts): { items: NextItem[]; waiting: string | null; done: boolean } {
  if (run.planFingerprint !== plan.fingerprint) throw new RunError('실행 상태가 다른 계획으로 만들어짐 — 새 계획이면 새 run 파일');
  assertOwner(run, agent);
  for (const [i, spec] of plan.clips.entries()) {
    const rec = find(run, spec.cutId);
    const item = (action: NextItem['action']): NextItem => {
      const base: NextItem = { cutId: spec.cutId, action, startImage: spec.startImage };
      if (spec.startImage?.source === 'prev-clip') {
        const prev = find(run, spec.startImage.fromCut);
        if (prev) base.useLastFrameOf = { cutId: prev.cutId, jobId: prev.jobId };
      }
      return base;
    };
    if (!rec) return { items: [item('generate')], waiting: null, done: false };
    if (currentSha(spec.cutId) !== rec.fileSha256) return { items: [], waiting: `파일이 기록과 다름: ${spec.cutId} — record-clip 으로 다시 기록하고 판정`, done: false };
    if (!rec.verdict) return { items: [], waiting: `판정 대기: ${spec.cutId}`, done: false };
    const overridden = rec.approval?.override === true;
    if (rec.verdict.status === 'fail' && !overridden) return { items: [item('regenerate')], waiting: null, done: false };
    if (i < pilotCuts && !rec.approval) return { items: [], waiting: `파일럿 사람 승인 대기: ${spec.cutId}`, done: false };
  }
  return { items: [], waiting: null, done: true };
}
```

- [ ] **Step 4: Run** `npm test -w @cak/drama-series` → all pass; tsc 0.

- [ ] **Step 5: Commit**

```bash
git add packages/drama-series/src/core/run-state.ts packages/drama-series/test/run-state.test.ts
git commit -m "feat(drama-series): run state — episode lock, pilot gate, per-cut verdict boundary, handoff"
```

---

### Task 9: 컷 판정 — 요청 생성·응답 검증 (+frame-check 참고 수치)

**Files:**
- Create: `packages/drama-series/src/core/verdict.ts`
- Test: `packages/drama-series/test/verdict.test.ts`

**Interfaces:**
- Consumes: `beatWindows`, `scoreTranscript`, `MAX_LINE_CER`, `DramaClipSpec`
- Produces:
  - `interface VerdictFrame { id: string; sec: number | 'last'; purpose: string }`
  - `interface VerdictQuestion { id: string; question: string; frameIds: string[] }`
  - `interface VerdictRequest { cutId: string; fileSha256: string; frames: VerdictFrame[]; dialogue: { lineIndex: number; expected: string; cer: number; pass: boolean }[]; questions: VerdictQuestion[]; ssim: { frameId: string; value: number | null; note: string }[] }`
  - `planVerdictFrames(cut: DramaCut): VerdictFrame[]`
  - `buildVerdictRequest(ctx: GateContext, cut: DramaCut, fileSha256: string, transcript: string, ssimFor: (frameId: string) => number | null): VerdictRequest`
  - `interface VerdictResponse { judge: string; items: DramaVerdictItem[] }`
  - `applyVerdictResponse(req: VerdictRequest, res: VerdictResponse, now: string): DramaClipVerdict`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/drama-series/test/verdict.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseEpisode, parseSeries } from '../src/core/model.js';
import { loadGenre } from '../src/core/genre.js';
import { applyVerdictResponse, buildVerdictRequest, planVerdictFrames } from '../src/core/verdict.js';
import type { GateContext } from '../src/core/gates/types.js';

const fx = (n: string): any => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
function ctx(): GateContext {
  const s = fx('series.json');
  const e = fx('episode.json');
  e.shotPolicy = { version: 'shot-v1', strict: true };
  Object.assign(e.cuts[1], { beats: [{ en: 'Changsik grabs the collar.', lines: [0] }, { en: 'Minjae pleads.', lines: [1] }], blocking: [{ characterId: 'changsik', side: 'left' }, { characterId: 'minjae', side: 'right' }], continuesFromPrev: true });
  return { series: parseSeries(s), episode: parseEpisode(e), genre: loadGenre(s.genreId) };
}
const c2 = () => ctx().episode.cuts[1]!;

describe('clip verdict', () => {
  it('samples start/mid/end of every beat plus first and true last frame', () => {
    const f = planVerdictFrames(c2());
    expect(f[0]).toMatchObject({ id: 'f-first', sec: 0 });
    expect(f.at(-1)).toMatchObject({ id: 'f-last', sec: 'last' });
    expect(f.filter((x) => x.id.startsWith('f-b0-'))).toHaveLength(3);
    expect(f.filter((x) => x.id.startsWith('f-b1-'))).toHaveLength(3);
  });
  it('generates one question per beat plus cast, background and join, from the script', () => {
    const c = ctx();
    const r = buildVerdictRequest(c, c.episode.cuts[1]!, 'S', '야 막내 이번 주 몫 내놔 제 일당이에요 제발요', () => 0.7);
    expect(r.questions.map((q) => q.id)).toEqual(['beat-0', 'beat-1', 'cast', 'background', 'join']);
    expect(r.questions[0]!.question).toContain('Changsik grabs the collar.');
    expect(r.questions.find((q) => q.id === 'cast')!.question).toContain('screen-left');
    expect(r.dialogue.every((d) => d.pass)).toBe(true);
    expect(r.ssim[0]!.note).toMatch(/참고/);
  });
  it('empty transcript fails dialogue item', () => {
    const c = ctx();
    const r = buildVerdictRequest(c, c.episode.cuts[1]!, 'S', '', () => null);
    expect(r.dialogue.every((d) => !d.pass)).toBe(true);
    const v = applyVerdictResponse(r, { judge: 'j', items: r.questions.map((q) => ({ id: q.id, verdict: 'pass', evidenceFrameIds: [q.frameIds[0]!] })) }, 'now');
    expect(v.status).toBe('fail');
    expect(v.items.find((i) => i.id === 'dialogue')!.verdict).toBe('fail');
  });
  it('passes only when every item passes with evidence from the request frames', () => {
    const c = ctx();
    const r = buildVerdictRequest(c, c.episode.cuts[1]!, 'S', '야 막내 이번 주 몫 내놔 제 일당이에요 제발요', () => null);
    const good = { judge: 'claude-session', items: r.questions.map((q) => ({ id: q.id, verdict: 'pass' as const, evidenceFrameIds: [q.frameIds[0]!] })) };
    expect(applyVerdictResponse(r, good, 'now').status).toBe('pass');
    const missing = { ...good, items: good.items.slice(1) };
    expect(applyVerdictResponse(r, missing, 'now')).toMatchObject({ status: 'fail' });
    expect(applyVerdictResponse(r, missing, 'now').items.find((i) => i.id === 'beat-0')!.note).toMatch(/응답 없음/);
    const noEvidence = { ...good, items: good.items.map((i, k) => (k === 0 ? { ...i, evidenceFrameIds: [] } : i)) };
    expect(applyVerdictResponse(r, noEvidence, 'now').status).toBe('fail');
    const foreign = { ...good, items: good.items.map((i, k) => (k === 0 ? { ...i, evidenceFrameIds: ['f-zzz'] } : i)) };
    expect(applyVerdictResponse(r, foreign, 'now').status).toBe('fail');
  });
});
```

- [ ] **Step 2: Run** `npm test -w @cak/drama-series -- verdict` → FAIL.

- [ ] **Step 3: Implement**

```ts
// packages/drama-series/src/core/verdict.ts
import type { DramaClipVerdict, DramaCut, DramaVerdictItem } from '@cak/contracts';
import type { GateContext } from './gates/types.js';
import { beatWindows, resolveSetup } from './shot-policy.js';
import { MAX_LINE_CER, scoreTranscript } from './transcript.js';

export interface VerdictFrame { id: string; sec: number | 'last'; purpose: string }
export interface VerdictQuestion { id: string; question: string; frameIds: string[] }
export interface VerdictRequest {
  cutId: string;
  fileSha256: string;
  frames: VerdictFrame[];
  dialogue: { lineIndex: number; expected: string; cer: number; pass: boolean }[];
  questions: VerdictQuestion[];
  ssim: { frameId: string; value: number | null; note: string }[];
}
export interface VerdictResponse { judge: string; items: DramaVerdictItem[] }

const r1 = (n: number) => Math.round(n * 10) / 10;

export function planVerdictFrames(cut: DramaCut): VerdictFrame[] {
  const frames: VerdictFrame[] = [{ id: 'f-first', sec: 0, purpose: '첫 프레임' }];
  for (const w of beatWindows(cut)) {
    const end = Math.max(w.start, w.end - 0.1);
    frames.push(
      { id: `f-b${w.index}-s`, sec: r1(w.start + 0.1), purpose: `비트 ${w.index} 시작` },
      { id: `f-b${w.index}-m`, sec: r1((w.start + w.end) / 2), purpose: `비트 ${w.index} 중간` },
      { id: `f-b${w.index}-e`, sec: r1(end), purpose: `비트 ${w.index} 끝` },
    );
  }
  frames.push({ id: 'f-last', sec: 'last', purpose: '실제 마지막 프레임' });
  return frames;
}

export function buildVerdictRequest(ctx: GateContext, cut: DramaCut, fileSha256: string, transcript: string, ssimFor: (frameId: string) => number | null): VerdictRequest {
  const frames = planVerdictFrames(cut);
  const all = frames.map((f) => f.id);
  const dialogue = cut.lines.map((l, i) => ({ l, i })).filter((x) => x.l.kind === 'dialogue');
  const scores = scoreTranscript(dialogue.map((x) => x.l.text), transcript);
  const name = (id: string) => ctx.series.characters.find((c) => c.id === id)?.name ?? id;
  const questions: VerdictQuestion[] = beatWindows(cut).map((w) => ({
    id: `beat-${w.index}`,
    question: `프레임 f-b${w.index}-s/m/e (${w.start}–${w.end}초)에 이 행동이 실제로 일어나는가: "${w.beat.en}"`,
    frameIds: [`f-b${w.index}-s`, `f-b${w.index}-m`, `f-b${w.index}-e`],
  }));
  const sides = (cut.blocking ?? []).map((b) => `${name(b.characterId)}=${b.side === 'left' ? 'screen-left' : b.side === 'right' ? 'screen-right' : 'center'}`).join(', ');
  const looks = cut.cast.map((m) => `${name(m.characterId)}: ${ctx.series.characters.find((c) => c.id === m.characterId)?.looks.find((l) => l.id === m.lookId)?.description ?? ''}`).join(' / ');
  questions.push({ id: 'cast', question: `출연진 전원(${cut.cast.map((m) => name(m.characterId)).join(', ')})이 나오고, 위치(${sides || '지정 없음'})와 의상(${looks})이 모든 표본 프레임에서 유지되는가`, frameIds: all });
  const setup = resolveSetup(ctx, cut);
  questions.push({ id: 'background', question: `배경이 승인 키프레임과 같은 세트인가(${setup ? `${setup.name}, 보여야 할 소품: ${(cut.usedPropIds ?? []).join(', ') || '없음'}` : '장소 참조'}). 그림에 없던 세트 요소가 새로 생기지 않았는가`, frameIds: all });
  const i = ctx.episode.cuts.indexOf(cut);
  if (i > 0 && cut.continuesFromPrev) questions.push({ id: 'join', question: `첫 프레임이 앞 컷(${ctx.episode.cuts[i - 1]!.id}) 마지막 장면에서 자연스럽게 이어지는가`, frameIds: ['f-first'] });
  const static_ = (cut.cameraMove ?? 'static') === 'static';
  return {
    cutId: cut.id,
    fileSha256,
    frames,
    dialogue: scores.map((s, k) => ({ lineIndex: dialogue[k]!.i, expected: s.expected, cer: Math.round(s.cer * 100) / 100, pass: s.cer <= MAX_LINE_CER })),
    questions,
    ssim: frames.map((f) => ({ frameId: f.id, value: static_ ? ssimFor(f.id) : null, note: static_ ? '키프레임 대비 SSIM — 참고 수치, 판정 근거 아님' : '카메라 이동 컷 — SSIM N/A, 사람·판정자 검토' })),
  };
}

export function applyVerdictResponse(req: VerdictRequest, res: VerdictResponse, now: string): DramaClipVerdict {
  const frameIds = new Set(req.frames.map((f) => f.id));
  const items: DramaVerdictItem[] = [];
  const dialoguePass = req.dialogue.every((d) => d.pass);
  items.push({ id: 'dialogue', verdict: dialoguePass ? 'pass' : 'fail', evidenceFrameIds: [], note: req.dialogue.map((d) => `${d.lineIndex}:CER ${d.cer}`).join(', ') || '대사 없음' });
  for (const q of req.questions) {
    const a = res.items.find((x) => x.id === q.id);
    if (!a) { items.push({ id: q.id, verdict: 'fail', evidenceFrameIds: [], note: '판정 응답 없음' }); continue; }
    const ev = a.evidenceFrameIds.filter((f) => frameIds.has(f));
    if (!a.evidenceFrameIds.length || ev.length !== a.evidenceFrameIds.length) { items.push({ id: q.id, verdict: 'fail', evidenceFrameIds: ev, note: '근거 프레임 없음 또는 요청에 없는 프레임' }); continue; }
    items.push({ id: q.id, verdict: a.verdict, evidenceFrameIds: ev, ...(a.note ? { note: a.note } : {}) });
  }
  return { status: items.every((i) => i.verdict === 'pass') ? 'pass' : 'fail', judge: res.judge, at: now, items };
}
```

- [ ] **Step 4: Run** `npm test -w @cak/drama-series` → all pass; tsc 0.

- [ ] **Step 5: Commit**

```bash
git add packages/drama-series/src/core/verdict.ts packages/drama-series/test/verdict.test.ts
git commit -m "feat(drama-series): clip verdict — script-derived questions, deterministic dialogue, evidence-checked response"
```

---

### Task 10: 토큰 기반 교차 리뷰 (Ed25519 서명, 비밀 조회 인터페이스)

**Files:**
- Create: `packages/drama-series/src/core/review.ts`
- Create: `packages/drama-series/src/adapters/secrets/gcp.ts`
- Test: `packages/drama-series/test/review.test.ts`

**Interfaces:**
- Consumes: `canonical`, `fingerprintOf`, `toReport`
- Produces:
  - `class ReviewError extends Error {}`
  - `interface PublicKeyRecord { agent: DramaAgent; keyId: string; publicKeyPem: string; revoked?: boolean }`
  - `interface PrivateKeySource { privateKeyPem(agent: DramaAgent): string }`
  - `newReviewRequest(args: { episodePath: string; fingerprint: string; author: DramaAgent; reviewer: DramaAgent; summary: string; now: Date; ttlHours?: number; random?: () => Buffer }): DramaReviewRequest` (token `rv_` + 26자 base32)
  - `signReviewResponse(body: Omit<DramaReviewResponse, 'signature'>, keys: PrivateKeySource): DramaReviewResponse`
  - `verifyAndApplyReview(args: { request: DramaReviewRequest; response: DramaReviewResponse; currentFingerprint: string; publicKeys: PublicKeyRecord[]; used: Set<string>; now: Date }): DramaGateReport` (throws `ReviewError` with 사유)
  - `pendingForAgent(requests: DramaReviewRequest[], responses: DramaReviewResponse[], agent: DramaAgent, now: Date): DramaReviewRequest[]`
  - `gcpSecretSource(project: string, run?: (args: string[], input?: string) => { status: number | null; stdout: string; stderr: string }): PrivateKeySource & { store(agent: DramaAgent, pem: string): void }`
  - `secretName(agent: DramaAgent): string` → `cak-drama-review-${agent}-ed25519`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/drama-series/test/review.test.ts
import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import type { DramaAgent } from '@cak/contracts';
import { ReviewError, newReviewRequest, pendingForAgent, signReviewResponse, verifyAndApplyReview, type PublicKeyRecord } from '../src/core/review.js';
import { gcpSecretSource, secretName } from '../src/adapters/secrets/gcp.js';

const pair = () => generateKeyPairSync('ed25519');
const kp = { claude: pair(), codex: pair() };
const priv = { privateKeyPem: (a: DramaAgent) => kp[a].privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
const pubs: PublicKeyRecord[] = (['claude', 'codex'] as const).map((agent) => ({ agent, keyId: `${agent}-1`, publicKeyPem: kp[agent].publicKey.export({ type: 'spki', format: 'pem' }).toString() }));
const now = new Date('2026-10-08T10:00:00Z');
const req = newReviewRequest({ episodePath: 'docs/videos/x/ep02.json', fingerprint: 'fp1', author: 'claude', reviewer: 'codex', summary: 's', now });
const respond = (over: Partial<Parameters<typeof signReviewResponse>[0]> = {}) =>
  signReviewResponse({ token: req.token, reviewedFingerprint: 'fp1', verdict: 'pass', findings: [], reviewer: 'codex', respondedAt: now.toISOString(), keyId: 'codex-1', ...over }, priv);
const apply = (o: Partial<Parameters<typeof verifyAndApplyReview>[0]> = {}) =>
  verifyAndApplyReview({ request: req, response: respond(), currentFingerprint: 'fp1', publicKeys: pubs, used: new Set(), now, ...o });

describe('token review', () => {
  it('issues a random token with expiry', () => {
    expect(req.token).toMatch(/^rv_[a-z2-7]{26}$/);
    expect(new Date(req.expiresAt).getTime() - now.getTime()).toBe(72 * 3600 * 1000);
    expect(() => newReviewRequest({ episodePath: 'e', fingerprint: 'f', author: 'claude', reviewer: 'claude', summary: 's', now })).toThrow(ReviewError);
  });
  it('accepts a signed pass from the other agent for the current script', () => {
    const r = apply();
    expect(r).toMatchObject({ gate: 'cross-review', ok: true, fingerprint: 'fp1' });
  });
  it('records changes as a failing report', () => {
    expect(apply({ response: respond({ verdict: 'changes', findings: ['3컷 동기 약함'] }) }).ok).toBe(false);
  });
  it('rejects a response whose fingerprint is no longer current', () => {
    expect(() => apply({ currentFingerprint: 'fp2' })).toThrow(/지문/);
    expect(() => apply({ response: respond({ reviewedFingerprint: 'fp0' }) })).toThrow(/지문/);
  });
  it('rejects reuse, expiry, wrong reviewer, forged and revoked signatures', () => {
    expect(() => apply({ used: new Set([req.token]) })).toThrow(/이미 사용/);
    expect(() => apply({ now: new Date('2026-10-12T00:00:00Z') })).toThrow(/만료/);
    expect(() => apply({ response: respond({ reviewer: 'claude', keyId: 'claude-1' }) })).toThrow(/리뷰어/);
    const forged = { ...respond(), verdict: 'pass' as const, findings: ['조작'] };
    expect(() => apply({ response: forged })).toThrow(/서명/);
    const claudeSigned = signReviewResponse({ token: req.token, reviewedFingerprint: 'fp1', verdict: 'pass', findings: [], reviewer: 'codex', respondedAt: now.toISOString(), keyId: 'codex-1' }, { privateKeyPem: () => priv.privateKeyPem('claude') });
    expect(() => apply({ response: claudeSigned })).toThrow(/서명/);
    expect(() => apply({ publicKeys: pubs.map((p) => (p.agent === 'codex' ? { ...p, revoked: true } : p)) })).toThrow(/폐기/);
  });
  it('lists only unanswered, unexpired requests for an agent', () => {
    const other = newReviewRequest({ episodePath: 'e', fingerprint: 'f', author: 'codex', reviewer: 'claude', summary: 's', now });
    expect(pendingForAgent([req, other], [], 'codex', now).map((r) => r.token)).toEqual([req.token]);
    expect(pendingForAgent([req, other], [respond()], 'codex', now)).toEqual([]);
    expect(pendingForAgent([req], [], 'codex', new Date('2026-10-12T00:00:00Z'))).toEqual([]);
  });
});

describe('gcp secret source', () => {
  it('reads the latest version via gcloud without touching disk and names secrets per agent', () => {
    const calls: string[][] = [];
    const src = gcpSecretSource('gen-lang-client-0881453127', (args, input) => { calls.push([...args, input ?? '']); return { status: 0, stdout: 'PEM', stderr: '' }; });
    expect(src.privateKeyPem('codex')).toBe('PEM');
    expect(calls[0]).toEqual(['secrets', 'versions', 'access', 'latest', '--secret', 'cak-drama-review-codex-ed25519', '--project', 'gen-lang-client-0881453127', '']);
    src.store('claude', 'SECRET');
    expect(calls.at(-1)).toEqual(['secrets', 'versions', 'add', 'cak-drama-review-claude-ed25519', '--data-file=-', '--project', 'gen-lang-client-0881453127', 'SECRET']);
    expect(secretName('claude')).toBe('cak-drama-review-claude-ed25519');
  });
  it('surfaces gcloud failures without echoing secret material', () => {
    const src = gcpSecretSource('p', () => ({ status: 1, stdout: '', stderr: 'PERMISSION_DENIED' }));
    expect(() => src.privateKeyPem('claude')).toThrow(/PERMISSION_DENIED/);
  });
});
```

- [ ] **Step 2: Run** `npm test -w @cak/drama-series -- review` → FAIL.

- [ ] **Step 3: Implement `adapters/secrets/gcp.ts`**

```ts
// packages/drama-series/src/adapters/secrets/gcp.ts
import { spawnSync } from 'node:child_process';
import type { DramaAgent } from '@cak/contracts';
import type { PrivateKeySource } from '../../core/review.js';

export const DEFAULT_REVIEW_PROJECT = 'gen-lang-client-0881453127';
export const secretName = (agent: DramaAgent) => `cak-drama-review-${agent}-ed25519`;

type Run = (args: string[], input?: string) => { status: number | null; stdout: string; stderr: string };
const gcloud: Run = (args, input) => {
  const r = spawnSync('gcloud', args, { encoding: 'utf8', ...(input !== undefined ? { input } : {}) });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? (r.error?.message ?? '') };
};

/** 개인 키는 실행 시점에 조회해 메모리에서만 쓴다. 디스크·로그에 남기지 않는다. */
export function gcpSecretSource(project: string, run: Run = gcloud): PrivateKeySource & { store(agent: DramaAgent, pem: string): void } {
  return {
    privateKeyPem(agent) {
      const r = run(['secrets', 'versions', 'access', 'latest', '--secret', secretName(agent), '--project', project]);
      if (r.status !== 0 || !r.stdout.trim()) throw new Error(`비밀 조회 실패(${secretName(agent)}): ${r.stderr.trim().slice(0, 200)}`);
      return r.stdout;
    },
    store(agent, pem) {
      const r = run(['secrets', 'versions', 'add', secretName(agent), '--data-file=-', '--project', project], pem);
      if (r.status !== 0) throw new Error(`비밀 저장 실패(${secretName(agent)}): ${r.stderr.trim().slice(0, 200)}`);
    },
  };
}
```

- [ ] **Step 4: Implement `core/review.ts`**

```ts
// packages/drama-series/src/core/review.ts
import { createPrivateKey, createPublicKey, randomBytes, sign, verify } from 'node:crypto';
import type { DramaAgent, DramaGateReport, DramaReviewRequest, DramaReviewResponse } from '@cak/contracts';
import { canonical } from './fingerprint.js';
import { toReport } from './report.js';

export class ReviewError extends Error {}
export interface PublicKeyRecord { agent: DramaAgent; keyId: string; publicKeyPem: string; revoked?: boolean }
export interface PrivateKeySource { privateKeyPem(agent: DramaAgent): string }

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
function base32(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const b of buf) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function newReviewRequest(a: { episodePath: string; fingerprint: string; author: DramaAgent; reviewer: DramaAgent; summary: string; now: Date; ttlHours?: number; random?: () => Buffer }): DramaReviewRequest {
  if (a.author === a.reviewer) throw new ReviewError('리뷰어는 작성자와 달라야 함');
  const token = `rv_${base32((a.random ?? (() => randomBytes(16)))()).slice(0, 26)}`;
  const expires = new Date(a.now.getTime() + (a.ttlHours ?? 72) * 3600 * 1000);
  return { token, kind: 'scenario', episodePath: a.episodePath, fingerprint: a.fingerprint, author: a.author, reviewer: a.reviewer, createdAt: a.now.toISOString(), expiresAt: expires.toISOString(), summary: a.summary };
}

const signedBody = (r: Omit<DramaReviewResponse, 'signature'>) => Buffer.from(canonical(r));

export function signReviewResponse(body: Omit<DramaReviewResponse, 'signature'>, keys: PrivateKeySource): DramaReviewResponse {
  const key = createPrivateKey(keys.privateKeyPem(body.reviewer));
  return { ...body, signature: sign(null, signedBody(body), key).toString('base64') };
}

export function verifyAndApplyReview(a: { request: DramaReviewRequest; response: DramaReviewResponse; currentFingerprint: string; publicKeys: PublicKeyRecord[]; used: Set<string>; now: Date }): DramaGateReport {
  const { request: q, response: r } = a;
  if (r.token !== q.token) throw new ReviewError('토큰 불일치');
  if (a.used.has(q.token)) throw new ReviewError('이미 사용된 토큰');
  if (a.now.getTime() > new Date(q.expiresAt).getTime()) throw new ReviewError('만료된 토큰');
  if (q.author === q.reviewer || r.reviewer !== q.reviewer) throw new ReviewError(`리뷰어 불일치(요청 ${q.reviewer}, 응답 ${r.reviewer}, 작성자 ${q.author})`);
  if (r.reviewedFingerprint !== q.fingerprint || q.fingerprint !== a.currentFingerprint) throw new ReviewError('대본 지문 불일치 — 리뷰 이후 대본이 바뀜, review-request 부터 다시');
  const pub = a.publicKeys.find((k) => k.agent === r.reviewer && k.keyId === r.keyId);
  if (!pub) throw new ReviewError(`공개 키 없음: ${r.reviewer}/${r.keyId}`);
  if (pub.revoked) throw new ReviewError(`폐기된 키: ${r.keyId}`);
  const { signature, ...body } = r;
  const ok = verify(null, signedBody(body), createPublicKey(pub.publicKeyPem), Buffer.from(signature, 'base64'));
  if (!ok) throw new ReviewError('서명 검증 실패');
  const findings = r.verdict === 'pass'
    ? [{ severity: 'info' as const, message: `교차 리뷰 pass — ${r.reviewer} (${q.token})` }]
    : [{ severity: 'block' as const, message: `교차 리뷰 수정 요청 — ${r.reviewer} (${q.token})`, evidence: r.findings.join(' / ') }];
  return toReport('cross-review', 'episode', findings, a.currentFingerprint);
}

export function pendingForAgent(requests: DramaReviewRequest[], responses: DramaReviewResponse[], agent: DramaAgent, now: Date): DramaReviewRequest[] {
  const answered = new Set(responses.map((r) => r.token));
  return requests.filter((q) => q.reviewer === agent && !answered.has(q.token) && now.getTime() <= new Date(q.expiresAt).getTime());
}
```

- [ ] **Step 5: Run** `npm test -w @cak/drama-series` → all pass; tsc 0.

- [ ] **Step 6: Commit**

```bash
git add packages/drama-series/src/core/review.ts packages/drama-series/src/adapters/secrets/gcp.ts packages/drama-series/test/review.test.ts
git commit -m "feat(drama-series): token-based cross-review with Ed25519 signatures and GCP secret source"
```

---

### Task 11: CLI 연결 (키프레임·실행 상태·판정·리뷰·키 생성)

**Files:**
- Modify: `packages/drama-series/src/cli/index.ts`
- Test: `packages/drama-series/test/cli-v1.test.ts`

**Interfaces:**
- Consumes: Tasks 4, 7, 8, 9, 10
- Produces CLI commands (stdout JSON, exit 0/1/2 as existing):
  - `keyframe-build --series --episode --aspect <16:9|9:16> --out req.json`
  - `keyframe-sheet --images <dir: cutId.png> --out sheet.jpg [--cols 4]`
  - `approve-keyframe --series --episode --cut --asset <job_id> --file <png> --aspect --by`
  - `plan … [--keyframes <dir: cutId.png>]` (v1: 파일 sha 확인용)
  - `run-init --plan plan.json --run run.json --agent <claude|codex> --session <id>`
  - `next --plan --run --agent --clips <dir: cutId.mp4>`
  - `record-clip --run --cut --job <job_id> --file <mp4> --agent`
  - `verdict-build --series --episode --cut --file <mp4> --transcript <whisper.json> --work <dir> [--keyframe <png>] --out req.json`
  - `verdict-apply --run --request req.json --response res.json --agent`
  - `approve-clip --run --cut --file <mp4> --by [--override --note]` (사람 승인 — `--agent` 무관, owner 검사 안 함)
  - `handoff --run --from --to --session --note`
  - `review-request --series --episode --author --reviewer --dir <reviews dir> --mailbox <dir> --summary`
  - `review-inbox --dir <reviews dir> --agent`
  - `review-respond --dir --token --verdict pass|changes --findings "a|b" --agent --key-id [--sm-project]`
  - `cross-review-apply --series --episode --dir --token --gates <dir> [--keys <dir>]`
  - `review-keygen --agent --key-id [--sm-project] --keys <dir>` (gcloud 실행 — 사용자 승인 후에만 실행)

- [ ] **Step 1: Write the failing CLI tests** (reuse `cli()`/`workspace()` pattern from `test/cli.test.ts`; no gcloud — only offline paths)

```ts
// packages/drama-series/test/cli-v1.test.ts
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = fileURLToPath(new URL('..', import.meta.url));
const FX = fileURLToPath(new URL('./fixtures/', import.meta.url));
const cli = (args: string[]) => { const r = spawnSync('npx', ['tsx', 'src/cli/index.ts', ...args], { cwd: PKG, encoding: 'utf8' }); return { code: r.status, json: JSON.parse(r.stdout) }; };

function v1Workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'drama-v1-'));
  const p = (n: string) => join(dir, n);
  const s = JSON.parse(readFileSync(join(FX, 'series.json'), 'utf8'));
  const e = JSON.parse(readFileSync(join(FX, 'episode.json'), 'utf8'));
  s.locations[0].setups = [{ id: 'front', name: '정면', cameraEn: 'static eye-level medium-wide shot of the aisle', refAssetId: 'set1', visiblePropIds: [] }];
  e.shotPolicy = { version: 'shot-v1', strict: true };
  e.authoredBy = 'claude';
  for (const c of e.cuts) { if (c.locationId === 'aisle') c.setupId = 'front'; c.blocking = c.cast.map((m: any, i: number) => ({ characterId: m.characterId, side: i ? 'right' : 'left' })); c.beats = [{ en: 'The scene plays out.', lines: c.lines.map((_: any, i: number) => i) }]; }
  writeFileSync(p('series.json'), JSON.stringify(s));
  writeFileSync(p('episode.json'), JSON.stringify(e));
  copyFileSync(join(FX, 'topics.json'), p('topics.json'));
  return { dir, p, base: ['--series', p('series.json'), '--episode', p('episode.json')] };
}

describe('cli shot-v1', () => {
  it('keyframe-build writes one request per cut with the requested aspect', () => {
    const w = v1Workspace();
    const r = cli(['keyframe-build', ...w.base, '--aspect', '9:16', '--out', w.p('kf.json')]);
    expect(r.code).toBe(0);
    const reqs = JSON.parse(readFileSync(w.p('kf.json'), 'utf8'));
    expect(reqs.length).toBe(JSON.parse(readFileSync(w.p('episode.json'), 'utf8')).cuts.length);
    expect(reqs[0].aspect_ratio).toBe('9:16');
  });
  it('approve-keyframe records digest and file hash without changing the content fingerprint', () => {
    const w = v1Workspace();
    writeFileSync(w.p('c1.png'), 'png-bytes');
    const v1 = cli(['validate', ...w.base, '--gates', w.p('gates')]);
    const r = cli(['approve-keyframe', ...w.base, '--cut', 'c1', '--asset', 'job-1', '--file', w.p('c1.png'), '--aspect', '16:9', '--by', 'user']);
    expect(r.code).toBe(0);
    const v2 = cli(['validate', ...w.base, '--gates', w.p('gates')]);
    expect(v2.json.reports[0].fingerprint).toBe(v1.json.reports[0].fingerprint);
    const ep = JSON.parse(readFileSync(w.p('episode.json'), 'utf8'));
    expect(ep.cuts[0].keyframe).toMatchObject({ assetId: 'job-1', approvedBy: 'user' });
    expect(ep.cuts[0].keyframe.fileSha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it('review-request → review-inbox lists the token for the reviewer only', () => {
    const w = v1Workspace();
    const r = cli(['review-request', ...w.base, '--author', 'claude', '--reviewer', 'codex', '--dir', w.p('reviews'), '--mailbox', w.p('mb'), '--summary', 'ep 시나리오']);
    expect(r.code).toBe(0);
    expect(r.json.token).toMatch(/^rv_/);
    expect(cli(['review-inbox', '--dir', w.p('reviews'), '--agent', 'codex']).json.pending.map((x: any) => x.token)).toEqual([r.json.token]);
    expect(cli(['review-inbox', '--dir', w.p('reviews'), '--agent', 'claude']).json.pending).toEqual([]);
  });
  it('next refuses a different agent than the run owner', () => {
    const w = v1Workspace();
    const plan = { seriesId: 's', episodeNo: 1, fingerprint: 'fp', clips: [{ cutId: 'c1', backend: 'b', model: 'm', durationSec: 10, params: {}, medias: [], prompt: 'p', voiceOver: [], estCredits: 30 }], totalCredits: 30, budgetCredits: 30, rateMeasuredAt: 'x', createdAt: 'x' };
    writeFileSync(w.p('plan.json'), JSON.stringify(plan));
    expect(cli(['run-init', '--plan', w.p('plan.json'), '--run', w.p('run.json'), '--agent', 'claude', '--session', 's1']).code).toBe(0);
    expect(cli(['next', '--plan', w.p('plan.json'), '--run', w.p('run.json'), '--agent', 'claude', '--clips', w.p('clips')]).json.items[0].cutId).toBe('c1');
    const other = cli(['next', '--plan', w.p('plan.json'), '--run', w.p('run.json'), '--agent', 'codex', '--clips', w.p('clips')]);
    expect(other.code).toBe(1);
    expect(other.json.error ?? other.json.problem).toMatch(/claude/);
  });
});
```

- [ ] **Step 2: Run** `npm test -w @cak/drama-series -- cli-v1` → FAIL (unknown command).

- [ ] **Step 3: Implement commands** — add to imports and `switch` in `cli/index.ts`:

```ts
import { createHash } from 'node:crypto';
import { generateKeyPairSync } from 'node:crypto';
import type { DramaAgent, DramaPlan, DramaReviewRequest, DramaReviewResponse, DramaRunState } from '@cak/contracts';
import { approveKeyframe, buildKeyframeRequests, type Aspect } from '../core/keyframe.js';
import { tileSheet, extractFrameAt, extractLastFrame, imageSsim, sha256File } from '../adapters/frames.js';
import { RunError, applyVerdict, approveClip, handoff, newRunState, nextCuts, recordGenerated } from '../core/run-state.js';
import { applyVerdictResponse, buildVerdictRequest, type VerdictRequest, type VerdictResponse } from '../core/verdict.js';
import { ReviewError, newReviewRequest, pendingForAgent, signReviewResponse, verifyAndApplyReview, type PublicKeyRecord } from '../core/review.js';
import { DEFAULT_REVIEW_PROJECT, gcpSecretSource, secretName } from '../adapters/secrets/gcp.js';

const AGENTS = ['claude', 'codex'] as const;
function agentOf(v: string): DramaAgent {
  if (!(AGENTS as readonly string[]).includes(v)) throw new UsageError('--agent/--author/--reviewer 는 claude|codex');
  return v as DramaAgent;
}
function aspectOf(v: string | undefined): Aspect {
  const a = v ?? '16:9';
  if (a !== '16:9' && a !== '9:16') throw new UsageError('--aspect 는 16:9|9:16');
  return a;
}
const fileShaIn = (dir: string | undefined, ext: string) => (cutId: string) => {
  if (!dir) return null;
  const f = join(abs(dir), `${cutId}.${ext}`);
  return existsSync(f) ? sha256File(f) : null;
};
const KEYS_DIR = fileURLToPath(new URL('../../review-keys/', import.meta.url));
function loadPublicKeys(dir: string): PublicKeyRecord[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.pub.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as PublicKeyRecord);
}
const readAll = <T>(dir: string, suffix: string): T[] => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(suffix)).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as T) : []);
```

(`fileURLToPath` import from `node:url` at the top.)

Cases (inside `switch`):

```ts
    case 'keyframe-build': {
      const o = opts(rest, { series: 'string', episode: 'string', aspect: 'string', out: 'string' });
      const reqs = buildKeyframeRequests(loadCtx(o), aspectOf(optStr(o, 'aspect')));
      writeJson(req(o, 'out'), reqs);
      out({ ok: true, requests: reqs.length, out: abs(req(o, 'out')) });
      return 0;
    }
    case 'keyframe-sheet': {
      const o = opts(rest, { images: 'string', out: 'string', cols: 'string' });
      const dir = abs(req(o, 'images'));
      const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort().map((f) => join(dir, f));
      tileSheet(files, Number(optStr(o, 'cols') ?? 4), abs(req(o, 'out')));
      out({ ok: true, frames: files.map((f) => basename(f)), out: abs(req(o, 'out')) });
      return 0;
    }
    case 'approve-keyframe': {
      const o = opts(rest, { series: 'string', episode: 'string', cut: 'string', asset: 'string', file: 'string', aspect: 'string', by: 'string' });
      const ctx = loadCtx(o);
      const episode = approveKeyframe(ctx, req(o, 'cut'), req(o, 'asset'), sha256File(abs(req(o, 'file'))), aspectOf(optStr(o, 'aspect')), req(o, 'by'), new Date().toISOString());
      writeJson(req(o, 'episode'), episode);
      out({ ok: true, cut: req(o, 'cut'), keyframe: episode.cuts.find((c) => c.id === req(o, 'cut'))!.keyframe });
      return 0;
    }
    case 'run-init': {
      const o = opts(rest, { plan: 'string', run: 'string', agent: 'string', session: 'string' });
      const plan = readJson(req(o, 'plan')) as DramaPlan;
      if (existsSync(abs(req(o, 'run')))) throw new UsageError('이미 run 파일이 있음 — 새 계획이면 다른 파일 이름');
      writeJson(req(o, 'run'), newRunState(plan, { agent: agentOf(req(o, 'agent')), session: req(o, 'session'), since: new Date().toISOString() }));
      out({ ok: true, run: abs(req(o, 'run')) });
      return 0;
    }
    case 'next': {
      const o = opts(rest, { plan: 'string', run: 'string', agent: 'string', clips: 'string' });
      const plan = readJson(req(o, 'plan')) as DramaPlan;
      const run = readJson(req(o, 'run')) as DramaRunState;
      try {
        const n = nextCuts(plan, run, agentOf(req(o, 'agent')), fileShaIn(req(o, 'clips'), 'mp4'));
        out({ ok: true, ...n });
        return 0;
      } catch (e) {
        if (e instanceof RunError) { out({ ok: false, problem: e.message }); return 1; }
        throw e;
      }
    }
    case 'record-clip': {
      const o = opts(rest, { run: 'string', cut: 'string', job: 'string', file: 'string', agent: 'string' });
      const run = readJson(req(o, 'run')) as DramaRunState;
      if (run.owner && run.owner.agent !== agentOf(req(o, 'agent'))) { out({ ok: false, problem: `이 회차는 ${run.owner.agent} 가 진행 중` }); return 1; }
      writeJson(req(o, 'run'), recordGenerated(run, req(o, 'cut'), req(o, 'job'), sha256File(abs(req(o, 'file')))));
      out({ ok: true, cut: req(o, 'cut') });
      return 0;
    }
    case 'verdict-build': {
      const o = opts(rest, { series: 'string', episode: 'string', cut: 'string', file: 'string', transcript: 'string', work: 'string', keyframe: 'string', out: 'string' });
      const ctx = loadCtx(o);
      const cut = ctx.episode.cuts.find((c) => c.id === req(o, 'cut'));
      if (!cut) throw new UsageError('컷 없음');
      const clip = abs(req(o, 'file'));
      const work = abs(req(o, 'work'));
      mkdirSync(work, { recursive: true });
      const text = parseWhisperJson(readJson(req(o, 'transcript')));
      const keyframe = optStr(o, 'keyframe') ? abs(optStr(o, 'keyframe')!) : null;
      const pre = buildVerdictRequest(ctx, cut, sha256File(clip), text, () => null);
      for (const f of pre.frames) {
        const target = join(work, `${f.id}.png`);
        if (f.sec === 'last') extractLastFrame(clip, target); else extractFrameAt(clip, f.sec, target);
      }
      const request = buildVerdictRequest(ctx, cut, sha256File(clip), text, (id) => (keyframe ? imageSsim(keyframe, join(work, `${id}.png`)) : null));
      tileSheet([...(keyframe ? [keyframe] : []), ...request.frames.map((f) => join(work, `${f.id}.png`))], 4, join(work, 'sheet.jpg'));
      writeJson(req(o, 'out'), request);
      out({ ok: true, out: abs(req(o, 'out')), sheet: join(work, 'sheet.jpg'), frames: request.frames.map((f) => f.id), questions: request.questions, dialogue: request.dialogue });
      return 0;
    }
    case 'verdict-apply': {
      const o = opts(rest, { run: 'string', request: 'string', response: 'string', agent: 'string' });
      const run = readJson(req(o, 'run')) as DramaRunState;
      if (run.owner && run.owner.agent !== agentOf(req(o, 'agent'))) { out({ ok: false, problem: `이 회차는 ${run.owner.agent} 가 진행 중` }); return 1; }
      const request = readJson(req(o, 'request')) as VerdictRequest;
      const verdict = applyVerdictResponse(request, readJson(req(o, 'response')) as VerdictResponse, new Date().toISOString());
      writeJson(req(o, 'run'), applyVerdict(run, request.cutId, request.fileSha256, verdict));
      out({ ok: verdict.status === 'pass', verdict });
      return verdict.status === 'pass' ? 0 : 1;
    }
    case 'approve-clip': {
      const o = opts(rest, { run: 'string', cut: 'string', file: 'string', by: 'string', override: 'boolean', note: 'string' });
      const run = readJson(req(o, 'run')) as DramaRunState;
      try {
        writeJson(req(o, 'run'), approveClip(run, req(o, 'cut'), sha256File(abs(req(o, 'file'))), { by: req(o, 'by'), at: new Date().toISOString(), override: o.override === true, ...(optStr(o, 'note') ? { note: optStr(o, 'note')! } : {}) }));
      } catch (e) {
        if (e instanceof RunError) { out({ ok: false, problem: e.message }); return 1; }
        throw e;
      }
      out({ ok: true, cut: req(o, 'cut') });
      return 0;
    }
    case 'handoff': {
      const o = opts(rest, { run: 'string', from: 'string', to: 'string', session: 'string', note: 'string' });
      writeJson(req(o, 'run'), handoff(readJson(req(o, 'run')) as DramaRunState, agentOf(req(o, 'from')), agentOf(req(o, 'to')), req(o, 'session'), req(o, 'note'), new Date().toISOString()));
      out({ ok: true });
      return 0;
    }
    case 'review-request': {
      const o = opts(rest, { series: 'string', episode: 'string', author: 'string', reviewer: 'string', dir: 'string', mailbox: 'string', summary: 'string', 'ttl-hours': 'string' });
      const ctx = loadCtx(o);
      const q = newReviewRequest({ episodePath: req(o, 'episode'), fingerprint: fingerprintOf(ctx.series, ctx.episode), author: agentOf(req(o, 'author')), reviewer: agentOf(req(o, 'reviewer')), summary: req(o, 'summary'), now: new Date(), ...(optStr(o, 'ttl-hours') ? { ttlHours: Number(optStr(o, 'ttl-hours')) } : {}) });
      writeJson(join(req(o, 'dir'), `${q.token}.request.json`), q);
      const mb = abs(req(o, 'mailbox'));
      const stamp = q.createdAt.replace(/[-:]/g, '').slice(0, 15);
      const name = `${stamp}-${q.author}-review-${q.token}.md`;
      mkdirSync(join(mb, '.tmp'), { recursive: true });
      mkdirSync(join(mb, `to-${q.reviewer}`), { recursive: true });
      writeFileSync(join(mb, '.tmp', name), `from: ${q.author}\nto: ${q.reviewer}\nre: -\ntopic: [시나리오 리뷰 요청] ${q.episodePath}\ntoken: ${q.token}\n\n${q.summary}\n\n지문 ${q.fingerprint}, 만료 ${q.expiresAt}. 응답: ds review-respond --token ${q.token}\n이 메시지는 정보·요청이며 사용자 승인이 아니다.\n`);
      renameSync(join(mb, '.tmp', name), join(mb, `to-${q.reviewer}`, name));
      out({ ok: true, token: q.token, expiresAt: q.expiresAt, mail: join(mb, `to-${q.reviewer}`, name) });
      return 0;
    }
    case 'review-inbox': {
      const o = opts(rest, { dir: 'string', agent: 'string' });
      const d = abs(req(o, 'dir'));
      const pending = pendingForAgent(readAll<DramaReviewRequest>(d, '.request.json'), readAll<DramaReviewResponse>(d, '.response.json'), agentOf(req(o, 'agent')), new Date());
      out({ ok: true, pending });
      return 0;
    }
    case 'review-respond': {
      const o = opts(rest, { dir: 'string', token: 'string', verdict: 'string', findings: 'string', agent: 'string', 'key-id': 'string', 'sm-project': 'string', series: 'string', episode: 'string' });
      const d = abs(req(o, 'dir'));
      const q = readJson(join(d, `${req(o, 'token')}.request.json`)) as DramaReviewRequest;
      const ctx = loadCtx(o);
      const fp = fingerprintOf(ctx.series, ctx.episode);
      if (fp !== q.fingerprint) { out({ ok: false, problem: '요청 이후 대본이 바뀜 — 작성자에게 review-request 재요청' }); return 1; }
      const verdict = req(o, 'verdict');
      if (verdict !== 'pass' && verdict !== 'changes') throw new UsageError('--verdict 는 pass|changes');
      const keys = gcpSecretSource(optStr(o, 'sm-project') ?? process.env.CAK_REVIEW_SM_PROJECT ?? DEFAULT_REVIEW_PROJECT);
      const r = signReviewResponse({ token: q.token, reviewedFingerprint: fp, verdict, findings: (optStr(o, 'findings') ?? '').split('|').map((x) => x.trim()).filter(Boolean), reviewer: agentOf(req(o, 'agent')), respondedAt: new Date().toISOString(), keyId: req(o, 'key-id') }, keys);
      writeJson(join(d, `${q.token}.response.json`), r);
      out({ ok: true, token: q.token, verdict });
      return 0;
    }
    case 'cross-review-apply': {
      const o = opts(rest, { series: 'string', episode: 'string', dir: 'string', token: 'string', gates: 'string', keys: 'string' });
      const d = abs(req(o, 'dir'));
      const token = req(o, 'token');
      const ctx = loadCtx(o);
      const usedFile = join(d, 'used-tokens.json');
      const used = new Set<string>(existsSync(usedFile) ? (JSON.parse(readFileSync(usedFile, 'utf8')) as string[]) : []);
      try {
        const report = verifyAndApplyReview({ request: readJson(join(d, `${token}.request.json`)) as DramaReviewRequest, response: readJson(join(d, `${token}.response.json`)) as DramaReviewResponse, currentFingerprint: fingerprintOf(ctx.series, ctx.episode), publicKeys: loadPublicKeys(optStr(o, 'keys') ? abs(optStr(o, 'keys')!) : KEYS_DIR), used, now: new Date() });
        saveReport(req(o, 'gates'), report);
        writeJson(usedFile, [...used, token]);
        out({ ok: report.ok, report });
        return report.ok ? 0 : 1;
      } catch (e) {
        if (e instanceof ReviewError) { out({ ok: false, problem: e.message }); return 1; }
        throw e;
      }
    }
    case 'review-keygen': {
      // 클라우드 비밀에 쓰는 명령 — 사용자 승인 후에만 실행한다. 개인 키는 stdout·디스크에 남기지 않는다.
      const o = opts(rest, { agent: 'string', 'key-id': 'string', 'sm-project': 'string', keys: 'string' });
      const agent = agentOf(req(o, 'agent'));
      const { publicKey, privateKey } = generateKeyPairSync('ed25519');
      gcpSecretSource(optStr(o, 'sm-project') ?? process.env.CAK_REVIEW_SM_PROJECT ?? DEFAULT_REVIEW_PROJECT).store(agent, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
      const rec: PublicKeyRecord = { agent, keyId: req(o, 'key-id'), publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
      writeJson(join(optStr(o, 'keys') ? abs(optStr(o, 'keys')!) : KEYS_DIR, `${agent}.pub.json`), rec);
      out({ ok: true, agent, keyId: rec.keyId, secret: secretName(agent) });
      return 0;
    }
```

Also: add `renameSync` to the `node:fs` import; extend `plan` options with `keyframes: 'string'` and pass `keyframeFileSha: fileShaIn(optStr(o, 'keyframes'), 'png')`; update the header comment command list and the `default:` usage string with the new commands. Remove the unused `createHash` import if tsc flags it.

- [ ] **Step 4: Run** `npm test -w @cak/drama-series` → all pass; `npx tsc -p packages/drama-series --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add packages/drama-series/src/cli/index.ts packages/drama-series/test/cli-v1.test.ts
git commit -m "feat(drama-series): CLI for keyframes, run state, clip verdict and token cross-review"
```

---

### Task 12: 스킬·작성 지침·진행 기록 갱신 + 전체 검증

**Files:**
- Modify: `.claude/skills/drama-series/SKILL.md`
- Modify: `.claude/skills/drama-series/WRITING-GUIDE.md`
- Modify: `docs/PROGRESS.md` (drama-series 행/ADR 한 줄)

**Interfaces:** none (문서)

- [ ] **Step 1: SKILL.md** — 아래 절을 기존 번호 체계에 맞춰 넣는다(기존 절 삭제 금지, 순서만 재배치):

```markdown
## 세션 시작
- 이 세션의 역할을 정한다(`claude`). `ds review-inbox --dir docs/videos/<작업>/reviews --agent claude` 로 미처리 리뷰 토큰부터 처리한다.
- 메일함 `/Users/admin/workSpace/.agent-mailbox/drama-series/to-claude/` 를 확인하고, 답장을 기다리는 동안 Monitor 로 감시한다.

## 2.6 교차 리뷰 (shot-v1 필수)
1. 회차에 `authoredBy` 를 적는다(이 세션이 쓰면 `claude`).
2. `ds review-request --series … --episode … --author claude --reviewer codex --dir docs/videos/<작업>/reviews --mailbox /Users/admin/workSpace/.agent-mailbox/drama-series --summary "<validate·JEV 요약, 확인 항목>"`
3. 상대 응답 후 `ds cross-review-apply --series … --episode … --dir … --token <token> --gates <dir>/gates`. 거부되면 사유대로 처리(대본을 고쳤으면 다시 요청).
4. Codex 가 쓴 시나리오 요청이 오면: 리뷰 → `ds review-respond --dir … --token … --verdict pass|changes --findings "a|b" --agent claude --key-id <id> --series … --episode …`.
5. 교차 리뷰 pass 뒤에 사용자 기획 승인을 받는다. 리뷰는 사용자 승인이 아니다.

## 2.5 키프레임 (사람 승인 1.5)
1. `ds keyframe-build --series … --episode … --aspect <16:9|9:16> --out <dir>/keyframes/requests.json`
2. 요청을 `generate_image_batch` 로 생성(장당 get_cost 확인, 비용 승인 범위 안) → `<media>/keyframes/<cut>.png` 로 내려받기
3. `ds keyframe-sheet --images <media>/keyframes --out <media>/keyframes/sheet.jpg` → 사용자에게 보여 준다
4. 승인 컷만 `ds approve-keyframe --series … --episode … --cut <id> --asset <job_id> --file <png> --aspect … --by user`

## 6. 생성 루프 (shot-v1)
1. `ds plan … --keyframes <media>/keyframes` → 비용 승인 → `ds run-init --plan … --run <dir>/run-epNN.json --agent claude --session <세션 id 앞 8자>`
2. 반복: `ds next --plan … --run … --agent claude --clips <media>/clips` 가 준 컷만 생성한다.
   - startImage.source=keyframe → 그 job_id 를 start_image 로.
   - prev-clip → `useLastFrameOf` 클립의 실제 마지막 프레임을 추출·업로드해 start_image 로.
   - 동작 참조 영상은 자체 생성물만, `ffmpeg -an` 사본을 `ffprobe` 로 오디오 0개 확인 후 업로드. 원본 보존.
3. 받은 클립 → `ds record-clip --run … --cut … --job … --file … --agent claude`
4. whisper large-v3 받아쓰기 → `ds verdict-build … --cut … --file … --transcript … --work <media>/verdict/<cut> --keyframe <png> --out <dir>/verdict/<cut>.request.json`
5. 시트(`sheet.jpg`)와 프레임을 직접 보고 질문마다 pass/fail + 근거 프레임 id 로 응답 JSON 작성(판정자 `claude-session` 명시) → `ds verdict-apply --run … --request … --response … --agent claude`
6. 파일럿 2컷은 pass 후 사용자에게 보여 주고 `ds approve-clip --run … --cut … --file … --by user`. fail 이면 재생성(비용 승인) 또는 사용자가 근거를 보고 `--override --note`.
7. `next` 가 done 이면 조립 → 회차 미리보기를 사용자에게 보여 승인받는다.
- 다른 에이전트에게 넘길 때: `ds handoff --run … --from claude --to codex --session <id> --note <사유>`.
- 판정 수치(SSIM)는 참고만. 어떤 값도 pass 근거가 아니다.

## 서명 키
- 개인 키는 GCP Secret Manager(`gen-lang-client-0881453127`, `cak-drama-review-<agent>-ed25519`)에만 있다. 최초 1회 `ds review-keygen --agent claude --key-id claude-1` — 클라우드 설정 변경이라 **사용자 승인 후에만** 실행한다.
```

- [ ] **Step 2: WRITING-GUIDE.md** — 추가:

```markdown
## shot-v1 컷 작성 규칙
- 컷 1개 = 비트 1~2개, 대사 2줄 이하(최대 3), 5~10초(최대 12), 화면 인물 3명 이하.
- 발화 시간(대사 음절 ÷ 2.2) + 비트당 1.5초가 컷 길이 안에 들어가야 한다.
- `setupId` 로 구도를 고르고, 지문에 쓰는 소품은 `usedPropIds` 에 적는다. 구도 그림에 없는 소품은 인물이 들고 들어오거나(`carriesPropIds`) 앞 컷에서 이어져야 한다. 그림에 없는 세트 요소는 쓰지 않는다.
- 인물이 2명 이상이면 `blocking` 으로 좌·중·우를 정한다. 같은 구도에서 좌우가 바뀌면 `blockingChange`(move|reverse)를 적는다.
- 앞 컷 마지막 장면에서 바로 이어질 때만 `continuesFromPrev: true` — 같은 장소·구도·출연진일 때만 가능.
- 감정·시선·손동작 같은 연기 지시는 대사 문구가 아니라 `action`/`beats` 에 쓴다(키프레임 재승인 대상).
```

- [ ] **Step 3: PROGRESS.md** — drama-series 관련 표/ADR 위치에 한 줄 추가:

```markdown
| 2026-10-08 (drama 세션) | **drama-series shot-v1 키프레임 우선 파이프라인 구현** — shot 관문·키프레임 승인·`ds next` 실행 경계(파일럿 2컷 사람 승인, 전 컷 판정 pass)·토큰 교차 리뷰(Ed25519, 개인 키 GCP Secret Manager gen-lang-client-0881453127). legacy 회차 동작 불변. 설계 docs/superpowers/specs/2026-10-08-drama-keyframe-pipeline-design.md, 계획 docs/superpowers/plans/2026-10-08-drama-keyframe-pipeline.md |
```

- [ ] **Step 4: Full verification**

Run (worktree root):
```bash
npm test -w @cak/drama-series 2>&1 | tail -6
npx tsc -p packages/drama-series --noEmit; echo tsc $?
npx tsc -p packages/contracts --noEmit; echo contracts $?
D=$PWD/docs/videos/20261006-regression-pilot
npm run -s cli -w @cak/drama-series -- validate --series $D/series.json --episode $D/ep01-9min.json --gates /private/tmp/legacy-check-gates | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.ok, j.reports.map(r=>r.gate+":"+r.ok).join(" "))})'
```
Expected: 모든 테스트 통과, tsc 0/0, 1화 legacy validate `ok` 가 변경 전과 같고 `shot` 보고서는 info 만. (임시 gates 폴더는 확인 후 삭제)

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/drama-series docs/PROGRESS.md
git commit -m "docs(drama-series): skill and writing guide for shot-v1, keyframes, run loop and token review"
```

---

## Self-Review

1. **Spec coverage:** §3 정책 버전 → T1/T3/T5; §4 계약 → T1; §5 shot 관문 → T3; §6 키프레임 → T4/T11; §7 지문 분리 → T2/T4; §8 연결 → T3(continuesFromPrev 검사)/T5(chainsFromV1); §9 프롬프트 → T6; §10 실행 경계 → T8/T11; §10a 컷 판정 → T9/T11; §11 frame-check → T7/T9(SSIM 참고, 카메라 이동 N/A); §12 스킬·참조 영상 무음 → T12; §16 회차 잠금·인계 → T8/T11, Codex 입구는 Codex 담당(범위 밖); §17·§18 교차 리뷰·토큰·키 → T10/T11/T12; §13 테스트 → 각 Task. 공백: Codex 입구 파일(Codex 담당), 실제 GCP 키 생성(사용자 승인 후 실행).
2. **Placeholder scan:** TODO(D1) 는 설계상 미확인 사항(start_image 번호)에 대한 코드 주석으로만 남김. 그 외 없음.
3. **Type consistency:** `Aspect`, `keyframeFindings(ctx, aspect, fileSha)`, `PlanInput.keyframeFileSha`, `DramaStartImage`, `NextItem.useLastFrameOf`, `VerdictRequest/Response`, `PublicKeyRecord`, `PrivateKeySource` 이름이 Task 간 일치. `toSeedanceClip` 시그니처 불변.
4. **Review Focus:** 5개 모두 해당 Task 테스트에 포함(T5 legacy, T8 replaced file, T10 stale fingerprint, T3 beat sums/indexes, T9 empty transcript).

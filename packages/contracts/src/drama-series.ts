/**
 * drama-series ↔ 소비자 계약 (원자 #15).
 * 장르를 모르는 미니시리즈 제작 엔진. 장르 규칙은 원자 내부 장르 팩(데이터)이 정한다.
 * 선택 필드는 zod 출력과 맞추려고 `?: T | undefined` 로 둔다.
 */
export type DramaLineKind = 'dialogue' | 'monologue';
export type DramaLineStatus = 'unverified' | 'verified' | 'human-approved' | 'rejected';

export interface DramaLineVerification {
  status: DramaLineStatus;
  /** 판정 근거(예: JEV 응답 파일명) */
  judgeRef?: string | undefined;
  /** human-approved 일 때 승인자 */
  approvedBy?: string | undefined;
  /** ISO 8601 */
  at?: string | undefined;
  note?: string | undefined;
  /** 판정·승인 당시의 대사 지문(컷·화자·문구·종류·장면). 대사가 바뀌면 검증이 무효가 된다 */
  lineHash?: string | undefined;
  /** 회차 연결 opt-in 판정 문맥. 기존 lineHash 의미는 유지한다. */
  reviewContextDigest?: string | undefined;
}

export interface DramaLine {
  /** DramaCharacter.id */
  speaker: string;
  text: string;
  kind: DramaLineKind;
  verification: DramaLineVerification;
}

/** shot-v1: 잠정 제작 품질 정책이며 제공자 제한이 아니다. */
export interface DramaShotPolicy { version: 'shot-v1'; strict: true }
export interface DramaSetup {
  id: string;
  name: string;
  cameraEn: string;
  refAssetId?: string | undefined;
  visiblePropIds: string[];
}
export type DramaScreenSide = 'left' | 'center' | 'right';
export interface DramaBlocking {
  characterId: string;
  side: DramaScreenSide;
  depth?: 'front' | 'mid' | 'back' | undefined;
}
export type DramaCameraMove = 'static' | 'push-in' | 'pull-out' | 'pan' | 'follow';
export interface DramaBeat {
  en: string;
  /** 생략하면 남은 시간을 발화량 + 행동 여유에 비례해 배분한다. */
  sec?: number | undefined;
  /** 이 비트에서 말하는 0-based 대사 인덱스. */
  lines?: number[] | undefined;
  /** 비트가 끝날 때의 소품 상태 변화. */
  changes?: Record<string, string> | undefined;
}

export interface DramaCharacterLook {
  outfitRefAssetId?: string | undefined;
  id: string;
  /** 영어 외형 묘사(프롬프트에 들어감) */
  description: string;
  /** 힉스필드 이미지 job_id 등 참조 자산 id */
  refAssetId?: string | undefined;
}

export interface DramaCharacter {
  id: string;
  name: string;
  profile: string;
  speech: { default: string; toSuperior?: string | undefined; toSubordinate?: string | undefined };
  /** 같은 인물의 다른 모습(예: 회귀 전·후) */
  looks: DramaCharacterLook[];
}

export interface DramaLocation {
  setups?: DramaSetup[] | undefined;
  id: string;
  name: string;
  /** 장소 고정 문구(영어). 이 장소의 모든 컷 프롬프트에 그대로 붙는다 */
  anchorText: string;
  /** 이 장소에 실제로 있는 소품 */
  props: string[];
  refAssetId?: string | undefined;
}

export type DramaTransition = 'cut' | 'flash' | 'fade-black';

export interface DramaCutCast {
  carriesPropIds?: string[] | undefined;
  characterId: string;
  lookId: string;
}

export interface DramaCut {
  setupId?: string | undefined;
  blocking?: DramaBlocking[] | undefined;
  blockingChange?: 'move' | 'reverse' | undefined;
  cameraMove?: DramaCameraMove | undefined;
  beats?: DramaBeat[] | undefined;
  usedPropIds?: string[] | undefined;
  continuesFromPrev?: boolean | undefined;
  id: string;
  locationId: string;
  durationSec: number;
  cast: DramaCutCast[];
  /** 장면 설명(한국어, 사람 검토용) */
  action: string;
  /** 영상 프롬프트(영어). `{인물id}`, `{location}` 토큰을 쓴다 */
  visualEn: string;
  sfx?: string | undefined;
  caption?: string | undefined;
  /** 컷이 끝났을 때 소품 상태. 같은 장소 다음 컷은 이 키를 이어받아야 한다 */
  propState?: Record<string, string> | undefined;
  /** 이 컷 앞의 편집 전환 */
  transitionIn?: DramaTransition | undefined;
  lines: DramaLine[];
}

export interface DramaEpisodeOutline {
  no: number;
  title: string;
  summary: string;
}

/** 주제 후보. 주제 관문을 통과한 주제만 시리즈가 된다 */
export interface DramaTopic {
  id: string;
  logline: string;
  synopsis: string;
  /** 작성자가 노린 조회 유발 요소(장르 팩 hookElements 키) */
  claimedElements: string[];
  /** 주제 관문이 확정한 요소. 관문 결과로만 채운다 */
  verifiedElements?: string[] | undefined;
}

export interface DramaTopicSet {
  genreId: string;
  topics: DramaTopic[];
}

export interface DramaSeries {
  id: string;
  title: string;
  logline: string;
  genreId: string;
  /** 주제 관문을 통과한 주제 */
  topic: DramaTopic;
  /** 모든 클립 프롬프트 끝에 붙는 공통 스타일(영어) */
  styleEn: string;
  characters: DramaCharacter[];
  locations: DramaLocation[];
  episodes: DramaEpisodeOutline[];
  safety: { nonGraphic: true };
}

export interface DramaEpisode {
  shotPolicy?: DramaShotPolicy | undefined;
  authoredBy?: 'claude' | 'codex' | undefined;
  continuesFromEpisode?: { no: number; cutId: string } | undefined;
  startsFresh?: true | undefined;
  seriesId: string;
  no: number;
  title: string;
  cuts: DramaCut[];
}

export type DramaGateStage = 'topic' | 'episode' | 'plan' | 'clip';
export type DramaFindingSeverity = 'block' | 'review' | 'info';

export interface DramaFinding {
  severity: DramaFindingSeverity;
  message: string;
  cutId?: string | undefined;
  lineIndex?: number | undefined;
  evidence?: string | undefined;
}

export interface DramaGateReport {
  /** 회차 연결 opt-in 시 필수인 검토 문맥 지문. */
  reviewContextDigest?: string | undefined;
  gate: string;
  stage: DramaGateStage;
  /** block 이 하나도 없으면 true */
  ok: boolean;
  /** 판정 당시 대본 지문 */
  fingerprint: string;
  findings: DramaFinding[];
}

export interface DramaClipMedia {
  role: 'image_references';
  assetId: string;
  label: string;
}

export interface DramaVoiceOver {
  speaker: string;
  text: string;
}

export interface DramaClipSpec {
  cutId: string;
  backend: string;
  model: string;
  durationSec: number;
  params: Record<string, string | number | boolean>;
  /** 순서가 곧 @Image1, @Image2 … 번호 */
  medias: DramaClipMedia[];
  prompt: string;
  /** 영상 음성 대신 따로 입히는 독백 */
  voiceOver: DramaVoiceOver[];
  estCredits: number | null;
  /**
   * (2026-10-07 추가) 이 컷의 마지막 프레임을 시작 프레임(start_image)으로 쓴다.
   * 같은 장소에서 전환 없이 이어지는 컷이면 앞 컷 id. 이 경우 앞 컷이 끝난 뒤에만 생성할 수 있다.
   */
  startFromCut?: string;
}

export interface DramaPlan {
  seriesId: string;
  episodeNo: number;
  fingerprint: string;
  clips: DramaClipSpec[];
  totalCredits: number | null;
  budgetCredits: number;
  rateMeasuredAt: string;
  createdAt: string;
}

/** Unreleased, immutable input evidence; never a release/execute permission. */
export interface DramaReleaseSource {
  schemaVersion: 1;
  kind: 'drama-release-source';
  authorized: false;
  seriesId: string;
  episodeNo: number;
  cutId: string;
  contentDigest: string;
  clip: { sha256: string; bytes: number };
  frame: { sha256: string; bytes: number; pixelSha256: string; frameCount: number; extraction: 'video-0-rgb24-last-v1' };
  subjectDigest: string;
}

/** A supplied human decision record, not authenticated proof of user identity. */
export interface DramaSourceApproval {
  schemaVersion: 1;
  decision: 'approve-continuation-source';
  subjectDigest: string;
  approvedBy: string;
  userQuote: string;
  recordedBy: string;
  at: string;
}

export interface DramaContinuationBinding {
  schemaVersion: 1;
  kind: 'drama-continuation-binding';
  authorized: false;
  reviewContextDigest: string;
  source: { episodeNo: number; cutId: string; subjectDigest: string; clipSha256: string; frameSha256: string };
  target: { seriesId: string; episodeNo: number; cutId: string };
  approvalDigest: string;
  bindingDigest: string;
}

/** Sample-only evidence. No full-clip verdict or execution permission. */
export interface DramaVisualEvidence {
  clip: { sha256: string; bytes: number };
  frameCount: number;
  frames: { id: string; ordinal: number; file: string; sha256: string; bytes: number; pixelSha256: string }[];
}
export interface DramaVisualRequest {
  schemaVersion: 1;
  kind: 'drama-sampled-visual-request';
  authorized: false;
  policy: 'ordinal-first-middle-last-v1';
  requestId: string;
  jobId: string;
  target: { seriesId: string; episodeNo: number; cutId: string };
  contextDigest: string;
  evidence: DramaVisualEvidence;
  questions: { id: string; category: 'action' | 'cast' | 'background'; text: string; frameIds: string[] }[];
  requestDigest: string;
}
export interface DramaVisualResponse {
  schemaVersion: 1;
  requestId: string;
  requestDigest: string;
  reviewer: string;
  reviewedAt: string;
  answers: { questionId: string; verdict: 'pass' | 'fail' | 'unknown'; reason: string; frameIds: string[] }[];
}
export interface DramaVisualReport {
  schemaVersion: 1;
  kind: 'drama-sampled-visual-report';
  authorized: false;
  scope: 'sampled-visual-description';
  requestId: string;
  requestDigest: string;
  responseDigest: string;
  verdict: 'pass' | 'fail' | 'unknown';
  reviewer: string;
  reviewedAt: string;
  answers: DramaVisualResponse['answers'];
  blockers: string[];
}

/** Keyframe preparation/approval evidence only; does not authorize video generation or release. */
export interface DramaKeyframeRequest {
  schemaVersion: 1;
  kind: 'drama-keyframe-request';
  policy: 'kf-v1';
  authorized: false;
  target: { seriesId: string; episodeNo: number; cutId: string };
  aspectRatio: '16:9';
  references: { role: 'set' | 'face' | 'outfit'; assetId: string; characterId?: string | undefined }[];
  prompt: string;
  checklist: { id: string; text: string }[];
  keyframeDigest: string;
}
export interface DramaKeyframeEvidence {
  schemaVersion: 1;
  kind: 'drama-keyframe-evidence';
  authorized: false;
  target: DramaKeyframeRequest['target'];
  aspectRatio: '16:9';
  keyframeDigest: string;
  assetId: string;
  image: { sha256: string; bytes: number; width: number; height: number; pixelSha256: string };
  subjectDigest: string;
}
export interface DramaKeyframeApproval {
  schemaVersion: 1;
  decision: 'approve-keyframe';
  subjectDigest: string;
  approvedBy: string;
  userQuote: string;
  recordedBy: string;
  at: string;
  checks: { composition: true; cast: true; wardrobe: true; props: true; safety: true };
}
export interface DramaKeyframeBinding {
  schemaVersion: 1;
  kind: 'drama-keyframe-binding';
  authorized: false;
  target: DramaKeyframeRequest['target'];
  keyframeDigest: string;
  assetId: string;
  fileSha256: string;
  subjectDigest: string;
  approvalDigest: string;
  bindingDigest: string;
}

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
}

export interface DramaLine {
  /** DramaCharacter.id */
  speaker: string;
  text: string;
  kind: DramaLineKind;
  verification: DramaLineVerification;
}

export interface DramaCharacterLook {
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
  characterId: string;
  lookId: string;
}

export interface DramaCut {
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

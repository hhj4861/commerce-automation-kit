/**
 * 음악 생성 백엔드 레지스트리 + 우선순위 해석 (순수 로직).
 *
 * 사용자가 우선순위 목록을 주면, 실제로 쓸 수 있는 첫 백엔드를 고른다.
 * - api  : 공식 API. 키(env)가 있어야 사용 가능
 * - manual: 사람이 UI 에서 생성(프롬프트만 산출) — 항상 사용 가능
 * - reserved: 공식 API 대기 슬롯(예: suno-auto). 절대 자동 실행하지 않음(비공식 우회 금지)
 */
import type { MusicBackendId } from '@cak/contracts';

export type BackendMode = 'api' | 'manual' | 'reserved';

export interface BackendInfo {
  id: MusicBackendId;
  mode: BackendMode;
  /** 광고 상업 사용이 라이선스상 안전한가 */
  licenseSafe: boolean;
  /** api 모드일 때 필요한 환경변수명 */
  requiresKeyEnv?: string;
  note: string;
}

export const BACKENDS: Record<MusicBackendId, BackendInfo> = {
  elevenlabs: {
    id: 'elevenlabs',
    mode: 'api',
    licenseSafe: true,
    requiresKeyEnv: 'ELEVENLABS_API_KEY',
    note: '공식 Music API + 정식 라이선스 학습(Merlin·Kobalt) → 광고 clear. 무인 자동.',
  },
  'suno-manual': {
    id: 'suno-manual',
    mode: 'manual',
    licenseSafe: true,
    note: 'Suno 최고품질. 사용자가 Suno UI(유료)에서 생성·다운로드(사람 게이트). 프롬프트만 자동 산출.',
  },
  'suno-auto': {
    id: 'suno-auto',
    mode: 'reserved',
    licenseSafe: false,
    note: '공식 Suno API 부재(2026-07). 비공식 계정풀 래퍼는 ToS·프로젝트 금지선 위반 → 미지원. 공식 API 출시 시 활성화.',
  },
};

/** 기본 우선순위: 무인 안전(elevenlabs) → 수동 고품질(suno-manual). suno-auto 는 예약이라 제외. */
export const DEFAULT_PRIORITY: MusicBackendId[] = ['elevenlabs', 'suno-manual'];

export interface ResolvedBackend {
  /** 선택된 백엔드(없으면 undefined) */
  chosen?: BackendInfo;
  /** 건너뛴 백엔드와 사유(투명화) */
  skipped: { id: MusicBackendId; reason: string }[];
}

/**
 * 우선순위대로 사용 가능한 첫 백엔드를 고른다.
 * @param priority 우선순위 목록
 * @param isKeyAvailable env 키 존재 여부 판정(테스트 주입 가능)
 */
export function resolveBackend(
  priority: MusicBackendId[],
  isKeyAvailable: (env: string) => boolean,
): ResolvedBackend {
  const skipped: { id: MusicBackendId; reason: string }[] = [];
  for (const id of priority) {
    const info = BACKENDS[id];
    if (info === undefined) {
      skipped.push({ id, reason: '알 수 없는 백엔드' });
      continue;
    }
    if (info.mode === 'reserved') {
      skipped.push({ id, reason: `${info.note}` });
      continue;
    }
    if (info.mode === 'api') {
      const env = info.requiresKeyEnv;
      if (env === undefined || !isKeyAvailable(env)) {
        skipped.push({ id, reason: `API 키 없음(${env ?? '?'})` });
        continue;
      }
    }
    return { chosen: info, skipped };
  }
  return { skipped };
}

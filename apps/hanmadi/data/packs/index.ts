/**
 * 팩 레지스트리 — 팩 추가 시 여기 import 추가:
 *   1) data/packs/{id}.ts 생성 (demo.ts 복사 추천)
 *   2) 아래에 import 후 packs 배열에 넣기 — 배열 순서는 무관,
 *      추천 학습 순서는 각 팩의 order 필드가 결정한다.
 *
 * demo.ts는 새 팩 작성용 템플릿이라 라이브러리 목록에는 노출하지 않는다
 * (파일은 남겨두되 packs 배열에는 등록하지 않음).
 */
import type { Pack } from "@/data/types";
import { hangulBasicsPack } from "@/data/packs/hangul-basics";
import { grammarFirstStepsPack } from "@/data/packs/grammar-first-steps";
import { pack as survivalPhrasesPack } from "@/data/packs/survival-phrases";
import { pack as travelKoreanPack } from "@/data/packs/travel-korean";
import { pack as kCultureExpressionsPack } from "@/data/packs/k-culture-expressions";
import { pronunciationClinicPack } from "@/data/packs/pronunciation-clinic";
import { levelCheckOnboardingPack } from "@/data/packs/level-check-onboarding";
import { homeworkReviewRoutinePack } from "@/data/packs/homework-review-routine";

export const packs: Pack[] = [
  hangulBasicsPack,
  grammarFirstStepsPack,
  survivalPhrasesPack,
  travelKoreanPack,
  kCultureExpressionsPack,
  pronunciationClinicPack,
  levelCheckOnboardingPack,
  homeworkReviewRoutinePack,
];

export function getPack(id: string): Pack | undefined {
  return packs.find((p) => p.id === id);
}

/** 추천 학습 순서(order)로 정렬된 트랙 — 이전/다음 팩 내비게이션의 기준 */
export function orderedTrack(): Pack[] {
  return packs
    .filter((p) => p.order !== undefined)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** 팩의 이전/다음 팩 (추천 학습 순서 기준) */
export function packNeighbors(id: string): {
  prev?: Pack;
  next?: Pack;
} {
  const track = orderedTrack();
  const i = track.findIndex((p) => p.id === id);
  if (i === -1) return {};
  return { prev: track[i - 1], next: track[i + 1] };
}

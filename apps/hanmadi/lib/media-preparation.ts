import type { MediaSummary } from "./media-source";

// Client-safe: only a saved original and its current job establish readiness.
export function mediaPreparation(source?: MediaSummary) {
  if (!source || source.originalCount === 0) return { ready: false, label: "원문 확보 대기", next: "이용 가능한 원문 파일을 연결하거나 채널의 가져오기 권한을 확인하세요." };
  if (source.job?.sourceRevision === source.revision && source.job.status === "ready")
    return { ready: true, label: "원문 준비 완료", next: "검수·반영에서 학습 자료를 만들 수 있어요. 게시는 검수 후 진행해요." };
  return { ready: false, label: "원문 정리 필요", next: "원문·작업에서 최신 버전의 정리·재개를 완료하세요." };
}

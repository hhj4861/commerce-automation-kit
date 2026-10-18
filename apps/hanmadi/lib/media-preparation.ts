import type { MediaSummary } from "./media-source";

export function mediaAcquisitionLabel(source?: Pick<MediaSummary, "acquisition">) {
  if (source?.acquisition?.method === "file") return "원문 파일 준비";
  if (source?.acquisition?.method === "channel") return "채널 연결·권한 확인";
  return "확보 방법 미정";
}
// Client-safe: only a saved original and its current job establish readiness.
export function mediaPreparation(source?: MediaSummary) {
  if (!source || source.originalCount === 0) return { ready: false, label: "원문 확보 대기", next: source?.acquisition?.method === "file" ? "준비한 TXT·SRT·VTT·LRC 파일을 연결하고 이용 근거를 확인하세요." : source?.acquisition?.method === "channel" ? "채널 연결과 해당 영상의 자막 가져오기 권한을 확인하세요. 계획 저장만으로 가져오지는 않아요." : "이용 가능한 원문 파일을 연결하거나 채널의 가져오기 권한을 확인하세요." };
  if (source.job?.sourceRevision === source.revision && source.job.status === "ready")
    return { ready: true, label: "원문 준비 완료", next: "검수·반영에서 학습 자료를 만들 수 있어요. 게시는 검수 후 진행해요." };
  return { ready: false, label: "원문 정리 필요", next: "원문·작업에서 최신 버전의 정리·재개를 완료하세요." };
}

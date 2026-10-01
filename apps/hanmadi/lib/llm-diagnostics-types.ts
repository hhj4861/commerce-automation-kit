import type { StudyLanguage } from "./v2";
export const diagnosticLanguages = ["en", "ja", "th", "es"] as const;
export const diagnosticInput = "얼음 없이 커피 한 잔 주세요.";
export const diagnosticVersion = 1;
export type ProbeKind = "chat" | "learner" | "translation";
export type Finding = "upstream" | "quality" | "repaired" | "slow" | "retrieval";
export type ProbeResult = {
  kind: ProbeKind; ms: number; llmMs: number; calls: number; failures: number;
  findings: Finding[];
};
export type DiagnosticReport = {
  version: number; language: StudyLanguage; startedAt: number; finishedAt: number;
  retrievalMs: number; retrievalFailed: boolean; probes: ProbeResult[];
  status: "passed" | "warning" | "failed";
};
export const findingAdvice: Record<Finding, { title: string; advice: string }> = {
  upstream: { title: "AI 호출 실패", advice: "LiteLLM 연결·제공자 상태·인증·사용량을 확인하세요. 이 결과만으로 세부 원인을 확정할 수 없어요." },
  quality: { title: "응답 품질 검사 실패", advice: "고정 예문의 형식·목표 언어·발음 표기·의미 조건을 검토하고 프롬프트 또는 모델 변경 후 재검사하세요." },
  repaired: { title: "재생성 후 통과", advice: "첫 응답이 품질 검사를 통과하지 못했어요. 같은 모델에서 재시도했으므로 추가 지연과 비용이 발생해요." },
  slow: { title: "응답 지연", advice: "이 검사 단계가 8초 이상 걸렸어요. AI 호출 시간과 자료 검색 시간을 비교해 병목을 확인하세요." },
  retrieval: { title: "학습 자료 검색 실패", advice: "게시 자료 저장소·검색 인덱스·임베딩 연결을 확인하세요. 자료가 필요한 회화·번역 검사는 실행하지 않았어요." },
};


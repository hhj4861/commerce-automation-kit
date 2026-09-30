"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ContentDraft } from "@/lib/knowledge";
import type {
  Dataset,
  EvaluationCase,
  RetrievalEvaluation,
  TrainingJob,
} from "@/lib/learning-types";
import { curriculum, studyLanguages, type StudyLanguage } from "@/lib/v2";

type Snapshot = {
  published: ContentDraft[];
  datasets: Dataset[];
  cases: EvaluationCase[];
  evaluations: RetrievalEvaluation[];
  jobs: (TrainingJob & { aliasReady: boolean })[];
  index: { datasetId: string; model: string; count: number } | null;
  semanticEnabled: boolean;
  activeJobId: string | null;
  capabilities: {
    embeddingConfigured: boolean;
    trainingConfigured: boolean;
    trainingModel: string | null;
    enabled: boolean;
    minimum: number | null;
  };
};
async function api(body?: unknown) {
  const r = await fetch("/api/study/admin/learning", {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(85000),
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(data.error || "학습 관리 요청을 처리하지 못했어요.");
  return data;
}
const jobLabels: Record<TrainingJob["status"], string> = {
  prepared: "실행 전",
  submitting: "제출 중 · 상태 확인 필요",
  submitted: "학습 중",
  unknown: "결과 확인 필요",
  failed: "실패",
  succeeded: "학습 완료",
  cancelled: "취소됨",
};
export function LearningAdmin() {
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const [name, setName] = useState(""),
    [purpose, setPurpose] = useState<Dataset["purpose"]>("retrieval"),
    [rights, setRights] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [datasetId, setDatasetId] = useState("");
  const [language, setLanguage] = useState<StudyLanguage>("ja"),
    [level, setLevel] = useState(1),
    [scene, setScene] = useState("smalltalk"),
    [mode, setMode] = useState<"chat" | "translation">("chat"),
    [query, setQuery] = useState(""),
    [expected, setExpected] = useState("");
  const [reviewId, setReviewId] = useState(""),
    [review, setReview] = useState(""),
    [reviewed, setReviewed] = useState(false);
  const load = useCallback(async () => {
    const snapshot = await api();
    setData(snapshot);
    return snapshot as Snapshot;
  }, []);
  useEffect(() => {
    let active = true;
    void api()
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function work(body: Record<string, unknown>, message: string) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await api(body);
      await load();
      setNotice(message);
      return response;
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했어요.");
      try {
        await load();
      } catch {
        /* Keep the original operation error. */
      }
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function download(split: "train" | "validation" | "test") {
    const result = await work(
      { action: "export", id: datasetId, split },
      "자료 파일을 내려받았어요.",
    );
    if (result) {
      const url = URL.createObjectURL(
        new Blob([result.content], { type: "application/jsonl" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  const dataset = data?.datasets.find((d) => d.id === datasetId);
  const valid = !!dataset && !dataset.invalidatedAt;
  return (
    <section className="la" aria-label="학습 관리">
      <div className="la-heading">
        <div>
          <h2>자료가 쌓이고, 답변이 좋아지도록.</h2>
          <p>
            게시한 교재를 버전으로 묶고, 검색 결과를 확인한 뒤 앱에 적용하세요.
          </p>
        </div>
        <button
          disabled={busy}
          onClick={() => {
            setError("");
            void load().catch((e) => setError(e.message));
          }}
        >
          목록 새로고침
        </button>
      </div>
      {error && (
        <p role="alert" className="hm-alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="hm-notice">
          {notice}
        </p>
      )}
      {!data ? (
        <p role="status">학습 자료를 불러오는 중이에요.</p>
      ) : (
        <>
          <dl className="la-summary">
            <div>
              <dt>게시 교재</dt>
              <dd>{data.published.length}개</dd>
            </div>
            <div>
              <dt>참고 표현</dt>
              <dd>
                {data.published.reduce((n, d) => n + d.units.length, 0)}개
              </dd>
            </div>
            <div>
              <dt>현재 검색</dt>
              <dd>{data.semanticEnabled ? "의미 검색" : "어휘 검색"}</dd>
            </div>
            <div>
              <dt>AI 대화</dt>
              <dd>{data.activeJobId ? "검수한 학습 모델" : "기본 모델"}</dd>
            </div>
          </dl>
          <p className="hm-muted">
            {Object.entries(studyLanguages)
              .map(
                ([id, l]) =>
                  `${l.name} ${data.published.filter((d) => d.language === id).length}개`,
              )
              .join(" / ")}
          </p>
          <fieldset disabled={busy} className="la-fieldset">
            <section className="hm-panel">
              <h3>1. 자료 버전 만들기</h3>
              <p>
                선택한 게시 교재를 그대로 묶습니다. 자료를 수정하거나 게시를
                내리면 연결된 버전의 사용이 중지됩니다.
              </p>
              {!data.published.length ? (
                <p className="la-empty">
                  아직 게시한 교재가 없어요. ‘자료 만들기’에서 원문으로 초안을
                  만들고 검수 후 게시해 주세요.
                </p>
              ) : (
                <>
                  <div className="hm-grid">
                    <label>
                      자료 버전 이름
                      <input
                        value={name}
                        maxLength={80}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="예: 일본어 카페 기초 1차"
                      />
                    </label>
                    <label>
                      사용 목적
                      <select
                        aria-label="사용 목적"
                        value={purpose}
                        onChange={(e) => {
                          setPurpose(e.target.value as Dataset["purpose"]);
                          setRights(false);
                          setSelected([]);
                        }}
                      >
                        <option value="retrieval">자료 검색·앱 참고용</option>
                        <option value="fine-tuning">모델 추가 학습용</option>
                      </select>
                    </label>
                  </div>
                  <div className="la-sources">
                    {data.published.map((d) => (
                      <label key={d.id}>
                        <input
                          type="checkbox"
                          checked={selected.includes(d.id)}
                          disabled={
                            purpose === "fine-tuning" && !!d.contributionId
                          }
                          onChange={(e) =>
                            setSelected((v) =>
                              e.target.checked
                                ? [...v, d.id]
                                : v.filter((id) => id !== d.id),
                            )
                          }
                        />
                        <span>
                          <strong>{d.title}</strong>
                          <small>
                            {studyLanguages[d.language].name} · 레벨 {d.level} ·{" "}
                            {
                              curriculum.scenes.find((s) => s.id === d.scene)
                                ?.title
                            }{" "}
                            · 표현 {d.units.length}개
                            {d.contributionId ? " · 사용자 제공 (검색용)" : ""}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                  {purpose === "fine-tuning" && (
                    <>
                      <label className="la-check">
                        <input
                          type="checkbox"
                          checked={rights}
                          onChange={(e) => setRights(e.target.checked)}
                        />
                        선택한 관리자 교재의 외부 모델 가중치 학습·데이터 전송
                        권한을 별도로 확인했어요.
                      </label>
                      <p className="hm-muted">
                        서로 다른 출처 3개 이상이 필요해요. 같은 영상이나 중복
                        표현은 묶어 학습·검증·시험 자료가 섞이지 않게 합니다.
                      </p>
                    </>
                  )}
                  <button
                    className="hm-primary"
                    disabled={
                      !name.trim() ||
                      !selected.length ||
                      (purpose === "fine-tuning" && !rights)
                    }
                    onClick={() =>
                      void work(
                        {
                          action: "dataset",
                          name,
                          purpose,
                          sourceIds: selected,
                          trainingRights: rights,
                        },
                        "자료 버전을 만들었어요.",
                      ).then((r) => {
                        if (r) {
                          setDatasetId(r.result.id);
                          setName("");
                          setSelected([]);
                          setRights(false);
                        }
                      })
                    }
                  >
                    선택한 교재로 버전 만들기
                  </button>
                </>
              )}
              <ul className="la-versions">
                {data.datasets.map((d) => (
                  <li key={d.id}>
                    <div>
                      <strong>{d.name}</strong>
                      <small>
                        {d.purpose === "retrieval" ? "검색용" : "모델 학습용"} ·{" "}
                        {d.invalidatedAt
                          ? "원본 변경·회수로 사용 중지"
                          : `${d.drafts.reduce((n, s) => n + s.units.length, 0)}개 표현`}{" "}
                        · {new Date(d.createdAt).toLocaleDateString("ko-KR")}
                      </small>
                    </div>
                    <button
                      aria-label={`${d.name} 삭제`}
                      onClick={() => {
                        if (
                          window.confirm(
                            "이 자료 버전과 검색 평가 기록을 삭제할까요? 원본 교재는 유지됩니다.",
                          )
                        )
                          void work(
                            { action: "delete-dataset", id: d.id },
                            "자료 버전을 삭제했어요.",
                          );
                      }}
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <section className="hm-panel">
              <h3>2. 같은 질문으로 검색 품질 확인</h3>
              <p>
                정답 교재를 찾는지 확인합니다. 이 점수는 답변의 자연스러움이나
                교육 품질 평가를 대신하지 않아요.
              </p>
              <label>
                확인할 자료 버전
                <select
                  aria-label="확인할 자료 버전"
                  value={datasetId}
                  onChange={(e) => setDatasetId(e.target.value)}
                >
                  <option value="">자료 버전 선택</option>
                  {data.datasets
                    .filter((d) => !d.invalidatedAt)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="hm-grid">
                <label>
                  평가 언어
                  <select
                    aria-label="평가 언어"
                    value={language}
                    onChange={(e) => {
                      setLanguage(e.target.value as StudyLanguage);
                      setExpected("");
                    }}
                  >
                    {Object.entries(studyLanguages).map(([id, l]) => (
                      <option key={id} value={id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  평가 레벨
                  <select
                    aria-label="평가 레벨"
                    value={level}
                    onChange={(e) => {
                      setLevel(Number(e.target.value));
                      setExpected("");
                    }}
                  >
                    {curriculum.levels.map((l) => (
                      <option key={l.id} value={l.id}>
                        레벨 {l.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  평가 상황
                  <select
                    aria-label="평가 상황"
                    value={scene}
                    onChange={(e) => {
                      setScene(e.target.value);
                      setExpected("");
                    }}
                  >
                    {curriculum.scenes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  평가 기능
                  <select
                    aria-label="평가 기능"
                    value={mode}
                    onChange={(e) => {
                      setMode(e.target.value as "chat" | "translation");
                      setExpected("");
                    }}
                  >
                    <option value="chat">AI 대화</option>
                    <option value="translation">번역</option>
                  </select>
                </label>
              </div>
              <label>
                평가 질문
                <input
                  value={query}
                  maxLength={300}
                  placeholder="예: 따뜻한 커피를 주문하고 싶어요"
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label>
                기대하는 검색 결과
                <select
                  aria-label="기대하는 검색 결과"
                  value={expected}
                  onChange={(e) => setExpected(e.target.value)}
                >
                  <option value="">참고 자료가 없어야 함</option>
                  {data.published
                    .filter(
                      (d) =>
                        d.language === language &&
                        (mode === "translation" ||
                          (d.level === level && d.scene === scene)),
                    )
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                </select>
              </label>
              <button
                disabled={!query.trim()}
                onClick={() =>
                  void work(
                    {
                      action: "case",
                      case: {
                        language,
                        level,
                        scene,
                        mode,
                        text: query,
                        expectedSourceId: expected || null,
                      },
                    },
                    "평가 질문을 추가했어요. 의미 검색 적용은 다시 평가한 후 켜 주세요.",
                  ).then((r) => {
                    if (r) setQuery("");
                  })
                }
              >
                평가 질문 추가
              </button>
              <ul className="la-versions">
                {data.cases.map((c) => (
                  <li key={c.id}>
                    <div>
                      <strong>{c.text}</strong>
                      <small>
                        {studyLanguages[c.language].name} ·{" "}
                        {c.expectedSourceId
                          ? data.published.find(
                              (d) => d.id === c.expectedSourceId,
                            )?.title || "회수된 교재"
                          : "참고 자료 없음"}
                      </small>
                    </div>
                    <button
                      aria-label={`${c.text} 평가 질문 삭제`}
                      onClick={() =>
                        void work(
                          { action: "delete-case", id: c.id },
                          "평가 질문을 삭제했어요.",
                        )
                      }
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
              <button
                className="hm-primary"
                disabled={!valid || !data.cases.length}
                onClick={() =>
                  void work(
                    { action: "evaluate", id: datasetId },
                    "어휘 검색 평가를 완료했어요.",
                  )
                }
              >
                어휘 검색 평가
              </button>
              <ul className="la-versions" aria-label="검색 평가 결과">
                {[...data.evaluations]
                  .reverse()
                  .slice(0, 8)
                  .map((e) => (
                    <li key={e.id}>
                      <div>
                        <strong>
                          {e.engine === "lexical" ? "어휘" : "의미"} 검색{" "}
                          {e.passed}/{e.total} 통과
                        </strong>
                        <small>
                          {
                            data.datasets.find((d) => d.id === e.datasetId)
                              ?.name
                          }{" "}
                          · {new Date(e.createdAt).toLocaleString("ko-KR")}
                        </small>
                        {e.results
                          .filter((r) => !r.passed)
                          .map((r) => (
                            <p key={r.caseId}>
                              재검토:{" "}
                              {data.cases.find((c) => c.id === r.caseId)
                                ?.text || "변경된 평가 질문"}
                            </p>
                          ))}
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
            <section className="hm-panel">
              <h3>3. 의미가 비슷한 표현 찾기</h3>
              <p>
                선택한 버전으로 검색 인덱스를 만들고 평가합니다. 정답이 있는
                질문과 자료가 없어야 하는 질문을 모두 통과하면 앱에 적용할 수
                있어요.
              </p>
              {!data.capabilities.embeddingConfigured && (
                <p className="la-empty">
                  의미 검색 모델 연결 전입니다. 서버의 임베딩 주소·키·모델을
                  설정하면 사용할 수 있어요. 지금은 어휘 검색을 사용합니다.
                </p>
              )}
              <div className="la-actions">
                <button
                  disabled={!valid || !data.capabilities.embeddingConfigured}
                  onClick={() =>
                    void work(
                      { action: "build-index", id: datasetId },
                      "의미 검색 인덱스를 만들었어요. 평가 후 앱에 적용하세요.",
                    )
                  }
                >
                  검색 인덱스 만들기
                </button>
                <button
                  disabled={
                    !valid ||
                    data.index?.datasetId !== datasetId ||
                    !data.cases.length ||
                    !data.capabilities.embeddingConfigured
                  }
                  onClick={() =>
                    void work(
                      { action: "evaluate-semantic", id: datasetId },
                      "의미 검색 평가를 완료했어요.",
                    )
                  }
                >
                  의미 검색 평가
                </button>
                <button
                  disabled={!data.index}
                  onClick={() =>
                    void work(
                      { action: "semantic", enabled: !data.semanticEnabled },
                      data.semanticEnabled
                        ? "어휘 검색으로 돌아왔어요."
                        : "검증한 자료 버전으로 의미 검색을 적용했어요.",
                    )
                  }
                >
                  {data.semanticEnabled
                    ? "어휘 검색으로 복원"
                    : "의미 검색 앱에 적용"}
                </button>
              </div>
              {data.index && (
                <p className="hm-muted">
                  인덱스:{" "}
                  {
                    data.datasets.find((d) => d.id === data.index?.datasetId)
                      ?.name
                  }{" "}
                  / {data.index.count}개 표현. 원본이 바뀌면 사용을 중지합니다.
                </p>
              )}
            </section>
            <section className="hm-panel">
              <h3>4. 모델 추가 학습</h3>
              <p>
                별도 권한을 확인한 학습 자료를 LiteLLM으로 전달합니다. 시험
                자료는 제공자 학습에 보내지 않고 결과 검수에 사용하세요.
              </p>
              <p className="la-empty">
                {data.capabilities.trainingConfigured
                  ? `학습 대상: ${data.capabilities.trainingModel} / 학습 분할 최소 ${data.capabilities.minimum ?? "미설정"}개. ${data.capabilities.enabled ? "실행 가능" : "실행 비활성"}`
                  : "학습 전용 서버 연결 전입니다. 주소·키·학습 모델과 제공자 최소 예제 수를 설정해 주세요."}
              </p>
              <div className="la-actions">
                {(["train", "validation", "test"] as const).map((s, i) => (
                  <button
                    key={s}
                    disabled={!valid || dataset?.purpose !== "fine-tuning"}
                    onClick={() => void download(s)}
                  >
                    {["학습", "검증", "시험"][i]} JSONL 받기
                  </button>
                ))}
                <button
                  disabled={
                    !valid ||
                    dataset?.purpose !== "fine-tuning" ||
                    !data.capabilities.trainingConfigured ||
                    !data.capabilities.minimum
                  }
                  onClick={() =>
                    void work(
                      { action: "prepare-training", id: datasetId },
                      "학습 작업을 준비했어요. 아직 제공자에 제출하지 않았어요.",
                    )
                  }
                >
                  학습 작업 준비
                </button>
              </div>
              <ul className="la-jobs">
                {[...data.jobs].reverse().map((j) => (
                  <li key={j.id}>
                    <div>
                      <strong>
                        {data.datasets.find((d) => d.id === j.datasetId)?.name}{" "}
                        <span className="la-status">
                          {data.activeJobId === j.id
                            ? "앱에 적용 중"
                            : jobLabels[j.status]}
                        </span>
                      </strong>
                      <p>
                        {j.target}
                        {j.resultModel ? ` → ${j.resultModel}` : ""}
                      </p>
                      {j.message && <p role="status">{j.message}</p>}
                      {data.datasets.find((d) => d.id === j.datasetId)
                        ?.invalidatedAt && (
                        <p className="hm-alert">
                          원본 변경·회수로 사용할 수 없는 자료입니다. 실행 중인
                          작업은 제공자 상태를 확인하고 취소해 주세요.
                        </p>
                      )}
                    </div>
                    <div className="la-actions">
                      {data.activeJobId !== j.id &&
                        ["succeeded", "failed", "cancelled"].includes(
                          j.status,
                        ) && (
                          <button
                            onClick={() => {
                              if (
                                window.confirm(
                                  "완료된 작업의 관리자 기록을 삭제할까요? 제공자에 전송한 파일과 학습 모델은 삭제되지 않습니다.",
                                )
                              )
                                void work(
                                  {
                                    action: "delete-training-record",
                                    id: j.id,
                                  },
                                  "관리자 작업 기록을 삭제했어요. 제공자 파일·모델 정리는 제공자 콘솔에서 진행해 주세요.",
                                );
                            }}
                          >
                            작업 기록 삭제
                          </button>
                        )}
                      {j.status === "prepared" && (
                        <button
                          className="hm-primary"
                          disabled={
                            !data.capabilities.enabled ||
                            !!data.datasets.find((d) => d.id === j.datasetId)
                              ?.invalidatedAt
                          }
                          onClick={() => {
                            if (
                              window.confirm(
                                "학습·검증 자료를 제공자에 전송하고 유료 학습을 시작할까요? 비용과 예산은 제공자 설정을 따릅니다.",
                              )
                            )
                              void work(
                                {
                                  action: "start-training",
                                  id: j.id,
                                  confirmed: true,
                                },
                                "학습 요청을 제출했어요. 상태 조회로 진행 상황을 확인하세요.",
                              );
                          }}
                        >
                          학습 시작
                        </button>
                      )}
                      {j.status !== "prepared" && (
                        <button
                          onClick={() =>
                            void work(
                              { action: "refresh-training", id: j.id },
                              "제공자 상태를 확인했어요.",
                            )
                          }
                        >
                          상태 조회
                        </button>
                      )}
                      {!["succeeded", "failed", "cancelled"].includes(
                        j.status,
                      ) && (
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                "이 학습 작업의 취소를 요청할까요? 이미 발생한 비용은 제공자 정책을 따릅니다.",
                              )
                            )
                              void work(
                                { action: "cancel-training", id: j.id },
                                "취소 요청 결과를 확인했어요.",
                              );
                          }}
                        >
                          학습 취소
                        </button>
                      )}
                      {j.status === "succeeded" && (
                        <>
                          <button
                            onClick={() => {
                              setReviewId(j.id);
                              setReview(j.review?.notes || "");
                              setReviewed(false);
                            }}
                          >
                            시험셋 검수 기록
                          </button>
                          <button
                            disabled={
                              !j.review ||
                              !j.aliasReady ||
                              !!data.datasets.find((d) => d.id === j.datasetId)
                                ?.invalidatedAt
                            }
                            onClick={() => {
                              if (
                                window.confirm(
                                  "이 모델을 같은 언어·레벨·상황의 기본 AI 대화에 적용할까요?",
                                )
                              )
                                void work(
                                  { action: "activate-training", id: j.id },
                                  "검수한 학습 모델을 해당 범위의 AI 대화에 적용했어요.",
                                );
                            }}
                          >
                            검수 모델 앱에 적용
                          </button>
                          {!j.aliasReady && (
                            <small>
                              결과 모델의 앱용 LiteLLM 별칭 등록이 필요해요.
                            </small>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {reviewId && (
                <div className="la-review">
                  <label>
                    시험셋 검수 결과
                    <textarea
                      value={review}
                      minLength={20}
                      maxLength={1000}
                      onChange={(e) => setReview(e.target.value)}
                      placeholder="기본 모델과 비교한 언어·뜻·발음·난이도 및 실패 사례를 기록해 주세요."
                    />
                  </label>
                  <label className="la-check">
                    <input
                      type="checkbox"
                      checked={reviewed}
                      onChange={(e) => setReviewed(e.target.checked)}
                    />
                    학습에 보내지 않은 시험셋으로 결과를 직접 검수했어요.
                  </label>
                  <button
                    disabled={!reviewed || review.trim().length < 20}
                    onClick={() =>
                      void work(
                        {
                          action: "review-training",
                          id: reviewId,
                          notes: review,
                          confirmed: reviewed,
                        },
                        "시험셋 검수 결과를 저장했어요.",
                      ).then((r) => {
                        if (r) setReviewId("");
                      })
                    }
                  >
                    검수 기록 저장
                  </button>
                </div>
              )}
              {data.activeJobId && (
                <button
                  onClick={() =>
                    void work(
                      { action: "default-model" },
                      "기본 AI 모델로 복원했어요.",
                    )
                  }
                >
                  기본 AI 모델로 복원
                </button>
              )}
            </section>
          </fieldset>
          {busy && (
            <p role="status">
              학습 관리 작업을 처리하고 있어요. 화면을 유지해 주세요.
            </p>
          )}
        </>
      )}
    </section>
  );
}

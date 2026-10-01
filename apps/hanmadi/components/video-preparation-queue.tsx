"use client";
import { useEffect, useRef, useState } from "react";
import {
  curriculum,
  studyLanguages,
  isStudyLanguage,
  type StudyLanguage,
} from "@/lib/v2";
import type { ContentDraft } from "@/lib/knowledge";
import type { YoutubeVideo } from "@/lib/youtube-search";
import {
  VIDEO_CONCURRENCY,
  VIDEO_SELECTION_LIMIT,
  type VideoResult,
} from "@/lib/video-policy";
const labels = {
  waiting: "분석 준비",
  running: "분석·평가 중",
  created: "초안 완료",
  failed: "다시 시도 가능",
  skipped: "학습 후보 제외",
};
export function VideoPreparationQueue({
  videos,
  disabled,
  onRemove,
  onClear,
  onCreated,
  onReview,
  onOpenLibrary,
  onBusyChange,
}: {
  videos: YoutubeVideo[];
  disabled: boolean;
  onRemove: (id: string) => void;
  onClear: () => void;
  onCreated: (draft: ContentDraft) => void;
  onReview: (draft: ContentDraft) => void;
  onOpenLibrary: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [entries, setEntries] = useState<Record<string, VideoResult>>({});
  const [language, setLanguage] = useState<StudyLanguage | "">("");
  const [scene, setScene] = useState("");
  const [level, setLevel] = useState(1);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [notice, setNotice] = useState("");
  const operation = useRef(false),
    stop = useRef(false),
    mounted = useRef(true);
  const locked = disabled || running;
  const pending = videos.filter(
    (v) =>
      !entries[v.id] ||
      entries[v.id].state === "failed" ||
      entries[v.id].state === "running",
  );
  const completed = videos.filter(
    (v) => entries[v.id]?.state === "created",
  ).length;
  const skipped = videos.filter(
    (v) => entries[v.id]?.state === "skipped",
  ).length;
  const ready =
    isStudyLanguage(language) &&
    !!scene &&
    pending.length > 0 &&
    videos.length <= VIDEO_SELECTION_LIMIT;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop.current = true;
    };
  }, []);
  useEffect(() => {
    if (!running) return;
    const leave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [running]);
  const update = (id: string, entry: VideoResult) => {
    if (mounted.current)
      setEntries((previous) => ({ ...previous, [id]: entry }));
  };
  async function post(body: object) {
    const response = await fetch("/api/study/admin/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(140000),
    });
    const data = await response.json();
    if ([401, 403, 429].includes(response.status)) stop.current = true;
    if (!response.ok)
      throw new Error(data.error || "분석 요청을 완료하지 못했어요.");
    return data;
  }
  async function generateAll() {
    if (operation.current || locked || !ready) return;
    operation.current = true;
    stop.current = false;
    setRunning(true);
    setStopping(false);
    setNotice("");
    onBusyChange(true);
    try {
      const { batchId } = await post({
        action: "prepare",
        ids: pending.map((v) => v.id),
        language,
        scene,
        level,
      });
      const queue = [...pending];
      async function worker() {
        while (!stop.current && mounted.current) {
          const video = queue.shift();
          if (!video) return;
          update(video.id, {
            state: "running",
            message: "영상 내용 분석 → JEV 학습 가치 평가 → 통과한 표현 저장",
          });
          try {
            let result: VideoResult = {
              state: "running",
              message: "분석 중이에요.",
            };
            for (let tries = 0; tries < 60; tries++) {
              result = await post({
                action: "process",
                batchId,
                videoId: video.id,
              });
              if (!mounted.current) return;
              if (
                !["created", "skipped", "failed", "running"].includes(
                  result.state,
                )
              )
                throw new Error("결과 확인 필요");
              update(video.id, result);
              if (result.state !== "running" || stop.current) break;
              await new Promise((r) => setTimeout(r, 2000));
            }
            if (result.state === "running")
              update(video.id, {
                state: "failed",
                message:
                  "처리 중인 결과가 있어요. 다시 시도하면 기존 결과부터 확인해요.",
              });
            if (result.draft) onCreated(result.draft);
          } catch (e) {
            update(video.id, {
              state: "failed",
              message:
                e instanceof Error &&
                !["TypeError", "TimeoutError", "SyntaxError"].includes(e.name)
                  ? e.message
                  : "응답을 확인하지 못했어요. 다시 시도하면 저장 결과를 확인하고 이어서 처리해요.",
            });
          }
        }
      }
      await Promise.all(
        Array.from(
          { length: Math.min(VIDEO_CONCURRENCY, queue.length) },
          worker,
        ),
      );
      if (mounted.current)
        setNotice(
          stop.current
            ? "중지했어요. 완료한 자료는 유지되고 남은 영상은 이어서 처리할 수 있어요."
            : "일괄 처리를 마쳤어요. 영상별 결과를 확인해 주세요.",
        );
    } catch (e) {
      if (mounted.current)
        setNotice(e instanceof Error ? e.message : "분석을 시작하지 못했어요.");
    } finally {
      operation.current = false;
      if (mounted.current) {
        setRunning(false);
        setStopping(false);
        onBusyChange(false);
      }
    }
  }
  return (
    <aside
      className="vs-tray"
      id="video-preparation"
      tabIndex={-1}
      aria-label="자료 준비 목록"
    >
      <div className="vs-tray-heading">
        <h2>
          자료 준비 목록{" "}
          <span>
            {videos.length}/{VIDEO_SELECTION_LIMIT}
          </span>
        </h2>
        <button
          type="button"
          disabled={!videos.length || locked}
          onClick={onClear}
        >
          전체 해제
        </button>
      </div>
      <p className="vs-tray-help">
        영상만 고르면 내용을 분석하고, 기존 자료와 비교해 학습 가치가 있는
        표현만 초안으로 만들어요.
      </p>
      <div className="vs-analysis-steps" aria-label="자료 생성 과정">
        <span>1 영상 분석</span>
        <span>2 JEV 평가</span>
        <span>3 초안 저장</span>
      </div>
      {notice && (
        <p className="vs-batch-notice" role="status">
          {notice}
        </p>
      )}
      {!videos.length ? (
        <div className="vs-tray-empty">
          <span aria-hidden="true">＋</span>
          <p>함께 분석할 영상을 선택해 주세요.</p>
          <small>
            한 번에 최대 10개 · 동시에 3개 분석
            <br />
            공개된 15분 이하 영상
          </small>
        </div>
      ) : (
        <>
          <div className="vs-batch-settings">
            <h3>저장할 자료 설정</h3>
            <small>
              학습자에게 필요한 언어·상황·난이도를 기준으로 평가해요.
            </small>
            <label>
              학습 언어
              <select
                aria-label="학습 언어"
                value={language}
                disabled={locked}
                onChange={(e) =>
                  setLanguage(e.target.value as StudyLanguage | "")
                }
              >
                <option value="" disabled>
                  학습 언어 선택
                </option>
                {Object.entries(studyLanguages).map(([id, l]) => (
                  <option value={id} key={id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              자료에 사용할 상황
              <select
                aria-label="자료에 사용할 상황"
                value={scene}
                disabled={locked}
                onChange={(e) => setScene(e.target.value)}
              >
                <option value="" disabled>
                  상황 선택
                </option>
                {curriculum.scenes.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              공통 연습 레벨
              <select
                aria-label="공통 연습 레벨"
                value={level}
                disabled={locked}
                onChange={(e) => setLevel(Number(e.target.value))}
              >
                {curriculum.levels.map((l) => (
                  <option value={l.id} key={l.id}>
                    {l.id} · {l.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ol className="vs-queue vs-batch-queue">
            {videos.map((video) => {
              const entry = entries[video.id];
              return (
                <li key={video.id} data-video-id={video.id}>
                  <div className="vs-batch-item-heading">
                    <strong>{video.title}</strong>
                    <span
                      className={`vs-job-status vs-job-${entry?.state ?? "waiting"}`}
                    >
                      {labels[entry?.state ?? "waiting"]}
                    </span>
                  </div>
                  {entry?.message && (
                    <p className="vs-item-result" role="status">
                      {entry.message}
                    </p>
                  )}
                  {entry?.judgments && (
                    <small>
                      통과 {entry.judgments.filter((j) => j.accepted).length}개
                      · 제외 {entry.judgments.filter((j) => !j.accepted).length}
                      개
                    </small>
                  )}
                  {entry?.draft?.videoReview && (
                    <details className="vs-video-evidence">
                      <summary>분석 구간·평가 근거</summary>
                      <p>
                        JEV는 분석된 표현과 요약 근거를 평가하며, 원본 영상을
                        직접 확인하지 않아요. 게시 전 연결된 구간과 뜻·발음을
                        확인해 주세요.
                      </p>
                      <p>
                        기본 교재와 기존 자료{" "}
                        {entry.draft.videoReview.referenceCount}개 중 관련 표현{" "}
                        {entry.draft.videoReview.comparedCount}개 비교. 정확히
                        같은 표현은 전체 자료에서 검사해요.
                      </p>
                      {entry.draft.videoReview.evidence.map((e, i) => (
                        <p key={i}>
                          <a
                            href={`${video.url}&t=${Math.floor(e.at)}s`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {Math.floor(e.at / 60)}:
                            {String(Math.floor(e.at % 60)).padStart(2, "0")}
                          </a>{" "}
                          {e.evidence} ·{" "}
                          {entry.judgments?.[i]?.accepted ? "통과" : "제외"}
                        </p>
                      ))}
                    </details>
                  )}
                  <div className="vs-queue-actions">
                    {entry?.draft && (
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => onReview(entry.draft!)}
                      >
                        초안 검수
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => onRemove(video.id)}
                      aria-label={`${video.title} 선택 해제`}
                    >
                      목록에서 빼기
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="vs-batch-footer">
            <p className="vs-batch-count" role="status">
              초안 완료 {completed}개 · 제외 {skipped}개 · 남은 영상{" "}
              {pending.length}개
            </p>
            {!language || !scene ? (
              <p>저장할 자료의 학습 언어와 상황을 선택해 주세요.</p>
            ) : null}
            {running ? (
              <button
                type="button"
                disabled={stopping}
                onClick={() => {
                  stop.current = true;
                  setStopping(true);
                }}
              >
                {stopping
                  ? "진행 중인 영상 완료 후 중지할게요…"
                  : "진행 중인 영상까지만 분석"}
              </button>
            ) : (
              <button
                type="button"
                className="vs-primary vs-create-all"
                disabled={locked || !ready}
                onClick={() => void generateAll()}
              >
                {completed || skipped
                  ? "남은 영상 분석"
                  : "전체 분석·자료 만들기"}{" "}
                ({pending.length}개)
              </button>
            )}
            <small>
              공개 영상의 소리·화면을 분석해요. JEV 평가 실패·불확실·중복 표현은
              학습 자료에 추가하지 않아요.
            </small>
            {completed > 0 && (
              <button type="button" disabled={locked} onClick={onOpenLibrary}>
                완료한 자료 모아보기
              </button>
            )}
          </div>
        </>
      )}
      <div className="vs-rights-note">
        <strong>분석 후 검수해서 반영해요</strong>
        <p>
          원문 파일은 필요 없어요. 분석 결과와 출처를 검수한 뒤 게시하면 앱
          학습과 AI 대화에 활용돼요. 모델 자체의 유료 파인튜닝은 별도
          작업이에요.
        </p>
      </div>
    </aside>
  );
}

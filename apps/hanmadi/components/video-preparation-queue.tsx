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
  VIDEO_STAGE_LABELS,
  videoDisposition,
  videoJudgmentLabel,
  videoJudgmentReason,
  VIDEO_SELECTION_LIMIT,
  type VideoResult,
} from "@/lib/video-policy";
const labels = {
  waiting: "분석 준비",
  running: "분석·평가 중",
  created: "초안 완료",
  review: "검토 대기",
  failed: "처리 중단",
  blocked: "분석 불가",
  skipped: "학습 후보 제외",
};
function stageReceipt(entry: VideoResult) {
  if (entry.state === "blocked" || entry.state === "failed" && entry.stage === "checking")
    return "내용 분석 미실행 · JEV 평가 미실행 · 초안 저장 안 됨";
  if (entry.state === "created" || entry.state === "review") return "내용 분석·JEV 평가 완료 · 초안 보관됨";
  if (entry.state === "skipped") return "내용 분석·JEV 평가 완료 · 저장할 표현 없음";
  if (entry.state === "failed") {
    if (entry.stage === "analyzing") return "내용 분석에서 중단 · JEV 평가 미실행 · 초안 저장 안 됨";
    if (entry.stage === "evaluating") return "내용 분석 완료 · JEV 평가에서 중단 · 초안 저장 안 됨";
    if (entry.stage === "saving") return "내용 분석·JEV 평가 완료 · 저장 결과 확인 필요";
    return "응답이 끊겨 결과를 확인하지 못했어요. 저장 여부부터 확인할 수 있어요.";
  }
  if (entry.stage === "evaluating") return "내용 분석 완료 · 평가 결과를 기다리고 있어요.";
  if (entry.stage === "saving") return "내용 분석·JEV 평가 완료 · 초안을 저장하고 있어요.";
  return "처리 결과를 기다리고 있어요.";
}

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
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [attempted, setAttempted] = useState(false);
  const [pollDelayed, setPollDelayed] = useState(false);
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
    (v) => ["created", "review"].includes(entries[v.id]?.state),
  ).length;
  const reviewCount = videos.filter((v) => entries[v.id]?.state === "review").length;
  const skipped = videos.filter(
    (v) => entries[v.id]?.state === "skipped",
  ).length;
  const blocked = videos.filter((v) => entries[v.id]?.state === "blocked").length;
  const failed = videos.filter((v) => entries[v.id]?.state === "failed").length;
  const active = videos.filter((v) => entries[v.id]?.state === "running").length;
  const resolved = completed + skipped + blocked + failed;
  const resetSettings = () => { setEntries({}); setAttempted(false); setNotice(""); setSettingsOpen(true); };
  function remove(id: string) {
    setEntries((previous) => {
      const next = { ...previous }; delete next[id]; return next;
    });
    onRemove(id);
  }
  const summary = running
    ? active ? `${active}개 처리 중이에요. 이 화면에서 기다려 주세요.` : "분석 목록을 확인하고 있어요. 잠시 기다려 주세요."
    : blocked || failed
      ? `분석 불가 ${blocked}개 · 처리 중단·확인 필요 ${failed}개. 아래 영상별 이유를 확인해 주세요.`
      : notice || videos.length > resolved
        ? `아직 처리하지 않은 영상 ${videos.length - resolved}개가 있어요.`
        : skipped
          ? `분석과 평가를 마쳤고, ${skipped}개 영상은 저장할 표현이 없어 제외했어요.`
          : "초안을 검수한 뒤 게시하면 학습에 사용할 수 있어요.";
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
    setAttempted(true);
    setSettingsOpen(false);
    setPollDelayed(false);
    onBusyChange(true);
    let polling = true;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const { batchId } = await post({
        action: "prepare",
        ids: pending.map((v) => v.id),
        language,
        scene,
        level,
      });
      async function poll() {
        if (!polling || !mounted.current) return;
        try {
          const response = await fetch("/api/study/admin/videos", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "status", batchId }),
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok) throw new Error("status unavailable");
          const data = await response.json();
          if (polling && mounted.current) {
            setPollDelayed(false);
            setEntries((previous) => {
              const next = { ...previous };
              for (const [id, result] of Object.entries(data.entries ?? {}) as [string, VideoResult | null][])
                if (previous[id]?.state === "running" && result?.state === "running") next[id] = result;
              return next;
            });
          }
        } catch { if (polling && mounted.current) setPollDelayed(true); }
        if (polling && mounted.current) pollTimer = setTimeout(() => void poll(), 5000);
      }
      pollTimer = setTimeout(() => void poll(), 1500);
      const queue = [...pending];
      async function worker() {
        while (!stop.current && mounted.current) {
          const video = queue.shift();
          if (!video) return;
          update(video.id, {
            state: "running",
            message: "서버에 요청했어요. 영상 확인부터 순서대로 진행해요.",
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
                !["created", "review", "skipped", "failed", "running", "blocked"].includes(
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
            : "",
        );
    } catch (e) {
      if (mounted.current)
        setNotice(e instanceof Error ? e.message : "분석을 시작하지 못했어요.");
    } finally {
      polling = false;
      clearTimeout(pollTimer);
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
          onClick={() => { resetSettings(); onClear(); }}
        >
          전체 해제
        </button>
      </div>
      <p className="vs-tray-help">
        영상만 고르면 내용을 분석하고, 기존 자료와 비교해 학습 가치가 있는
        표현을 초안으로 만들어요. 확신이 낮은 후보는 검토 대기로 보관해요.
      </p>
      <p className="vs-analysis-limit">공개된 15분 이하 영상 · 한 번에 최대 10개 · 동시에 3개 처리</p>
      {attempted && videos.length > 0 && (
        <div className={`vs-outcome vs-outcome-${running ? "running" : blocked || failed ? "attention" : "saved"}`} role="status" aria-live="polite">
          <strong>{running ? `자료를 만들고 있어요 (${resolved}/${videos.length}개 결과 확인)` : completed ? `초안 ${completed}개를 보관했어요` : "저장된 초안이 없어요"}</strong>
          <p>{summary}</p>
          {running && <progress aria-label="결과를 확인한 영상 수" max={videos.length} value={resolved} />}
          {running && pollDelayed && <small>진행 상태 갱신이 지연되고 있어요. 처리 응답을 기다리고 있으며 다시 요청할 필요는 없어요.</small>}
        </div>
      )}
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
            <button type="button" className="vs-settings-toggle" disabled={locked} aria-expanded={settingsOpen}
              aria-controls="video-material-settings" onClick={() => setSettingsOpen(!settingsOpen)}>
              <strong>저장할 자료 설정</strong>
              <span>{language ? studyLanguages[language].name : "언어 선택"} · {curriculum.scenes.find((s) => s.id === scene)?.title ?? "상황 선택"} · 레벨 {level} {settingsOpen ? "접기" : "변경"}</span>
            </button>
            {settingsOpen && <div id="video-material-settings" className="vs-settings-fields">
            <small>
              학습자에게 필요한 언어·상황·난이도를 기준으로 평가해요.
            </small>
            <label>
              학습 언어
              <select
                aria-label="학습 언어"
                value={language}
                disabled={locked}
                onChange={(e) => { resetSettings(); setLanguage(e.target.value as StudyLanguage | ""); }}
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
                onChange={(e) => { resetSettings(); setScene(e.target.value); }}
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
                onChange={(e) => { resetSettings(); setLevel(Number(e.target.value)); }}
              >
                {curriculum.levels.map((l) => (
                  <option value={l.id} key={l.id}>
                    {l.id} · {l.title}
                  </option>
                ))}
              </select>
            </label>
            </div>}
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
                      {entry?.state === "running" && entry.stage ? `${VIDEO_STAGE_LABELS[entry.stage]} 중` : entry?.state === "failed" && (!entry.stage || entry.stage === "saving") ? "결과 확인 필요" : labels[entry?.state ?? "waiting"]}
                    </span>
                  </div>
                  {entry && <p className="vs-stage-receipt">{stageReceipt(entry)}</p>}
                  {entry?.message && (
                    <p className="vs-item-result" role="status">
                      {entry.message}
                    </p>
                  )}
                  {entry?.judgments && (
                    <small>
                      통과 {entry.judgments.filter((j) => j.accepted).length}개
                      · 검토 대기 {entry.judgments.filter((j) => videoDisposition(j) === "review").length}개
                      · 제외 {entry.judgments.filter((j) => videoDisposition(j) === "excluded").length}개
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
                          {(() => {
                            const judgment = entry.draft!.videoReview!.judgments.find((j) => j.index === i);
                            return judgment ? `${videoJudgmentLabel(judgment)} · ${videoJudgmentReason(judgment)}` : "평가 기록 없음";
                          })()}
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
                    {entry?.state === "blocked" && <a href={video.url} target="_blank" rel="noopener noreferrer">YouTube에서 확인</a>}
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => remove(video.id)}
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
              초안 {completed}개 (검토 대기 {reviewCount}개) · 후보 제외 {skipped}개 · 분석 불가 {blocked}개 · 중단·확인 필요 {failed}개
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
            ) : !pending.length && blocked > 0 ? (
              <button type="button" className="vs-primary vs-create-all" disabled={locked}
                onClick={() => videos.filter((v) => entries[v.id]?.state === "blocked").forEach((v) => remove(v.id))}>
                분석 불가 영상 빼기 ({blocked}개)
              </button>
            ) : pending.length > 0 ? (
              <button
                type="button"
                className="vs-primary vs-create-all"
                disabled={locked || !ready}
                onClick={() => void generateAll()}
              >
                {failed ? "결과 확인·다시 시도" : completed || skipped || blocked ? "남은 영상 분석" : "전체 분석·자료 만들기"}{" "}
                ({pending.length}개)
              </button>
            ) : null}
            <small>
              {blocked > 0 ? "분석 불가 영상은 다시 시도해도 처리되지 않아요. 목록에서 빼고 다른 영상을 선택해 주세요. " : ""}
              {failed > 0 ? "다시 시도하면 저장된 결과부터 확인해 중복 생성을 줄여요. " : ""}
              저장한 초안은 검수·게시 전까지 앱 학습에 사용하지 않아요.
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

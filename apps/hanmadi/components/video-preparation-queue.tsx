"use client";

import { useEffect, useRef, useState } from "react";
import { curriculum, studyLanguages } from "@/lib/v2";
import type { ContentDraft } from "@/lib/knowledge";
import type { SelectedVideo } from "./youtube-video-search";

type Entry = {
  text: string;
  state: "waiting" | "running" | "created" | "failed" | "unknown";
  message?: string;
  draft?: ContentDraft;
};
const labels = {
  waiting: "원문 준비",
  running: "만드는 중",
  created: "초안 완료",
  failed: "다시 시도 가능",
  unknown: "완료 여부 확인 필요",
};
const empty: Entry = { text: "", state: "waiting" };
const validSource = (text: string) =>
  text.trim().length >= 20 && text.length <= 12000;

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
  videos: SelectedVideo[];
  disabled: boolean;
  onRemove: (id: string) => void;
  onClear: () => void;
  onCreated: (draft: ContentDraft) => void;
  onReview: (draft: ContentDraft) => void;
  onOpenLibrary: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [rights, setRights] = useState("");
  const [level, setLevel] = useState(1);
  const [confirmedFor, setConfirmedFor] = useState("");
  const [running, setRunning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [notice, setNotice] = useState("");
  const operation = useRef(false);
  const stop = useRef(false);
  const mounted = useRef(true);
  const busy = running || importing;
  const locked = disabled || busy;
  const confirmationKey = JSON.stringify([rights, videos.map((v) => v.id)]);
  const confirmed = confirmedFor === confirmationKey;
  const pending = videos.filter((v) =>
    ["waiting", "failed"].includes((entries[v.id] ?? empty).state),
  );
  const missing = pending.filter(
    (v) => !validSource(entries[v.id]?.text ?? ""),
  );
  const completed = videos.filter(
    (v) => entries[v.id]?.state === "created",
  ).length;
  const uncertain = videos.filter(
    (v) => entries[v.id]?.state === "unknown",
  ).length;
  const ready =
    pending.length > 0 &&
    missing.length === 0 &&
    rights.trim().length >= 10 &&
    confirmed;

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

  function source(id: string, text: string) {
    setEntries((previous) => ({
      ...previous,
      [id]: { text, state: "waiting" },
    }));
    setConfirmedFor("");
  }
  async function importFiles(files: File[], target?: string) {
    if (operation.current || locked || !files.length) return;
    operation.current = true;
    setImporting(true);
    onBusyChange(true);
    setNotice("");
    let count = 0;
    const failed: string[] = [];
    const used = new Set<string>();
    try {
      for (const file of files) {
        const id = target ?? file.name.replace(/\.(txt|srt|vtt)$/i, "");
        if (
          !/\.(txt|srt|vtt)$/i.test(file.name) ||
          file.size > 64000 ||
          used.has(id) ||
          !pending.some((v) => v.id === id)
        ) {
          failed.push(file.name);
          continue;
        }
        used.add(id);
        try {
          const text = await file.text();
          if (!mounted.current) return;
          if (!validSource(text)) {
            failed.push(file.name);
            continue;
          }
          source(id, text);
          count++;
        } catch {
          failed.push(file.name);
        }
      }
      setNotice(
        `원문 ${count}개를 연결했어요.${failed.length ? ` 연결하지 못한 파일 ${failed.length}개: ${failed.slice(0, 4).join(", ")}${failed.length > 4 ? " 외" : ""}. 파일 이름·형식·길이를 확인해 주세요.` : ""}`,
      );
    } finally {
      operation.current = false;
      if (mounted.current) {
        setImporting(false);
        onBusyChange(false);
      }
    }
  }
  async function generateAll() {
    if (operation.current || locked || !ready) return;
    operation.current = true;
    stop.current = false;
    setStopping(false);
    setRunning(true);
    onBusyChange(true);
    setNotice("");
    let succeeded = 0,
      failed = 0,
      unknown = 0;
    try {
      for (const video of pending) {
        if (stop.current || !mounted.current) break;
        const entry = entries[video.id] ?? empty;
        setEntries((previous) => ({
          ...previous,
          [video.id]: { ...entry, state: "running", message: undefined },
        }));
        try {
          const response = await fetch("/api/study/admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "generate",
              language: video.language,
              scene: video.scene,
              level,
              title: video.title.slice(0, 100),
              sourceUrl: video.url,
              rights: rights.trim(),
              rightsConfirmed: true,
              transcript: entry.text,
            }),
            signal: AbortSignal.timeout(60000),
          });
          const data = await response.json();
          if (!mounted.current) return;
          if (!response.ok) {
            // Server/network ambiguity never becomes an automatic retry that could duplicate a saved draft.
            if (response.status >= 500) throw new Error("uncertain response");
            failed++;
            setEntries((previous) => ({
              ...previous,
              [video.id]: {
                ...entry,
                state: "failed",
                message:
                  data.error ||
                  "자료를 만들지 못했어요. 입력 내용을 확인해 주세요.",
              },
            }));
            if ([401, 403, 429].includes(response.status)) {
              stop.current = true;
              break;
            }
            continue;
          }
          if (
            !data.draft?.id ||
            data.draft.sourceUrl !== video.url ||
            data.draft.status !== "draft"
          )
            throw new Error("unconfirmed saved draft");
          succeeded++;
          setEntries((previous) => ({
            ...previous,
            [video.id]: { text: "", state: "created", draft: data.draft },
          }));
          onCreated(data.draft);
        } catch {
          if (!mounted.current) return;
          unknown++;
          setEntries((previous) => ({
            ...previous,
            [video.id]: {
              ...entry,
              state: "unknown",
              message:
                "응답을 확인하지 못했어요. 중복 생성을 막기 위해 재실행하지 않아요. 콘텐츠 목록에서 저장 여부를 확인해 주세요.",
            },
          }));
          stop.current = true;
          break;
        }
      }
      if (mounted.current)
        setNotice(
          `${stop.current ? "일괄 생성을 중지했어요." : "일괄 생성을 마쳤어요."} 이번 실행: 초안 ${succeeded}개 완료${failed ? ` · 실패 ${failed}개` : ""}${unknown ? ` · 확인 필요 ${unknown}개` : ""}. 완료한 자료는 다시 만들지 않아요.`,
        );
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
          자료 준비 목록 <span>{videos.length}</span>
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
        영상별 원문을 연결하고 전체 자료를 한 번에 만드세요. 완성한 초안은
        콘텐츠 목록에 저장돼요. 준비 중인 목록·원문은 새로고침하면 비워져요.
      </p>
      {notice && (
        <p className="vs-batch-notice" role="status">
          {notice}
        </p>
      )}
      {!videos.length ? (
        <div className="vs-tray-empty">
          <span aria-hidden="true">＋</span>
          <p>함께 만들 영상을 선택해 주세요.</p>
          <small>
            ‘모든 페이지 전체 선택’으로
            <br />
            검색 결과를 한 번에 담을 수 있어요.
          </small>
        </div>
      ) : (
        <>
          <div className="vs-batch-settings">
            <h3>함께 만들 자료 설정</h3>
            <label>
              공통 연습 레벨
              <select
                aria-label="공통 연습 레벨"
                value={level}
                disabled={locked}
                onChange={(e) => setLevel(Number(e.target.value))}
              >
                {curriculum.levels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.id} · {l.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              목록 전체의 원문 사용권 근거
              <textarea
                value={rights}
                maxLength={500}
                disabled={locked}
                onChange={(e) => setRights(e.target.value)}
                placeholder="예: 직접 제작한 모든 영상의 원문. AI 처리와 수업 재사용 권한 보유."
              />
            </label>
            <label className="vs-file-input">
              원문 파일 여러 개 연결
              <input
                type="file"
                multiple
                accept=".txt,.srt,.vtt"
                disabled={locked}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  void importFiles(files);
                }}
              />
            </label>
            <small>
              영상 ID.txt / .srt / .vtt로 이름을 맞추면 자동 연결돼요. 원문은
              영상별로 20~12,000자이며, 아래에서 직접 입력할 수도 있어요.
            </small>
          </div>
          <ol className="vs-queue vs-batch-queue">
            {videos.map((video) => {
              const entry = entries[video.id] ?? empty;
              const editable = ["waiting", "failed"].includes(entry.state);
              return (
                <li key={video.id} data-video-id={video.id}>
                  <div className="vs-batch-item-heading">
                    <strong>{video.title}</strong>
                    <span className={`vs-job-status vs-job-${entry.state}`}>
                      {entry.state === "waiting" && validSource(entry.text)
                        ? "원문 준비됨"
                        : labels[entry.state]}
                    </span>
                  </div>
                  <small>
                    {studyLanguages[video.language].name} ·{" "}
                    {curriculum.scenes.find((s) => s.id === video.scene)?.title}{" "}
                    · 영상 ID {video.id}
                  </small>
                  {editable && (
                    <details className="vs-source-input">
                      <summary>
                        {validSource(entry.text)
                          ? `원문 ${entry.text.length.toLocaleString("ko-KR")}자 확인·수정`
                          : "이 영상의 원문 연결"}
                      </summary>
                      <label>
                        사용권이 있는 원문
                        <textarea
                          id={`video-source-${video.id}`}
                          aria-label={`${video.title} 원문`}
                          value={entry.text}
                          maxLength={12000}
                          disabled={locked}
                          onChange={(e) => source(video.id, e.target.value)}
                          placeholder="이 영상에 해당하는 텍스트·자막 원문을 붙여 넣으세요."
                        />
                      </label>
                      <label className="vs-file-input">
                        이 영상의 원문 파일
                        <input
                          type="file"
                          accept=".txt,.srt,.vtt"
                          aria-label={`${video.title} 원문 파일`}
                          disabled={locked}
                          onChange={(e) => {
                            const files = Array.from(e.target.files ?? []);
                            e.target.value = "";
                            void importFiles(files, video.id);
                          }}
                        />
                      </label>
                    </details>
                  )}
                  {entry.message && (
                    <p className="vs-item-error" role="status">
                      {entry.message}
                    </p>
                  )}
                  <div className="vs-queue-actions">
                    {entry.draft && (
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => onReview(entry.draft!)}
                        aria-label={`${video.title} 초안 검수`}
                      >
                        초안 검수
                      </button>
                    )}
                    {entry.state === "unknown" && (
                      <button
                        type="button"
                        disabled={locked}
                        onClick={onOpenLibrary}
                      >
                        콘텐츠 목록에서 확인
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
              초안 완료 {completed}개 · 만들 자료 {pending.length}개
              {uncertain ? ` · 확인 필요 ${uncertain}개` : ""}
            </p>
            {missing.length > 0 && (
              <p>
                원문 {missing.length}개를 먼저 연결해 주세요. 원문 없는 영상은
                자동으로 건너뛰지 않아요.
              </p>
            )}
            {pending.length > 0 && (
              <label className="vs-batch-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={locked}
                  onChange={(e) =>
                    setConfirmedFor(e.target.checked ? confirmationKey : "")
                  }
                />
                목록의 모든 원문을 AI로 처리하고 수업에 재사용할 권한을
                확인했어요.
              </label>
            )}
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
                  ? "현재 영상 완료 후 중지할게요…"
                  : "현재 영상까지만 만들기"}
              </button>
            ) : (
              <button
                type="button"
                className="vs-primary vs-create-all"
                disabled={locked || !ready}
                onClick={() => void generateAll()}
              >
                {completed || uncertain
                  ? `남은 자료 만들기 (${pending.length}개)`
                  : `전체 자료 만들기 (${pending.length}개)`}
              </button>
            )}
            <small>
              영상마다 별도 초안을 순서대로 만들어요. 검수 후 게시하기 전에는
              학습 앱에 반영되지 않아요.
            </small>
          </div>
        </>
      )}
      <div className="vs-rights-note">
        <strong>원문 연결 안내</strong>
        <p>
          검색으로는 영상 정보만 가져와요. 영상·자막은 자동 수집하지 않으며,
          사용권이 있는 원문을 연결해야 초안을 만들 수 있어요.
        </p>
      </div>
    </aside>
  );
}

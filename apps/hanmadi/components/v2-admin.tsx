"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  studyLanguages,
  curriculum,
  type StudyLanguage,
  type Phrase,
} from "@/lib/v2";
import type { ContentDraft } from "@/lib/v2-store";
async function api(body?: unknown) {
  const res = await fetch("/api/study/admin", {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || "처리하지 못했어요.");
  return d;
}
export function V2Admin() {
  const [drafts, setDrafts] = useState<ContentDraft[]>([]),
    [language, setLanguage] = useState<StudyLanguage>("ja"),
    [scene, setScene] = useState("smalltalk"),
    [level, setLevel] = useState(1),
    [title, setTitle] = useState(""),
    [sourceUrl, setSourceUrl] = useState(""),
    [rights, setRights] = useState(""),
    [transcript, setTranscript] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [units, setUnits] = useState<Phrase[]>([]),
    [current, setCurrent] = useState<ContentDraft | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState(""),
    [videos, setVideos] = useState<
      { url: string; title: string; channel: string }[]
    >([]),
    [searchConfigured, setSearchConfigured] = useState(false);
  useEffect(() => {
    let active = true;
    void api()
      .then((d) => {
        if (active) {
          setDrafts(d.drafts);
          setSearchConfigured(d.searchConfigured);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  function edit(d: ContentDraft) {
    setCurrent(d);
    setLanguage(d.language);
    setScene(d.scene);
    setLevel(d.level);
    setTitle(d.title);
    setSourceUrl(d.sourceUrl);
    setRights(d.rights);
    setUnits(d.units);
    setReviewed(false);
    setTranscript("");
    setNotice("");
  }
  async function work(
    action: "search" | "generate" | "save",
    status = "draft",
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api({
        action,
        language,
        scene,
        level,
        title,
        sourceUrl,
        rights,
        rightsConfirmed: confirmed,
        transcript,
        units,
        reviewed,
        status,
        query,
        ...(action === "save" && current
          ? { id: current.id, revision: current.revision }
          : {}),
      });
      if (action === "search") setVideos(data.videos);
      else {
        edit(data.draft);
        const refreshed = await api();
        setDrafts(refreshed.drafts);
        setNotice(
          data.draft.status === "published"
            ? "게시했어요. 해당 언어·레벨·상황의 학습에 나타나요."
            : "초안을 저장했어요. 검수 전에는 학습자에게 보이지 않아요.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="hm">
      <header className="hm-header">
        <Link className="hm-brand" href="/study">
          한마디<span>content studio</span>
        </Link>
        <Link href="/study">학습 화면으로 →</Link>
      </header>
      <main className="hm-main">
        <span className="hm-eyebrow">CURATED BY PEOPLE, ASSISTED BY AI</span>
        <h1>좋은 대화를, 좋은 수업으로.</h1>
        <p>
          언어와 상황에 맞는 원문으로 초안을 만들고, 검수한 표현만 게시하세요.
        </p>
        {error && (
          <p className="hm-alert" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="hm-notice" role="status">
            {notice}
          </p>
        )}
        <div className="hm-admin-layout">
          <aside className="hm-panel">
            <div className="hm-row hm-between">
              <h2>콘텐츠 목록</h2>
              <button
                disabled={busy}
                onClick={() => {
                  setCurrent(null);
                  setTitle("");
                  setUnits([]);
                  setTranscript("");
                  setSourceUrl("");
                  setRights("");
                  setReviewed(false);
                  setConfirmed(false);
                }}
              >
                새 초안
              </button>
            </div>
            {drafts.length === 0 && <p>첫 수업을 추가해 보세요.</p>}
            {drafts.map((d) => (
              <button
                disabled={busy}
                className="hm-draft"
                key={d.id}
                onClick={() => edit(d)}
              >
                <strong>{d.title}</strong>
                <small>
                  {studyLanguages[d.language].name} · L{d.level} ·{" "}
                  {d.status === "published" ? "게시됨" : "초안"}
                </small>
              </button>
            ))}
          </aside>
          <div className="hm-stack">
            <section className="hm-panel">
              <h2>01. 언어와 상황</h2>
              <div className="hm-grid">
                <label>
                  학습 언어
                  <select
                    value={language}
                    disabled={busy}
                    onChange={(e) => {
                      setLanguage(e.target.value as StudyLanguage);
                      setReviewed(false);
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
                  상황
                  <select
                    value={scene}
                    disabled={busy}
                    onChange={(e) => {
                      setScene(e.target.value);
                      setReviewed(false);
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
                  연습 레벨
                  <select
                    value={level}
                    disabled={busy}
                    onChange={(e) => {
                      setLevel(Number(e.target.value));
                      setReviewed(false);
                    }}
                  >
                    {curriculum.levels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.id} · {l.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <details>
                <summary>YouTube에서 참고 영상 찾기</summary>
                <p>
                  공식 검색 결과는 원본을 찾는 데만 사용해요. 영상이나 자막을
                  자동 다운로드하지 않아요.
                </p>
                <label>
                  검색어
                  <input
                    value={query}
                    maxLength={100}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="일본어 여행 스몰토크"
                  />
                </label>
                <button
                  disabled={busy || !searchConfigured}
                  onClick={() => void work("search")}
                >
                  영상 검색
                </button>
                {!searchConfigured && (
                  <p>
                    공식 검색 API 키 설정이 필요해요. 아래에 출처를 직접 입력할
                    수 있어요.
                  </p>
                )}
                {videos.map((v) => (
                  <div className="hm-search-result" key={v.url}>
                    <a href={v.url} target="_blank" rel="noopener noreferrer">
                      {v.title} ↗
                    </a>
                    <small>{v.channel}</small>
                    <button
                      onClick={() => {
                        setSourceUrl(v.url);
                        setReviewed(false);
                      }}
                    >
                      출처 주소 선택
                    </button>
                  </div>
                ))}
              </details>
            </section>
            <section className="hm-panel">
              <h2>02. 사용권이 있는 원문</h2>
              <label>
                수업 제목
                <input
                  value={title}
                  maxLength={100}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setReviewed(false);
                  }}
                  placeholder="카페에서 취향을 이야기하기"
                />
              </label>
              <label>
                참고 영상 주소 (선택)
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => {
                    setSourceUrl(e.target.value);
                    setReviewed(false);
                  }}
                  placeholder="https://www.youtube.com/watch?v=…"
                />
              </label>
              <label>
                원문 사용권 근거
                <textarea
                  value={rights}
                  maxLength={500}
                  onChange={(e) => {
                    setRights(e.target.value);
                    setConfirmed(false);
                    setReviewed(false);
                  }}
                  placeholder="직접 제작한 원문 또는 권리자로부터 AI 처리·수업 재사용을 허락받은 근거와 날짜"
                />
              </label>
              <label>
                직접 제공받은 텍스트·SRT·VTT 원문
                <textarea
                  className="hm-transcript"
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  maxLength={12000}
                  placeholder="영상 제작자에게 직접 받은 원문 또는 본인이 제작한 대본을 붙여 넣으세요."
                />
              </label>
              <label className="hm-check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                이 원문을 AI로 처리하고 학습 표현으로 재사용할 권한을
                확인했어요.
              </label>
              <button
                className="hm-primary"
                disabled={busy || !confirmed || transcript.trim().length < 20}
                onClick={() => void work("generate")}
              >
                {busy ? "처리 중…" : "AI로 학습 초안 만들기"}
              </button>
              <p className="hm-muted">
                원문은 초안 생성에만 전달하고 보관하지 않아요. 출처 주소만으로
                사용권이 확인되는 것은 아니에요.
              </p>
            </section>
            <section className="hm-panel">
              <h2>03. 표현 검수 · 게시</h2>
              {units.length === 0 ? (
                <p>초안을 만들면 여기에서 내용을 수정할 수 있어요.</p>
              ) : (
                <>
                  {units.map((p, i) => (
                    <fieldset className="hm-review-unit" key={i}>
                      <legend>표현 {i + 1}</legend>
                      {(
                        [
                          ["text", "학습 언어 표현"],
                          ["reading", "한글 발음 도움"],
                          ["meaning", "한국어 뜻"],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key}>
                          {label}
                          <textarea
                            maxLength={300}
                            value={p[key]}
                            onChange={(e) => {
                              setUnits(
                                units.map((u, n) =>
                                  n === i ? { ...u, [key]: e.target.value } : u,
                                ),
                              );
                              setReviewed(false);
                            }}
                          />
                        </label>
                      ))}
                      <button
                        disabled={units.length === 1}
                        onClick={() => {
                          setUnits(units.filter((_, n) => i !== n));
                          setReviewed(false);
                        }}
                      >
                        이 표현 제외
                      </button>
                    </fieldset>
                  ))}
                  <label className="hm-check">
                    <input
                      type="checkbox"
                      checked={reviewed}
                      onChange={(e) => setReviewed(e.target.checked)}
                    />
                    목표 언어·발음 도움·난이도·개인정보·사용권을 검수했어요.
                  </label>
                  <div className="hm-row">
                    <button
                      disabled={busy}
                      onClick={() => void work("save", "draft")}
                    >
                      {current?.status === "published"
                        ? "게시 내리고 초안 저장"
                        : "초안 저장"}
                    </button>
                    <button
                      className="hm-primary"
                      disabled={busy || !reviewed}
                      onClick={() => void work("save", "published")}
                    >
                      검수 완료 · 학습에 게시
                    </button>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { YoutubeVideoSearch } from "./youtube-video-search";
import dynamic from "next/dynamic";
const LearningAdmin = dynamic(
  () => import("./learning-admin").then((m) => m.LearningAdmin),
  { loading: () => <p role="status">학습 관리를 불러오는 중이에요.</p> },
);
import {
  studyLanguages,
  curriculum,
  type StudyLanguage,
  type Phrase,
} from "@/lib/v2";
import type { ContentDraft } from "@/lib/v2-store";
import type {
  Contribution,
  KnowledgeEvent,
  KnowledgeMatch,
} from "@/lib/knowledge";
type PublicContribution = Omit<Contribution, "actor">;
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
export function V2Admin({ appHref = "/study" }: { appHref?: string }) {
  const [tab, setTab] = useState<
    "videos" | "editor" | "inbox" | "preview" | "learning"
  >("videos");
  const [contributions, setContributions] = useState<PublicContribution[]>([]);
  const [events, setEvents] = useState<KnowledgeEvent[]>([]);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const operation = useRef(false);
  const [videoBusy, setVideoBusy] = useState(false);
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
    [searchConfigured, setSearchConfigured] = useState(false);
  useEffect(() => {
    let active = true;
    void api()
      .then((d) => {
        if (active) {
          setDrafts(d.drafts);
          setSearchConfigured(d.searchConfigured);
          setContributions(d.contributions);
          setEvents(d.events);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  function edit(d: ContentDraft) {
    setCandidateId(null);
    setConfirmed(false);
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
  async function work(action: "generate" | "save", status = "draft") {
    if (operation.current || loading) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api({
        action:
          action === "generate" && candidateId
            ? "generate-contribution"
            : action,
        ...(candidateId ? { contributionId: candidateId } : {}),
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
        ...(action === "save" && current
          ? { id: current.id, revision: current.revision }
          : {}),
      });
      edit(data.draft);
      const refreshed = await api();
      setDrafts(refreshed.drafts);
      setContributions(refreshed.contributions);
      setEvents(refreshed.events);
      setNotice(
        data.draft.status === "published"
          ? "게시했어요. 해당 언어·레벨·상황의 학습과 AI 대화에 반영돼요."
          : "초안을 저장했어요. 검수 전에는 학습자에게 보이지 않아요.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했어요.");
    } finally {
      setBusy(false);
      operation.current = false;
    }
  }
  function reviewVideo(draft: ContentDraft) {
    if (
      (title ||
        sourceUrl ||
        rights ||
        transcript ||
        units.length ||
        current ||
        candidateId) &&
      !window.confirm(
        "생성한 자료를 검수할까요? 편집 화면의 미저장 내용은 사라져요. 저장한 초안은 유지됩니다.",
      )
    )
      return;
    setError("");
    edit(draft);
    setTab("editor");
  }
  async function openLibrary() {
    try {
      const refreshed = await api();
      setDrafts(refreshed.drafts);
      setFilter("");
      setTab("editor");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "콘텐츠 목록을 불러오지 못했어요.",
      );
    }
  }
  async function reject(id: string) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api({ action: "reject", contributionId: id });
      const refreshed = await api();
      setContributions(refreshed.contributions);
      setEvents(refreshed.events);
      setNotice("후보를 반려했어요. 앱 학습에 사용하지 않아요.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "반려하지 못했어요.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="hm ks">
      <header className="hm-header">
        <Link className="hm-brand" href="/study/admin">
          한마디<span>콘텐츠 스튜디오</span>
        </Link>
        <Link href={appHref}>학습 앱 열기</Link>
      </header>
      <main className="hm-main">
        <h1>좋은 대화를, 좋은 수업으로.</h1>
        <p>검수한 표현이 레벨별 수업과 AI 대화에 이어집니다.</p>
        <nav className="ks-nav" aria-label="관리자 메뉴">
          {(
            [
              ["videos", "영상 찾기"],
              ["editor", "자료 만들기"],
              [
                "inbox",
                `번역 후보 (${contributions.filter((c) => c.status === "pending").length})`,
              ],
              ["preview", "앱 반영 확인"],
              ["learning", "학습 관리"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              disabled={busy || videoBusy}
              aria-pressed={tab === id}
              onClick={() => {
                setTab(id);
                setError("");
                setNotice("");
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        {loading && <p role="status">자료를 불러오는 중이에요.</p>}
        {tab === "learning" && <LearningAdmin />}
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
        <div hidden={tab !== "videos"}>
          <YoutubeVideoSearch
            configured={searchConfigured}
            disabled={busy || loading}
            onCreated={(draft) =>
              setDrafts((previous) => [
                ...previous.filter((d) => d.id !== draft.id),
                draft,
              ])
            }
            onReview={reviewVideo}
            onOpenLibrary={() => void openLibrary()}
            onBusyChange={setVideoBusy}
          />
        </div>
        {tab === "inbox" && (
          <section className="hm-panel">
            <h2>사용자가 제공한 번역 후보</h2>
            <p className="hm-muted">
              별도 동의한 짧은 표현입니다. 개인정보와 뜻을 검수한 후 교재로
              가져오세요. 제공 철회 시 연결된 교재도 함께 회수됩니다.
            </p>
            {!contributions.length && (
              <p>
                아직 제공된 후보가 없어요. 사용자가 번역 화면에서 공용 제공에
                동의하면 여기에 도착해요.
              </p>
            )}
            <div className="ks-candidates">
              {contributions
                .slice()
                .reverse()
                .map((c) => (
                  <article key={c.id}>
                    <div>
                      <span className="ks-tag">
                        {studyLanguages[c.language].name}
                      </span>
                      <strong>{c.phrase.text}</strong>
                      <p>{c.phrase.meaning}</p>
                      <small>{c.phrase.reading}</small>
                      <small>
                        제공 동의:{" "}
                        {new Date(c.createdAt).toLocaleDateString("ko-KR")} /{" "}
                        {c.status === "pending"
                          ? "검수 대기"
                          : c.status === "converted"
                            ? "교재로 가져옴"
                            : "반려됨"}
                      </small>
                    </div>
                    {c.status === "pending" && (
                      <div className="ks-candidate-actions">
                        <button
                          disabled={busy}
                          onClick={() => {
                            setCandidateId(c.id);
                            setCurrent(null);
                            setLanguage(c.language);
                            setTitle(c.phrase.meaning.slice(0, 100));
                            setSourceUrl("");
                            setTranscript("");
                            setUnits([]);
                            setReviewed(false);
                            setConfirmed(false);
                            setRights(
                              "사용자가 공용 학습 예시 제공에 별도 동의함. 개인정보·재사용 가능 여부는 게시 전 검수.",
                            );
                            setTab("editor");
                          }}
                        >
                          교재 초안으로 가져오기
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => void reject(c.id)}
                        >
                          반려
                        </button>
                      </div>
                    )}
                  </article>
                ))}
            </div>
          </section>
        )}
        {tab === "preview" && <KnowledgePreview />}
        <fieldset
          className="ks-form"
          disabled={busy || loading}
          hidden={tab !== "editor"}
        >
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
                    setCandidateId(null);
                  }}
                >
                  새 초안
                </button>
              </div>
              <label className="ks-filter">
                교재 찾기
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="제목 또는 언어"
                />
              </label>
              {drafts.length === 0 && <p>첫 수업을 추가해 보세요.</p>}
              {drafts
                .filter((d) =>
                  `${d.title} ${studyLanguages[d.language].name}`.includes(
                    filter,
                  ),
                )
                .map((d) => (
                  <button
                    disabled={busy}
                    className="hm-draft"
                    aria-pressed={current?.id === d.id}
                    key={d.id}
                    onClick={() => edit(d)}
                  >
                    <strong>{d.title}</strong>
                    <small>
                      {studyLanguages[d.language].name} · L{d.level} ·{" "}
                      {d.status === "published" ? "게시됨" : d.videoReview?.requiresHumanReview ? "검토 대기" : "초안"}
                    </small>
                  </button>
                ))}
            </aside>
            <div className="hm-stack">
              <section className="hm-panel">
                <h2>언어와 상황</h2>
                <div className="hm-grid">
                  <label>
                    학습 언어
                    <select
                      value={language}
                      disabled={
                        busy || !!candidateId || !!current?.contributionId
                      }
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
              </section>
              <details className="hm-panel ks-source" open={units.length === 0}>
                <summary>
                  <h2>
                    {candidateId
                      ? "번역 후보로 교재 만들기"
                      : "사용권이 있는 원문"}
                  </h2>
                </summary>
                {candidateId && (
                  <p className="ks-note">
                    사용자가 제공한 표현으로 초안을 만듭니다. 원래 사용자의 계정
                    정보와 전체 번역문은 제공하지 않아요.
                  </p>
                )}
                <label>
                  수업 제목
                  <input
                    id="ks-source-title"
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
                {!candidateId && (
                  <label>
                    직접 제공받은 텍스트·SRT·VTT 원문
                    <textarea
                      className="hm-transcript"
                      value={transcript}
                      onChange={(e) => {
                        setTranscript(e.target.value);
                        setConfirmed(false);
                      }}
                      maxLength={12000}
                      placeholder="영상 제작자에게 직접 받은 원문 또는 본인이 제작한 대본을 붙여 넣으세요."
                    />
                  </label>
                )}
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
                  disabled={
                    busy ||
                    !confirmed ||
                    (!candidateId && transcript.trim().length < 20)
                  }
                  onClick={() => void work("generate")}
                >
                  {busy ? "처리 중…" : "AI로 학습 초안 만들기"}
                </button>
                <p className="hm-muted">
                  원문은 초안 생성에만 전달하고 보관하지 않아요. 출처 주소만으로
                  사용권이 확인되는 것은 아니에요.
                </p>
              </details>
              <section className="hm-panel">
                <h2>표현 검수 · 게시</h2>
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
                                    n === i
                                      ? { ...u, [key]: e.target.value }
                                      : u,
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
                    {current?.status === "draft" && current.videoReview?.requiresHumanReview && (
                      <p className="hm-muted" role="status">
                        JEV 확신이 낮아 검토 대기 중이에요. 영상 구간·뜻·발음·새로운 학습 가치를 직접 확인하고,
                        적합하지 않은 표현은 제외해 주세요. 검수·게시 전에는 학습에 사용하지 않아요.
                      </p>
                    )}
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
            <aside className="hm-panel ks-rail">
              <h2>앱 적용 범위</h2>
              <dl>
                <dt>학습 언어</dt>
                <dd>{studyLanguages[language].name}</dd>
                <dt>연습 레벨</dt>
                <dd>레벨 {level}</dd>
                <dt>상황</dt>
                <dd>{curriculum.scenes.find((s) => s.id === scene)?.title}</dd>
                <dt>저장된 상태</dt>
                <dd>
                  {current?.status === "published"
                    ? `게시됨 / 버전 ${current.revision}`
                    : current
                      ? `${current.videoReview?.requiresHumanReview ? "검토 대기" : "초안"} / 버전 ${current.revision}`
                      : "아직 저장하지 않음"}
                </dd>
              </dl>
              <p className="ks-note">
                게시된 표현은 해당 수업과 AI 대화의 참고 자료로 사용됩니다. 모델
                자체의 파인튜닝은 실행하지 않아요.
              </p>
              {units[0] && (
                <div className="ks-preview">
                  <small>편집 중인 학습 카드</small>
                  <strong>{units[0].text}</strong>
                  <p>{units[0].meaning}</p>
                  <small>{units[0].reading}</small>
                </div>
              )}
              <h2>반영 이력</h2>
              {!current && (
                <p className="hm-muted">자료를 선택하면 이력을 볼 수 있어요.</p>
              )}
              <ul className="ks-events">
                {events
                  .filter((e) => e.target === current?.id)
                  .slice(-5)
                  .reverse()
                  .map((e) => (
                    <li key={e.id}>
                      <strong>
                        {e.action === "published"
                          ? "게시"
                          : e.action === "unpublished"
                            ? "게시 내림"
                            : "초안 저장"}{" "}
                        / 버전 {e.revision}
                      </strong>
                      <small>{new Date(e.at).toLocaleString("ko-KR")}</small>
                    </li>
                  ))}
              </ul>
            </aside>
          </div>
        </fieldset>
      </main>
    </div>
  );
}

function KnowledgePreview() {
  const [language, setLanguage] = useState<StudyLanguage>("ja");
  const [level, setLevel] = useState(1),
    [scene, setScene] = useState("smalltalk");
  const [mode, setMode] = useState("chat"),
    [query, setQuery] = useState("");
  const [matches, setMatches] = useState<KnowledgeMatch[] | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function preview() {
    setBusy(true);
    setError("");
    setMatches(null);
    try {
      setMatches(
        (await api({ action: "preview", language, level, scene, mode, query }))
          .matches,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "확인하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="hm-panel">
      <h2>AI가 참고할 게시 자료 확인</h2>
      <p className="hm-muted">
        앱과 같은 검색 조건으로 확인합니다. 의미 검색 사용 시 임베딩 호출 비용이
        발생할 수 있어요.
      </p>
      <fieldset
        className="ks-form"
        disabled={busy}
        onChange={() => setMatches(null)}
      >
        <div className="hm-grid">
          <label>
            학습 언어
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as StudyLanguage)}
            >
              {Object.entries(studyLanguages).map(([id, l]) => (
                <option key={id} value={id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            연습 레벨
            <select
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
            >
              {curriculum.levels.map((l) => (
                <option key={l.id} value={l.id}>
                  레벨 {l.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            상황
            <select value={scene} onChange={(e) => setScene(e.target.value)}>
              {curriculum.scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            적용 기능
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="chat">AI 대화</option>
              <option value="translation">번역</option>
            </select>
          </label>
        </div>
        <label>
          대화·번역 예시
          <input
            value={query}
            maxLength={2000}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="예: 커피를 주문하고 싶어요"
          />
        </label>
        <button className="hm-primary" onClick={() => void preview()}>
          적용 자료 확인
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="hm-alert">
          {error}
        </p>
      )}
      {matches && (
        <p role="status">
          {matches.length
            ? `${matches.length}개 표현을 참고합니다.`
            : "조건에 맞는 게시 자료가 없어요. 기본 AI 설정으로 답변합니다."}
        </p>
      )}
      {matches?.map((m, i) => (
        <article key={`${m.id}:${i}`} className="ks-preview">
          <small>
            {m.title} / 버전 {m.revision} / 레벨 {m.level}
          </small>
          <strong>{m.phrase.text}</strong>
          <p>{m.phrase.meaning}</p>
          <small>{m.phrase.reading}</small>
        </article>
      ))}
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { curriculum, studyLanguages, type StudyLanguage } from "@/lib/v2";
import type { YoutubeSearchPage, YoutubeVideo } from "@/lib/youtube-search";

export type SelectedVideo = YoutubeVideo & {
  language: StudyLanguage;
  scene: string;
};
type Search = { query: string; language: StudyLanguage; scene: string };
type LoadedPage = YoutubeSearchPage & { search: Search };

export function YoutubeVideoSearch({
  configured,
  disabled,
  onPrepare,
}: {
  configured: boolean;
  disabled: boolean;
  onPrepare: (video: SelectedVideo) => void;
}) {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<StudyLanguage>("ja");
  const [scene, setScene] = useState("smalltalk");
  const [pages, setPages] = useState<LoadedPage[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [selected, setSelected] = useState<SelectedVideo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const selectAll = useRef<HTMLInputElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const [retry, setRetry] = useState<{
    search: Search;
    index: number;
    token?: string;
  } | null>(null);
  const page = pages[pageIndex];
  const selectedIds = new Set(selected.map((v) => v.id));
  const selectedHere =
    page?.videos.filter((v) => selectedIds.has(v.id)).length ?? 0;
  const allHere = !!page?.videos.length && selectedHere === page.videos.length;

  useEffect(() => {
    if (selectAll.current)
      selectAll.current.indeterminate = selectedHere > 0 && !allHere;
  }, [selectedHere, allHere, page]);
  useEffect(() => () => request.current?.abort(), []);

  async function load(search: Search, index: number, token?: string) {
    // A ref closes the same-tick double submit window, including keyboard Enter.
    if (request.current || disabled || !configured) return;
    if (!search.query) {
      setError("검색어를 입력해 주세요.");
      setRetry(null);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setRetry({ search, index, token });
    try {
      const response = await fetch("/api/study/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search",
          ...search,
          ...(token ? { pageToken: token } : {}),
        }),
        cache: "no-store",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(20000),
        ]),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "검색하지 못했어요. 다시 시도해 주세요.");
      if (controller.signal.aborted) return;
      const loaded: LoadedPage = { ...data, search };
      setPages((previous) =>
        index === 0 ? [loaded] : [...previous.slice(0, index), loaded],
      );
      setPageIndex(index);
      setRetry(null);
      requestAnimationFrame(() =>
        resultsHeading.current?.focus({ preventScroll: true }),
      );
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error &&
            !["TimeoutError", "TypeError", "SyntaxError"].includes(e.name)
            ? e.message
            : "검색 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
        );
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  function togglePage() {
    if (!page) return;
    setSelected((previous) =>
      allHere
        ? previous.filter((v) => !page.videos.some((item) => item.id === v.id))
        : [
            ...previous,
            ...page.videos
              .filter((v) => !selectedIds.has(v.id))
              .map((v) => ({
                ...v,
                language: page.search.language,
                scene: page.search.scene,
              })),
          ],
    );
  }
  function move(index: number) {
    setError("");
    if (pages[index]) {
      setPageIndex(index);
      setRetry(null);
      resultsHeading.current?.focus({ preventScroll: true });
    } else if (page?.nextPageToken)
      void load(page.search, index, page.nextPageToken);
  }
  return (
    <div className="vs-workspace">
      <section className="vs-library" aria-label="YouTube 영상 검색">
        <div className="vs-intro">
          <div>
            <h2>수업의 시작이 될 영상을 찾아보세요</h2>
            <p>
              관심 있는 영상을 골라두고, 사용 가능한 원문으로 수업을 준비하세요.
            </p>
          </div>
          <span className="vs-service">YouTube 검색</span>
        </div>
        <form
          className="vs-search"
          onSubmit={(e) => {
            e.preventDefault();
            void load({ query: query.trim(), language, scene }, 0);
          }}
        >
          <label className="vs-query">
            검색어
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={100}
              placeholder="예: 일본어 카페 주문 회화"
              required
              disabled={busy || disabled}
            />
          </label>
          <button
            type="submit"
            className="vs-primary"
            disabled={busy || disabled || !configured || !query.trim()}
          >
            {busy ? "검색 중…" : "영상 검색"}
          </button>
          <div className="vs-filters">
            <label>
              영상 언어
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as StudyLanguage)}
                disabled={busy || disabled}
              >
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
                value={scene}
                onChange={(e) => setScene(e.target.value)}
                disabled={busy || disabled}
              >
                {curriculum.scenes.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <span>한 페이지에 최대 5개씩 표시해요.</span>
          </div>
        </form>
        {!configured && !disabled && (
          <p className="vs-message">
            영상 검색을 준비 중이에요. ‘자료 만들기’에서 출처 주소와 원문을 직접
            입력할 수 있어요.
          </p>
        )}
        {error && (
          <div className="vs-error" role="alert">
            <p>{error}</p>
            {retry && (
              <button
                type="button"
                disabled={busy || disabled}
                onClick={() => {
                  const r = retry;
                  if (r) void load(r.search, r.index, r.token);
                }}
              >
                다시 시도
              </button>
            )}
          </div>
        )}
        <div className="vs-results" aria-busy={busy}>
          <div className="vs-results-heading">
            <h3 ref={resultsHeading} tabIndex={-1}>
              {page
                ? `“${page.search.query}” 검색 결과`
                : "어떤 대화를 가르치고 싶으세요?"}
            </h3>
            {page && <span>{studyLanguages[page.search.language].name}</span>}
          </div>
          <p className="vs-live" role="status">
            {busy
              ? "영상을 찾고 있어요."
              : page
                ? `${pageIndex + 1}페이지 · 영상 ${page.videos.length}개 · 전체 선택 ${selected.length}개`
                : "검색어를 입력하면 참고 영상을 찾을 수 있어요."}
          </p>
          {page && page.videos.length > 0 && (
            <div className="vs-selection-bar">
              <label>
                <input
                  ref={selectAll}
                  type="checkbox"
                  checked={allHere}
                  disabled={busy || disabled}
                  onChange={togglePage}
                />
                이 페이지 모두 선택
              </label>
              <span>
                {selectedHere}/{page.videos.length}개 선택
              </span>
              {selected.length > 0 && (
                <a className="vs-tray-jump" href="#video-preparation">
                  준비 목록 {selected.length}개 보기
                </a>
              )}
            </div>
          )}
          {!page && (
            <div className="vs-empty">
              <span className="vs-play" aria-hidden="true">
                ▶
              </span>
              <p>
                여행 중 주문하기, 처음 만난 사람과 인사하기.
                <br />
                학습자가 연습할 장면을 검색해 보세요.
              </p>
            </div>
          )}
          {page?.videos.length === 0 && (
            <div className="vs-empty">
              <p>
                이 페이지에 표시할 영상이 없어요.
                <br />
                {page.nextPageToken
                  ? "다음 페이지를 확인하거나 검색어를 바꿔보세요."
                  : "검색어를 더 짧게 바꾸거나 다른 표현으로 검색해 보세요."}
              </p>
            </div>
          )}
          <ul className="vs-video-list">
            {page?.videos.map((video) => {
              const checked = selectedIds.has(video.id);
              return (
                <li
                  className={checked ? "vs-video is-selected" : "vs-video"}
                  key={video.id}
                >
                  <label className="vs-video-check">
                    <input
                      type="checkbox"
                      aria-label={`${video.title} 선택`}
                      checked={checked}
                      disabled={busy || disabled}
                      onChange={() =>
                        setSelected((previous) =>
                          checked
                            ? previous.filter((v) => v.id !== video.id)
                            : [
                                ...previous,
                                {
                                  ...video,
                                  language: page.search.language,
                                  scene: page.search.scene,
                                },
                              ],
                        )
                      }
                    />
                  </label>
                  <a
                    className="vs-thumbnail"
                    href={video.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    <VideoThumbnail video={video} />
                  </a>
                  <div className="vs-video-info">
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {video.title}
                      <span className="vs-link-hint">YouTube에서 보기 ↗</span>
                    </a>
                    <p>{video.channel || "채널 정보 없음"}</p>
                    {checked && (
                      <span className="vs-selected-label">
                        자료 준비 목록에 담았어요
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {page && (
            <nav className="vs-pagination" aria-label="영상 검색 페이지">
              <button
                type="button"
                disabled={busy || disabled || pageIndex === 0}
                onClick={() => move(pageIndex - 1)}
              >
                이전
              </button>
              <span aria-current="page">{pageIndex + 1}페이지</span>
              <button
                type="button"
                disabled={busy || disabled || !page.nextPageToken}
                onClick={() => move(pageIndex + 1)}
              >
                다음
              </button>
            </nav>
          )}
        </div>
      </section>
      <aside
        className="vs-tray"
        id="video-preparation"
        tabIndex={-1}
        aria-label="자료 준비 목록"
      >
        <div className="vs-tray-heading">
          <h2>
            자료 준비 목록 <span>{selected.length}</span>
          </h2>
          <button
            type="button"
            disabled={!selected.length || disabled}
            onClick={() => setSelected([])}
          >
            전체 해제
          </button>
        </div>
        <p className="vs-tray-help">
          페이지를 옮기거나 다시 검색해도 선택은 유지돼요. 이 화면을
          새로고침하면 비워져요.
        </p>
        {selected.length === 0 ? (
          <div className="vs-tray-empty">
            <span aria-hidden="true">＋</span>
            <p>함께 살펴볼 영상을 담아보세요.</p>
            <small>
              ‘이 페이지 모두 선택’으로
              <br />
              여러 영상을 한 번에 담을 수 있어요.
            </small>
          </div>
        ) : (
          <ol className="vs-queue">
            {selected.map((video) => (
              <li key={video.id}>
                <div>
                  <strong>{video.title}</strong>
                  <small>
                    {studyLanguages[video.language].name} · {video.channel}
                  </small>
                </div>
                <div className="vs-queue-actions">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onPrepare(video)}
                    aria-label={`${video.title} 자료 만들기`}
                  >
                    자료 만들기
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      setSelected((previous) =>
                        previous.filter((v) => v.id !== video.id),
                      )
                    }
                    aria-label={`${video.title} 선택 해제`}
                  >
                    해제
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
        <div className="vs-rights-note">
          <strong>선택한 다음에는</strong>
          <p>
            영상별로 사용권을 확인하고 원문을 입력해 주세요. 영상과 자막은
            자동으로 가져오지 않아요.
          </p>
        </div>
      </aside>
    </div>
  );
}

function VideoThumbnail({ video }: { video: YoutubeVideo }) {
  const [failed, setFailed] = useState(false);
  return video.thumbnail && !failed ? (
    <Image
      src={video.thumbnail}
      alt=""
      width={320}
      height={180}
      unoptimized
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="vs-thumbnail-fallback">
      YouTube<span>▶</span>
    </span>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { VIDEO_SELECTION_LIMIT } from "@/lib/video-policy";
import type { YoutubeSearchPage, YoutubeVideo } from "@/lib/youtube-search";
import type { ContentDraft } from "@/lib/knowledge";
import { VideoPreparationQueue } from "./video-preparation-queue";

type Search = { query: string };
type LoadedPage = YoutubeSearchPage & {
  search: Search;
  token?: string;
  cachedAt?: number;
  cacheHit?: boolean;
};

async function fetchPage(search: Search, signal: AbortSignal, token?: string) {
  const response = await fetch("/api/study/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "search",
      ...search,
      ...(token ? { pageToken: token } : {}),
    }),
    cache: "no-store",
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "검색하지 못했어요. 다시 시도해 주세요.");
  return { ...data, search, token } as LoadedPage;
}
function searchError(error: unknown) {
  return error instanceof Error &&
    !["TimeoutError", "TypeError", "SyntaxError"].includes(error.name)
    ? error.message
    : "검색 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export function YoutubeVideoSearch({
  configured,
  disabled,
  onCreated,
  onReview,
  onOpenLibrary,
  onBusyChange,
}: {
  configured: boolean;
  disabled: boolean;
  onCreated: (draft: ContentDraft) => void;
  onReview: (draft: ContentDraft) => void;
  onOpenLibrary: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState<LoadedPage[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [selected, setSelected] = useState<YoutubeVideo[]>([]);
  const [searchBusy, setBusy] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const busy = searchBusy || batchBusy;
  const [selectingAll, setSelectingAll] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");
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
  const searchVideos = [
    ...new Map(pages.flatMap((p) => p.videos).map((v) => [v.id, v])).values(),
  ];
  const searchSelected = searchVideos.filter((v) =>
    selectedIds.has(v.id),
  ).length;
  const allPagesSelected =
    !!pages.length &&
    !pages.at(-1)?.nextPageToken &&
    searchVideos.length > 0 &&
    searchSelected === searchVideos.length;

  useEffect(() => {
    if (selectAll.current)
      selectAll.current.indeterminate = selectedHere > 0 && !allHere;
  }, [selectedHere, allHere, page]);
  useEffect(() => () => request.current?.abort(), []);

  async function load(search: Search, index: number, token?: string) {
    // A ref closes the same-tick double submit window, including keyboard Enter.
    if (request.current || batchBusy || disabled || !configured) return;
    if (!search.query) {
      setError("검색어를 입력해 주세요.");
      setRetry(null);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    onBusyChange(true);
    setError("");
    setBulkStatus("");
    setRetry({ search, index, token });
    try {
      const loaded = await fetchPage(search, controller.signal, token);
      if (controller.signal.aborted) return;
      setPages((previous) =>
        index === 0 ? [loaded] : [...previous.slice(0, index), loaded],
      );
      setPageIndex(index);
      setRetry(null);
      requestAnimationFrame(() =>
        resultsHeading.current?.focus({ preventScroll: true }),
      );
    } catch (e) {
      if (!controller.signal.aborted) setError(searchError(e));
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
        onBusyChange(false);
      }
    }
  }
  async function selectEveryPage() {
    if (!page || request.current || batchBusy || disabled) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setSelectingAll(true);
    onBusyChange(true);
    setError("");
    setRetry(null);
    let loaded = [...pages];
    const visited = new Set(loaded.map((p) => p.token).filter(Boolean));
    const ids = new Set(selected.map((v) => v.id));
    function include(items: LoadedPage[]) {
      const additions: YoutubeVideo[] = [];
      for (const video of items.flatMap((p) => p.videos)) {
        if (ids.size >= VIDEO_SELECTION_LIMIT) break;
        if (!ids.has(video.id)) {
          ids.add(video.id);
          additions.push(video);
        }
      }
      setSelected((previous) =>
        [
          ...previous,
          ...additions.filter((v) => !previous.some((p) => p.id === v.id)),
        ].slice(0, VIDEO_SELECTION_LIMIT),
      );
      setBulkStatus(
        `${loaded.length}페이지 확인 · 준비 목록 ${ids.size}/${VIDEO_SELECTION_LIMIT}개`,
      );
    }
    include(loaded);
    try {
      let token = loaded.at(-1)?.nextPageToken;
      while (token && ids.size < VIDEO_SELECTION_LIMIT && loaded.length < 20) {
        if (visited.has(token))
          throw new Error(
            "다음 페이지가 반복되어 중단했어요. 검색어를 바꿔 다시 검색해 주세요.",
          );
        visited.add(token);
        const next = await fetchPage(page.search, controller.signal, token);
        if (controller.signal.aborted) return;
        loaded = [...loaded, next];
        setPages(loaded);
        include([next]);
        token = next.nextPageToken;
      }
      setBulkStatus(
        token
          ? `준비 목록 ${ids.size}/${VIDEO_SELECTION_LIMIT}개. 안전한 일괄 분석을 위해 추가 선택을 멈췄어요.`
          : `모든 페이지 확인 완료 · 준비 목록 ${ids.size}개를 담았어요.`,
      );
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(searchError(e));
        setBulkStatus(
          `${loaded.length}페이지까지 ${ids.size}개를 담았어요. 전체 선택은 끝나지 않았어요. 다시 누르면 남은 페이지부터 이어집니다.`,
        );
      }
    } finally {
      if (controller.signal.aborted)
        setBulkStatus(
          `전체 선택을 중지했어요. ${ids.size}개는 준비 목록에 남아 있어요. 다시 누르면 이어집니다.`,
        );
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
        setSelectingAll(false);
        onBusyChange(false);
      }
    }
  }
  function togglePage() {
    if (!page) return;
    setBulkStatus("");
    setSelected((previous) =>
      allHere
        ? previous.filter((v) => !page.videos.some((item) => item.id === v.id))
        : [
            ...previous,
            ...page.videos.filter((v) => !selectedIds.has(v.id)),
          ].slice(0, VIDEO_SELECTION_LIMIT),
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
              관심 있는 영상을 고르면 AI가 분석하고 학습 가치가 있는 자료를
              찾아요.
            </p>
          </div>
          <span className="vs-service">YouTube 검색</span>
        </div>
        <form
          className="vs-search"
          onSubmit={(e) => {
            e.preventDefault();
            void load({ query: query.trim() }, 0);
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
            {searchBusy ? "검색 중…" : "영상 검색"}
          </button>
          <p className="vs-search-help">
            한 페이지에 최대 5개씩 표시해요. 학습 언어와 상황은 영상을 담은 뒤
            자료 준비 목록에서 설정해요.
          </p>
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
        <div className="vs-results" aria-busy={searchBusy}>
          <div className="vs-results-heading">
            <h3 ref={resultsHeading} tabIndex={-1}>
              {page
                ? `“${page.search.query}” 검색 결과`
                : "어떤 대화를 가르치고 싶으세요?"}
            </h3>
          </div>
          <p className="vs-live" role="status">
            {searchBusy
              ? "영상을 찾고 있어요."
              : batchBusy
                ? "준비 목록의 자료를 처리하고 있어요."
                : page
                  ? `${pageIndex + 1}페이지 · 영상 ${page.videos.length}개 · 준비 목록 ${selected.length}개`
                  : "검색어를 입력하면 참고 영상을 찾을 수 있어요."}
          </p>
          {page && (
            <div className="vs-total">
              <strong>
                {page.totalResults == null
                  ? "검색 총개수 확인 불가"
                  : `검색 결과 약 ${page.totalResults.toLocaleString("ko-KR")}개`}
              </strong>
              <small>YouTube 제공 추정치 · 준비 목록 최대 10개</small>
            </div>
          )}
          {page?.cachedAt && (
            <p className="vs-cache-note">
              {page.cacheHit ? "저장된 검색 결과" : "새 검색 결과"} ·{" "}
              {new Date(page.cachedAt).toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              기준 · 1시간 재사용
            </p>
          )}
          {page && (searchVideos.length > 0 || page.nextPageToken) && (
            <div className="vs-all-pages">
              <div>
                <strong>페이지를 넘기지 않고 한 번에</strong>
                <p>
                  페이지를 넘겨 최대 10개까지 담아요. 한 번에 3개씩 분석해요.
                </p>
              </div>
              {selectingAll ? (
                <button type="button" onClick={() => request.current?.abort()}>
                  전체 선택 중지
                </button>
              ) : (
                <button
                  type="button"
                  className="vs-primary"
                  disabled={
                    busy ||
                    disabled ||
                    allPagesSelected ||
                    selected.length >= VIDEO_SELECTION_LIMIT
                  }
                  onClick={() => void selectEveryPage()}
                >
                  {allPagesSelected
                    ? "모든 페이지 선택 완료"
                    : selected.length >= VIDEO_SELECTION_LIMIT
                      ? "최대 10개 선택 완료"
                      : "모든 페이지에서 최대 10개 선택"}
                </button>
              )}
              {bulkStatus && (
                <p className="vs-bulk-status" role="status">
                  {bulkStatus}
                </p>
              )}
            </div>
          )}
          {page && page.videos.length > 0 && (
            <div className="vs-selection-bar">
              <label>
                <input
                  ref={selectAll}
                  type="checkbox"
                  checked={allHere}
                  disabled={
                    busy ||
                    disabled ||
                    (!allHere && selected.length >= VIDEO_SELECTION_LIMIT)
                  }
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
                      disabled={
                        busy ||
                        disabled ||
                        (!checked && selected.length >= VIDEO_SELECTION_LIMIT)
                      }
                      onChange={() => {
                        setBulkStatus("");
                        setSelected((previous) =>
                          checked
                            ? previous.filter((v) => v.id !== video.id)
                            : [...previous, video].slice(
                                0,
                                VIDEO_SELECTION_LIMIT,
                              ),
                        );
                      }}
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
      <VideoPreparationQueue
        videos={selected}
        disabled={disabled || searchBusy}
        onRemove={(id) => {
          setBulkStatus("");
          setSelected((previous) => previous.filter((v) => v.id !== id));
        }}
        onClear={() => {
          setSelected([]);
          setBulkStatus("");
        }}
        onCreated={onCreated}
        onReview={onReview}
        onOpenLibrary={onOpenLibrary}
        onBusyChange={(value) => {
          setBatchBusy(value);
          onBusyChange(value);
        }}
      />
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

import { ConversationError } from "./conversation";

export const YOUTUBE_PAGE_SIZE = 5;
export type YoutubeVideo = {
  id: string;
  url: string;
  title: string;
  channel: string;
  thumbnail: string | null;
};
export type YoutubeSearchPage = {
  videos: YoutubeVideo[];
  nextPageToken: string | null;
  /** YouTube's estimate, not a pagination boundary or an exact count. */
  totalResults: number | null;
};

// Tokens are opaque. Bound their size without interpreting or constructing them.
function isPageToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 1024 &&
    !/[\s\u0000-\u001f\u007f]/u.test(value)
  );
}
export function validateYoutubeSearch(query: unknown, pageToken: unknown) {
  if (typeof query !== "string" || !query.trim() || query.length > 100)
    throw new ConversationError(400, "검색어를 1~100자로 입력해 주세요.");
  if (pageToken !== undefined && !isPageToken(pageToken))
    throw new ConversationError(
      400,
      "페이지 정보가 올바르지 않아요. 다시 검색해 주세요.",
    );
  return { query: query.trim(), pageToken: pageToken as string | undefined };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
function titleText(value: unknown): string {
  if (typeof value !== "string") return "";
  const entities: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
  };
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi,
    (match, entity: string) => {
      if (!entity.startsWith("#"))
        return entities[entity.toLowerCase()] ?? match;
      const code =
        entity[1].toLowerCase() === "x"
          ? parseInt(entity.slice(2), 16)
          : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : match;
    },
  );
}

export async function searchYoutubeVideos(
  input: { query: string; language?: string; pageToken?: string },
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<YoutubeSearchPage> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.search = new URLSearchParams({
    key: apiKey,
    part: "snippet",
    type: "video",
    maxResults: String(YOUTUBE_PAGE_SIZE),
    ...(input.language ? { relevanceLanguage: input.language } : {}),
    q: input.query,
    ...(input.pageToken ? { pageToken: input.pageToken } : {}),
  }).toString();
  const res = await fetcher(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok)
    throw new ConversationError(
      502,
      "YouTube 검색을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.",
    );
  const data = record(await res.json());
  if (!Array.isArray(data.items))
    throw new ConversationError(
      502,
      "검색 결과를 읽지 못했어요. 다시 시도해 주세요.",
    );
  const seen = new Set<string>();
  const videos = data.items
    .flatMap((item): YoutubeVideo[] => {
      const v = record(item),
        id = record(v.id).videoId,
        snippet = record(v.snippet);
      if (
        typeof id !== "string" ||
        !/^[A-Za-z0-9_-]{11}$/.test(id) ||
        seen.has(id)
      )
        return [];
      seen.add(id);
      const thumbnails = record(snippet.thumbnails);
      const candidate = record(thumbnails.medium ?? thumbnails.default).url;
      // Display only the official thumbnail supplied by the API; never ingest it.
      const thumbnail =
        typeof candidate === "string" &&
        /^https:\/\/i\.ytimg\.com\//.test(candidate)
          ? candidate
          : null;
      return [
        {
          id,
          url: `https://www.youtube.com/watch?v=${id}`,
          title: titleText(snippet.title) || "제목 없는 영상",
          channel: titleText(snippet.channelTitle),
          thumbnail,
        },
      ];
    })
    .slice(0, YOUTUBE_PAGE_SIZE);
  const totalResults = record(data.pageInfo).totalResults;
  return {
    videos,
    totalResults:
      typeof totalResults === "number" &&
      Number.isSafeInteger(totalResults) &&
      totalResults >= 0
        ? totalResults
        : null,
    // A short/empty page can still have a next page. totalResults is approximate.
    nextPageToken: isPageToken(data.nextPageToken) ? data.nextPageToken : null,
  };
}

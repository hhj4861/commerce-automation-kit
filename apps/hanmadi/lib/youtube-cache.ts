import { createHash, randomUUID } from "node:crypto";
import { ConversationError } from "./conversation";
import { searchYoutubeVideos, type YoutubeSearchPage } from "./youtube-search";
import { transientStore, type TransientStore } from "./transient-store";
import { v2Driver } from "./store";
export const SEARCH_CACHE_SECONDS = 3600;
export async function cachedYoutubeSearch(
  input: Parameters<typeof searchYoutubeVideos>[0],
  key: string,
  deps = {
    store: transientStore(),
    fetcher: fetch,
    count: () =>
      v2Driver().count(`youtube:${new Date().toISOString().slice(0, 10)}`),
  },
): Promise<YoutubeSearchPage & { cachedAt: number; cacheHit: boolean }> {
  const normalized = {
    query: input.query.trim().replace(/\s+/g, " "),
    language: input.language || "",
    pageToken: input.pageToken || "",
  };
  return cachedSearch(normalized, key, deps);
}
async function cachedSearch(
  input: { query: string; language: string; pageToken: string },
  apiKey: string,
  {
    store,
    fetcher,
    count,
  }: {
    store: TransientStore;
    fetcher: typeof fetch;
    count: () => Promise<number>;
  },
) {
  const key =
    "search:" +
    createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const hit = await store.get(key);
  if (hit) return { ...JSON.parse(hit), cacheHit: true };
  const token = randomUUID();
  if (!(await store.claim(key + ":lock", token, 20))) {
    // Another instance is already calling YouTube. Never spend quota on a duplicate.
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const ready = await store.get(key);
      if (ready) return { ...JSON.parse(ready), cacheHit: true };
      if (!(await store.get(key + ":lock"))) break;
    }
    throw new ConversationError(
      409,
      "같은 검색을 처리 중이에요. 잠시 후 다시 눌러 주세요.",
    );
  }
  try {
    const ready = await store.get(key);
    if (ready) return { ...JSON.parse(ready), cacheHit: true };
    if ((await count()) > 20)
      throw new ConversationError(
        429,
        "오늘의 새 영상 검색 예산을 다 썼어요. 저장된 검색 결과는 계속 볼 수 있어요.",
      );
    const page = {
      ...(await searchYoutubeVideos(input, apiKey, fetcher)),
      cachedAt: Date.now(),
    };
    await store.set(key, JSON.stringify(page), SEARCH_CACHE_SECONDS);
    return { ...page, cacheHit: false };
  } finally {
    await store.release(key + ":lock", token);
  }
}

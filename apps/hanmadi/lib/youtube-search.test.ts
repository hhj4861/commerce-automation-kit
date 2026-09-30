import assert from "node:assert/strict";
import { test } from "node:test";
import { searchYoutubeVideos, validateYoutubeSearch } from "./youtube-search";

const item = (id = "abcdefghijk") => ({
  id: { videoId: id },
  snippet: {
    title: "Coffee &amp; talk &#39;lesson&#39;",
    channelTitle: "A &quot;channel&quot;",
    thumbnails: {
      medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` },
    },
  },
});
const fixture =
  (data: unknown, status = 200): typeof fetch =>
  async () =>
    new Response(JSON.stringify(data), { status });

test("requests exactly five videos from the official API, forwarding opaque pagination", async () => {
  const page = await searchYoutubeVideos(
    { query: "カフェ & 会話", language: "ja", pageToken: "opaque+/=_-" },
    "unit-test-key",
    async (input, init) => {
      const url = new URL(String(input));
      assert.equal(
        url.origin + url.pathname,
        "https://www.googleapis.com/youtube/v3/search",
      );
      assert.equal(url.searchParams.get("maxResults"), "5");
      assert.equal(url.searchParams.get("type"), "video");
      assert.equal(url.searchParams.get("part"), "snippet");
      assert.equal(url.searchParams.get("q"), "カフェ & 会話");
      assert.equal(url.searchParams.get("relevanceLanguage"), "ja");
      assert.equal(url.searchParams.get("pageToken"), "opaque+/=_-");
      assert.equal(init?.cache, "no-store");
      assert(init?.signal);
      return new Response(
        JSON.stringify({
          items: [item()],
          nextPageToken: "next+page=",
          pageInfo: { totalResults: 999999 },
        }),
      );
    },
  );
  assert.equal(page.videos.length, 1);
  assert.equal(page.totalResults, 999999);
  assert.equal(
    page.nextPageToken,
    "next+page=",
    "short pages can still have a next page",
  );
  assert.equal(page.videos[0].title, "Coffee & talk 'lesson'");
  assert.equal(page.videos[0].channel, 'A "channel"');
  assert.equal(
    page.videos[0].url,
    "https://www.youtube.com/watch?v=abcdefghijk",
  );
  assert.equal(
    page.videos[0].thumbnail,
    "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg",
  );
});

test("rejects invalid input before charging search budget or calling YouTube", () => {
  for (const q of [null, 1, "", "  ", "a".repeat(101)])
    assert.throws(() => validateYoutubeSearch(q, undefined), /검색어/);
  for (const token of [null, 1, {}, "", "a b", "abc\n", "a".repeat(1025)])
    assert.throws(() => validateYoutubeSearch("coffee", token), /페이지/);
  assert.deepEqual(validateYoutubeSearch(" coffee ", "opaque+/=_-"), {
    query: "coffee",
    pageToken: "opaque+/=_-",
  });
});

test("filters malformed IDs and duplicates, bounds results, rejects foreign thumbnail hosts", async () => {
  const badThumbnail = item();
  badThumbnail.snippet.thumbnails.medium.url =
    "https://i.ytimg.com.evil.example/preview.jpg";
  const result = await searchYoutubeVideos(
    { query: "coffee", language: "en" },
    "key",
    fixture({
      items: [
        null,
        {},
        item("bad/id"),
        badThumbnail,
        item(),
        ...Array.from({ length: 6 }, (_, i) => item(`video00000${i}`)),
      ],
      nextPageToken: 123,
    }),
  );
  assert.equal(result.videos.length, 5);
  assert.equal(result.videos[0].thumbnail, null);
  assert.equal(new Set(result.videos.map((v) => v.id)).size, 5);
  assert.equal(result.nextPageToken, null);
});

test("empty pages retain API next token and final pages have no next token", async () => {
  assert.deepEqual(
    await searchYoutubeVideos(
      { query: "coffee", language: "en" },
      "key",
      fixture({ items: [], nextPageToken: "NEXT" }),
    ),
    { videos: [], nextPageToken: "NEXT", totalResults: null },
  );
  assert.equal(
    (
      await searchYoutubeVideos(
        { query: "coffee", language: "en" },
        "key",
        fixture({ items: [] }),
      )
    ).nextPageToken,
    null,
  );
});

test("total count preserves zero and treats absent or invalid estimates as unknown", async () => {
  for (const value of [undefined, null, -1, 1.5, "20", 0, 12500]) {
    const page = await searchYoutubeVideos(
      { query: "coffee", language: "en" },
      "key",
      fixture({ items: [], pageInfo: { totalResults: value } }),
    );
    assert.equal(
      page.totalResults,
      value === 0 || value === 12500 ? value : null,
    );
  }
});

test("upstream failures and invalid envelopes are surfaced instead of silent empty results", async () => {
  await assert.rejects(
    searchYoutubeVideos(
      { query: "coffee", language: "en" },
      "secret",
      fixture({}, 403),
    ),
    /YouTube 검색/,
  );
  await assert.rejects(
    searchYoutubeVideos(
      { query: "coffee", language: "en" },
      "secret",
      fixture({}),
    ),
    /검색 결과/,
  );
});

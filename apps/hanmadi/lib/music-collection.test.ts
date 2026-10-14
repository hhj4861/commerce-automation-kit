import test from "node:test";
import assert from "node:assert/strict";
import { youtubeMusicId, youtubeMusicDetails, youtubeMusicCaptions, downloadMusicCaption, musicYoutubeConfiguration } from "./youtube-music";
import { collectMusicVideo, readMusicCollection, saveCollectedSource, importCollectedCaption, removeCollectedMusic } from "./music-collection";
import { cachedYoutubeSearch } from "./youtube-cache";
import { memoryTransientStore } from "./transient-store";
import { learningMusic } from "./owned-music-store";
const id = "abcdefghijk";
const source = "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nGood morning\n\n00:00:04.000 --> 00:00:06.000\nHello my friend";
const details = { id, title: "Fixture song", channel: "Author", url: `https://www.youtube.com/watch?v=${id}`, thumbnail: null, captionsAvailable: true, seconds: 180 };
const env = { YOUTUBE_CAPTIONS_CLIENT_ID: "client", YOUTUBE_CAPTIONS_CLIENT_SECRET: "SECRET", YOUTUBE_CAPTIONS_REFRESH_TOKEN: "REFRESH" };
const track = { id: "caption=1", language: "en", name: "English", automatic: false };
function fixture() {
  const data = new Map<string, string>(); let calls = 0;
  const db = { get: async (k: string) => data.get(k) ?? null, cas: async (k: string, old: string | null, v: string) => { if ((data.get(k) ?? null) !== old) return false; data.set(k, v); return true; }, count: async () => 1 };
  return { db, details: async () => { calls++; return details; }, calls: () => calls };
}
function provider(overrides: { status?: number; source?: string; tokenFailure?: boolean; mismatch?: boolean } = {}) {
  const calls: URL[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)); calls.push(url); assert.equal(init?.redirect, "error"); assert(init?.signal);
    assert(!url.href.includes("SECRET") && !url.href.includes("REFRESH"));
    if (url.pathname === "/token") {
      assert.equal(url.host, "oauth2.googleapis.com"); assert.equal(init?.method, "POST");
      const body = new URLSearchParams(String(init?.body)); assert.equal(body.get("refresh_token"), "REFRESH");
      return overrides.tokenFailure ? new Response("PRIVATE credential detail", { status: 400 }) : Response.json({ access_token: "ACCESS" });
    }
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer ACCESS");
    if (overrides.status) return new Response("PRIVATE upstream detail", { status: overrides.status });
    if (url.pathname === "/youtube/v3/captions") {
      assert.equal(url.searchParams.get("videoId"), id);
      return Response.json({ items: [{ id: track.id, snippet: { videoId: overrides.mismatch ? "otherid1234" : id, language: "en", name: "English", status: "serving", trackKind: "standard" } }] });
    }
    assert.equal(url.pathname, "/youtube/v3/captions/caption%3D1");
    assert.equal(url.searchParams.get("tfmt"), "vtt"); assert.equal(url.searchParams.get("tlang"), null);
    return new Response(overrides.source ?? source);
  }) as typeof fetch;
  return { fetcher, calls };
}
test("YouTube links normalize without fetching user supplied URLs", () => {
  for (const url of [id, `https://youtu.be/${id}?t=2`, `https://www.youtube.com/watch?v=${id}&list=playlist`, `https://m.youtube.com/shorts/${id}`, `https://music.youtube.com/watch?v=${id}`]) assert.equal(youtubeMusicId(url), id);
  for (const url of [`http://localhost/${id}`, `https://youtube.com.evil/watch?v=${id}`, `https://evil@youtube.com/watch?v=${id}`, `https://youtube.com:8443/watch?v=${id}`, "file:///secret", `https://youtu.be/${id}/extra`, [], "bad"]) assert.throws(() => youtubeMusicId(url));
});
test("music and caption filters use distinct cached official searches", async () => {
  const urls: URL[] = []; const deps = { store: memoryTransientStore(), count: async () => 1, fetcher: (async (input: RequestInfo | URL) => { urls.push(new URL(String(input))); return Response.json({ items: [] }); }) as typeof fetch };
  await cachedYoutubeSearch({ query: "song" }, "KEY", deps);
  await cachedYoutubeSearch({ query: "song", music: true }, "KEY", deps);
  await cachedYoutubeSearch({ query: "song", music: true, captionsOnly: true }, "KEY", deps);
  assert.equal((await cachedYoutubeSearch({ query: "song", music: true }, "KEY", deps)).cacheHit, true);
  assert.equal(urls.length, 3); assert.equal(urls[0].searchParams.get("videoEmbeddable"), null);
  assert.equal(urls[1].searchParams.get("videoEmbeddable"), "true"); assert.equal(urls[1].searchParams.get("videoCategoryId"), "10"); assert.equal(urls[2].searchParams.get("videoCaption"), "closedCaption");
});
test("video metadata is verified, embeddability and live state are enforced", async () => {
  const item = { id, snippet: { title: "Song &amp; Story", channelTitle: "Author", liveBroadcastContent: "none", thumbnails: { medium: { url: "https://evil.test/private" } } }, status: { privacyStatus: "public", embeddable: true }, contentDetails: { duration: "PT3M", caption: "true" } };
  const fetcher = (async (url: RequestInfo | URL) => { assert.equal(new URL(String(url)).host, "www.googleapis.com"); return Response.json({ items: [item] }); }) as typeof fetch;
  const result = await youtubeMusicDetails(id, "KEY", fetcher); assert.equal(result.seconds, 180); assert.equal(result.title, "Song & Story"); assert.equal(result.thumbnail, null);
  item.status.embeddable = false; await assert.rejects(youtubeMusicDetails(id, "KEY", fetcher), /퍼가기/);
  item.status.embeddable = true; item.snippet.liveBroadcastContent = "live"; await assert.rejects(youtubeMusicDetails(id, "KEY", fetcher), /방송/);
  await assert.rejects(youtubeMusicDetails(id, "", fetcher), /연결/);
});
test("caption connection requires all dedicated OAuth fields", async () => {
  assert.deepEqual(musicYoutubeConfiguration({ YOUTUBE_API_KEY: "key" }), { search: true, captions: false });
  assert.equal(musicYoutubeConfiguration(env).captions, true);
  const p = provider(); await assert.rejects(downloadMusicCaption(id, track.id, {}, p.fetcher), /채널 연결/); assert.equal(p.calls.length, 0);
});
test("caption list and original VTT download use OAuth, video membership and bounded official endpoints", async () => {
  const p = provider(); assert.deepEqual(await youtubeMusicCaptions(id, env, p.fetcher), [track]);
  const result = await downloadMusicCaption(id, track.id, env, p.fetcher); assert.equal(result.source, source); assert.deepEqual(result.track, track);
  assert.equal(p.calls.length, 5);
});
test("permission, missing track and token errors are visible without leaking credentials", async () => {
  for (const options of [{ status: 403 }, { tokenFailure: true }, { mismatch: true }]) {
    const p = provider(options); await assert.rejects(downloadMusicCaption(id, track.id, env, p.fetcher), e => { assert(!String(e).includes("PRIVATE")); assert(!String(e).includes("SECRET")); return true; });
    assert(!p.calls.some(url => url.pathname.includes("caption%3D1")));
  }
  const p = provider(); await assert.rejects(downloadMusicCaption(id, "arbitrary-id", env, p.fetcher), /찾을 수/);
  assert.equal(p.calls.length, 2);
});
test("malformed, oversized or overlapping captions are rejected without truncation", async () => {
  for (const bad of ["only one line", "x".repeat(65000), source.replace("00:00:04.000", "00:00:02.000")]) {
    await assert.rejects(downloadMusicCaption(id, track.id, env, provider({ source: bad }).fetcher));
  }
});
test("concurrent collection is idempotent per video and learning language; it is never a learner publication", async () => {
  const f = fixture(); await Promise.all([collectMusicVideo(id, "en", f), collectMusicVideo(id, "en", f)]);
  assert.equal((await readMusicCollection(f.db)).length, 1);
  const calls = f.calls(); await collectMusicVideo(id, "en", f); assert.equal(f.calls(), calls);
  await collectMusicVideo(id, "ja", f); assert.equal((await readMusicCollection(f.db)).length, 2);
  assert.deepEqual(await learningMusic(f.db), []);
  await assert.rejects(collectMusicVideo(id, "invalid", f));
});
test("source edits enforce revision and preserve earlier source after download or validation failures", async () => {
  const f = fixture(), item = await collectMusicVideo(id, "en", f);
  await saveCollectedSource(item.id, 1, source, f.db);
  await assert.rejects(saveCollectedSource(item.id, 1, "two\nlines", f.db), /바뀌었/);
  await assert.rejects(saveCollectedSource(item.id, 2, "only one", f.db));
  await assert.rejects(importCollectedCaption(item.id, 2, track.id, { db: f.db, download: async () => { throw new Error("upstream failed"); } }));
  assert.equal((await readMusicCollection(f.db))[0].source, source);
  const imported = await importCollectedCaption(item.id, 2, track.id, { db: f.db, download: async () => ({ source, track }) });
  assert.equal(imported.sourceOrigin, "youtube"); assert.equal(imported.revision, 3);
  const edited = await saveCollectedSource(item.id, 3, "first\nsecond", f.db); assert.equal(edited.caption, undefined); assert.equal(edited.sourceOrigin, "file");
});
test("an edit during download is never overwritten", async () => {
  const f = fixture(), item = await collectMusicVideo(id, "en", f);
  await assert.rejects(importCollectedCaption(item.id, 1, track.id, { db: f.db, download: async () => { await saveCollectedSource(item.id, 1, "new\nversion", f.db); return { source, track }; } }), /바뀌었/);
  assert.equal((await readMusicCollection(f.db))[0].source, "new\nversion");
});
test("budgets stop external calls but allow local source storage and removal", async () => {
  const f = fixture(), item = await collectMusicVideo(id, "en", f); let calls = 0;
  const db = { ...f.db, count: async () => 101 };
  await assert.rejects(collectMusicVideo("xyzabcdefgh", "en", { db, details: async () => { calls++; return details; } }), /한도/);
  await assert.rejects(importCollectedCaption(item.id, 1, track.id, { db, download: async () => { calls++; return { source, track }; } }), /한도/);
  assert.equal(calls, 0); await saveCollectedSource(item.id, 1, source, db);
  await assert.rejects(removeCollectedMusic(item.id, 1, db), /바뀌었/);
  await removeCollectedMusic(item.id, 2, db); assert.deepEqual(await readMusicCollection(db), []);
});

test("YouTube quota exhaustion is distinguished from edit permission denial", async () => {
  const p = provider();
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("/token")) return p.fetcher(input, init);
    return Response.json({ error: { errors: [{ reason: "quotaExceeded" }] } }, { status: 403 });
  }) as typeof fetch;
  await assert.rejects(youtubeMusicCaptions(id, env, fetcher), e => { assert.equal((e as { status: number }).status, 429); assert.match(String(e), /요청 한도/); return true; });
});

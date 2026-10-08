import test from "node:test";
import assert from "node:assert/strict";
import { parseLicensedMusicLesson, musicProgressIndex } from "./music-lyrics";
import { loadMusicLyrics } from "./music-lyrics-provider";
const now = Date.parse("2026-10-08T00:00:00Z");
const fixture = () => ({
  trackId: "pretender", revision: "test-v1", expiresAt: "2030-01-01T00:00:00Z",
  attribution: { label: "Original test material, not song lyrics", url: "https://example.com/fixture" },
  rights: { reference: "test-fixture-only", display: true, translation: true, pronunciation: true, speech: true },
  lines: [{ id: "one", text: "青いノートです。", reading: "아오이 노오토데스.", meaning: "파란 공책이에요.", startSeconds: 0, endSeconds: 6 },
    { id: "two", text: "青いノートです。", reading: "아오이 노오토데스.", meaning: "파란 공책이에요.", startSeconds: 10, endSeconds: 16 }],
});
const env = { NODE_ENV: "production", HANMADI_MUSIC_CATALOG_URL: "https://publisher.example/lesson.json", HANMADI_MUSIC_CATALOG_TOKEN: "private-fixture-token", HANMADI_MUSIC_LICENSE_APPROVED: "true" } as NodeJS.ProcessEnv;
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

test("licensed lessons retain repeated lines and reset out-of-date progress", () => {
  const lesson = parseLicensedMusicLesson(fixture(), now);
  assert.equal(lesson.lines.length, 2);
  assert.equal(lesson.lines[0].text, lesson.lines[1].text);
  assert.equal(musicProgressIndex({ revision: "test-v1", index: 1 }, lesson), 1);
  for (const progress of [undefined, { revision: "old", index: 1 }, { revision: "test-v1", index: 2 }, { revision: "test-v1", index: -1 }])
    assert.equal(musicProgressIndex(progress, lesson), 0);
});
test("rejects missing rights, expired licenses, malformed language, unsafe links and timings", () => {
  for (const mutate of [
    (x: ReturnType<typeof fixture>) => { x.rights.speech = false; },
    (x: ReturnType<typeof fixture>) => { x.rights.translation = false; },
    (x: ReturnType<typeof fixture>) => { x.rights.reference = ""; },
    (x: ReturnType<typeof fixture>) => { x.expiresAt = "2025-01-01"; },
    (x: ReturnType<typeof fixture>) => { x.attribution.url = "javascript:alert(1)"; },
    (x: ReturnType<typeof fixture>) => { x.lines[0].text = "한국어 원문 오류"; },
    (x: ReturnType<typeof fixture>) => { x.lines[0].reading = "ao i"; },
    (x: ReturnType<typeof fixture>) => { x.lines[0].meaning = ""; },
    (x: ReturnType<typeof fixture>) => { x.lines[1].id = "one"; },
    (x: ReturnType<typeof fixture>) => { x.lines[1].endSeconds = 9; },
    (x: ReturnType<typeof fixture>) => { x.lines[1].startSeconds = -1; },
    (x: ReturnType<typeof fixture>) => { x.lines[0].text = "<script>こんにちは</script>"; },
  ]) { const invalid = fixture(); mutate(invalid); assert.throws(() => parseLicensedMusicLesson(invalid, now)); }
  assert.throws(() => parseLicensedMusicLesson({ ...fixture(), lines: [] }, now));
  assert.throws(() => parseLicensedMusicLesson({ ...fixture(), trackId: "other-song" }, now));
});
test("unconfigured and unapproved feeds never make network requests", async () => {
  const never: typeof fetch = async () => { assert.fail("must not fetch"); };
  assert.deepEqual(await loadMusicLyrics({ NODE_ENV: "test" }, never, now), { status: "unavailable", reason: "not-configured" });
  assert.deepEqual(await loadMusicLyrics({ ...env, HANMADI_MUSIC_LICENSE_APPROVED: undefined }, never, now), { status: "unavailable", reason: "rights-pending" });
  for (const url of ["http://127.0.0.1/lyrics", "https://key:secret@example.com/lyrics", "https://example.com/lyrics?key=secret", "file:///tmp/lyrics"])
    assert.equal((await loadMusicLyrics({ ...env, HANMADI_MUSIC_CATALOG_URL: url }, never, now)).status, "unavailable");
});
test("server-only bearer request rejects redirects and uses bounded uncached response", async () => {
  let calls = 0;
  const fake: typeof fetch = async (url, options) => {
    calls++; assert.equal(String(url), env.HANMADI_MUSIC_CATALOG_URL);
    assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer private-fixture-token");
    assert.equal(options?.redirect, "error"); assert.equal(options?.cache, "no-store"); assert(options?.signal);
    return response(fixture());
  };
  const result = await loadMusicLyrics(env, fake, now);
  assert.equal(result.status, "ready"); assert.equal(calls, 1);
  assert(!JSON.stringify(result).includes("private-fixture-token"));
});
test("provider failures never leak bodies or enable unlicensed learning", async () => {
  for (const fake of [
    async () => new Response("secret", { status: 403 }),
    async () => new Response("not json", { headers: { "Content-Type": "application/json" } }),
    async () => response({ ...fixture(), expiresAt: "2025-01-01" }),
    async () => response({ ...fixture(), rights: {} }),
    async () => response({ padding: "x".repeat(160001) }),
    async () => { throw new Error("secret URL token"); },
  ] as (typeof fetch)[]) {
    const result = await loadMusicLyrics(env, fake, now);
    assert.equal(result.status, "unavailable"); assert(!JSON.stringify(result).includes("secret"));
  }
});

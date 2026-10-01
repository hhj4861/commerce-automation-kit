import test from "node:test";
import assert from "node:assert/strict";
import { cachedYoutubeSearch } from "./youtube-cache";
import { memoryTransientStore, claimSlot } from "./transient-store";
test("search normalization, expiry, page/language isolation and miss-only budget", async () => {
  let now = 0,
    calls = 0,
    quota = 0;
  const deps = {
    store: memoryTransientStore(() => now),
    count: async () => ++quota,
    fetcher: (async () => {
      calls++;
      return Response.json({ items: [] });
    }) as typeof fetch,
  };
  assert.equal(
    (await cachedYoutubeSearch({ query: " coffee   talk " }, "key", deps))
      .cacheHit,
    false,
  );
  assert.equal(
    (await cachedYoutubeSearch({ query: "coffee talk" }, "key", deps)).cacheHit,
    true,
  );
  assert.equal(calls, 1);
  assert.equal(quota, 1);
  await cachedYoutubeSearch(
    { query: "coffee talk", pageToken: "page2" },
    "key",
    deps,
  );
  await cachedYoutubeSearch(
    { query: "coffee talk", language: "ja" },
    "key",
    deps,
  );
  assert.equal(calls, 3);
  now = 3600001;
  await cachedYoutubeSearch({ query: "coffee talk" }, "key", deps);
  assert.equal(calls, 4);
  quota = 20;
  await assert.rejects(
    cachedYoutubeSearch({ query: "new" }, "key", deps),
    /예산/,
  );
  assert.equal(
    (await cachedYoutubeSearch({ query: "coffee talk" }, "key", deps)).cacheHit,
    true,
  );
});
test("concurrent search misses make one upstream request; failures are never cached", async () => {
  let calls = 0,
    quota = 0,
    fail = false;
  const deps = {
    store: memoryTransientStore(),
    count: async () => ++quota,
    fetcher: (async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return fail
        ? new Response("failure", { status: 503 })
        : Response.json({ items: [] });
    }) as typeof fetch,
  };
  await Promise.all(
    [1, 2, 3].map(() => cachedYoutubeSearch({ query: "same" }, "key", deps)),
  );
  assert.equal(calls, 1);
  assert.equal(quota, 1);
  fail = true;
  await assert.rejects(cachedYoutubeSearch({ query: "failure" }, "key", deps));
  fail = false;
  await cachedYoutubeSearch({ query: "failure" }, "key", deps);
  assert.equal(calls, 3);
});
test("leases are bounded and a stale worker cannot release another worker's lease", async () => {
  let now = 0;
  const db = memoryTransientStore(() => now);
  const claims = await Promise.all(
    Array.from({ length: 8 }, () => claimSlot(db, "slots", 3, 2)),
  );
  assert.equal(claims.filter(Boolean).length, 3);
  now = 3000;
  const replacement = await claimSlot(db, "slots", 1, 2);
  assert(replacement);
  await claims[0]!();
  assert.equal(await claimSlot(db, "slots", 1, 2), null);
  await replacement();
  assert(await claimSlot(db, "slots", 1, 2));
});

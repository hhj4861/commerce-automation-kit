import assert from "node:assert/strict";
import { resolve } from "node:path";

// Official request construction/response parsing is covered in youtube-search.test.ts.
// Only external search responses are fixtures here; auth and editor use real handlers.
export async function verifyYoutubeSearch({
  adminPage: page,
  post,
  admin,
  screenshots,
}) {
  const searchBody = {
    action: "search",
    query: "카페 회화",
  };
  assert.equal(
    (await post(searchBody, undefined, "/api/study/admin")).status,
    403,
  );
  for (const pageToken of [null, {}, "bad token", "a".repeat(1025)]) {
    const result = await post(
      { ...searchBody, pageToken },
      admin,
      "/api/study/admin",
    );
    assert.equal(result.status, 400);
    assert.match(
      result.data.error,
      /페이지/,
      "search reaches its own validation without material settings",
    );
  }
  const missingSettings = await post(
    { action: "generate" },
    admin,
    "/api/study/admin",
  );
  assert.equal(missingSettings.status, 400);
  assert.match(
    missingSettings.data.error,
    /언어와 상황/,
    "material creation still requires classification",
  );
  assert.equal(
    (await post({ ...searchBody, query: "  " }, admin, "/api/study/admin"))
      .status,
    400,
  );

  const names = [
    "카페에서 자연스럽게 주문하는 일본어 회화",
    "처음 만난 사람과 나누는 짧은 대화",
    "길을 물을 때 꼭 필요한 일본어 표현",
    "여행의 시작, 공항에서 대화하기",
    "친구와 다음 약속을 정하는 표현",
    "메뉴를 추천받고 취향을 설명하는 대화",
    "취미와 관심사를 편하게 나누기",
    "하루를 마무리하는 따뜻한 인사",
  ];
  const videos = names.map((title, i) => ({
    id: `video00000${i}`,
    url: `https://www.youtube.com/watch?v=video00000${i}`,
    title,
    channel: `한마디 회화 예시 ${i + 1}`,
    thumbnail: null,
  }));
  const calls = [];
  videos[0].thumbnail = "https://i.ytimg.com/vi/video000000/mqdefault.jpg";
  videos[2].thumbnail = "https://i.ytimg.com/vi/video000002/mqdefault.jpg";
  const thumbnailHandler = (route) =>
    route.request().url().includes("video000002")
      ? route.fulfill({ status: 404, body: "missing thumbnail" })
      : route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#dae5ee"/><rect x="24" y="24" width="272" height="132" rx="8" fill="#fbfcfe"/><text x="160" y="80" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#3157d5">카페에서 한마디</text><text x="160" y="118" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#64748b">브라우저 검증용 이미지</text></svg>',
        });
  let failThird = true;
  let holdSearch = false,
    releaseSearch;
  let holdGeneration = true,
    releaseGeneration;
  let failGeneration = true,
    loseResponse = false;
  const generations = [];
  const uncertainVideo = {
    ...videos[0],
    id: "video000008",
    url: "https://www.youtube.com/watch?v=video000008",
    title: "응답 유실 확인용 영상",
    thumbnail: null,
  };
  const handler = async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    const body = request.postDataJSON();
    if (body.action === "generate") {
      generations.push(body);
      if (holdGeneration) {
        holdGeneration = false;
        await new Promise((resolve) => {
          releaseGeneration = resolve;
        });
      }
      if (body.sourceUrl === videos[1].url && failGeneration) {
        failGeneration = false;
        return route.fulfill({
          status: 400,
          json: { error: "검증용 원문 확인 오류" },
        });
      }
      if (loseResponse) {
        loseResponse = false;
        const result = await route.fetch();
        assert.equal(
          result.status(),
          200,
          "the uncertain response was saved by the real handler",
        );
        return route.abort("failed");
      }
      return route.continue();
    }
    if (body.action !== "search") return route.continue();
    assert.equal(
      body.language,
      undefined,
      "search never sends material language",
    );
    assert.equal(body.scene, undefined, "search never sends material scene");
    calls.push(body);
    if (body.pageToken === "SECOND" && holdSearch) {
      holdSearch = false;
      await new Promise((resolve) => {
        releaseSearch = resolve;
      });
    }
    await new Promise((r) => setTimeout(r, 100));
    if (body.pageToken === "THIRD" && failThird) {
      failThird = false;
      return route.fulfill({
        status: 429,
        json: { error: "검색 한도에 도달했어요. 잠시 후 다시 시도해 주세요." },
      });
    }
    const data =
      body.query === "응답 확인"
        ? { videos: [uncertainVideo], nextPageToken: null }
        : body.query === "결과 없는 검색"
          ? { videos: [], nextPageToken: null }
          : !body.pageToken
            ? { videos: videos.slice(0, 5), nextPageToken: "SECOND" }
            : body.pageToken === "SECOND"
              ? { videos: videos.slice(4, 7), nextPageToken: "THIRD" }
              : body.pageToken === "THIRD"
                ? { videos: [], nextPageToken: "FOURTH" }
                : { videos: videos.slice(7), nextPageToken: null };
    data.totalResults =
      body.query === "결과 없는 검색"
        ? 0
        : body.query === "응답 확인"
          ? 1
          : 12500;
    // A deliberately cancelled search may no longer have an active browser request.
    return route.fulfill({ json: data }).catch((error) => {
      if (!request.failure()) throw error;
    });
  };
  await page.route("**/api/study/admin", handler);
  await page.route("https://i.ytimg.com/**", thumbnailHandler);
  try {
    const query = page.getByLabel("검색어", { exact: true });
    const status = page.locator(".vs-live");
    const all = page.getByLabel("이 페이지 모두 선택", { exact: true });
    const next = page.getByRole("button", { name: "다음", exact: true });
    const previous = page.getByRole("button", { name: "이전", exact: true });
    const queue = page.getByRole("complementary", { name: "자료 준비 목록" });
    assert.equal(await page.locator(".vs-search select").count(), 0);
    assert.equal(
      await queue.locator("select").count(),
      0,
      "empty preparation hides material settings",
    );
    await query.fill("카페 회화");
    await query.press("Enter");
    await status.filter({ hasText: "1페이지 · 영상 5개" }).waitFor();
    assert.equal(await page.locator(".vs-video").count(), 5);
    await page.getByText("검색 결과 약 12,500개", { exact: true }).waitFor();
    await page.locator(".vs-video").first().locator("img").waitFor();
    await page.waitForFunction(
      () => document.querySelector(".vs-video img")?.naturalWidth > 0,
    );
    await page
      .locator(".vs-video")
      .nth(2)
      .locator(".vs-thumbnail-fallback")
      .waitFor();
    assert(await previous.isDisabled());
    await page
      .getByRole("checkbox", { name: `${names[0]} 선택`, exact: true })
      .check();
    assert(await all.evaluate((input) => input.indeterminate));
    await all.focus();
    await page.keyboard.press("Space");
    assert.equal(await queue.locator("li").count(), 5);
    await next.click();
    await status.filter({ hasText: "2페이지 · 영상 3개" }).waitFor();
    assert(
      await all.evaluate((input) => input.indeterminate),
      "duplicate on next page retains selection",
    );
    assert.equal(calls[1].pageToken, "SECOND");
    await all.check();
    assert.equal(
      await queue.locator("li").count(),
      7,
      "duplicates never create extra queue entries",
    );
    await all.uncheck();
    assert.equal(
      await queue.locator("li").count(),
      4,
      "deselect current page preserves other pages",
    );
    await all.check();
    await previous.click();
    assert(await all.isChecked());
    assert.equal(
      calls.length,
      2,
      "cached previous page does not consume search budget",
    );
    await next.click();
    assert.equal(
      calls.length,
      2,
      "cached forward page does not consume search budget",
    );
    await next.click();
    await page.getByRole("alert").filter({ hasText: "검색 한도" }).waitFor();
    assert.match(await status.textContent(), /2페이지/);
    assert.equal(await queue.locator("li").count(), 7);
    await page.getByRole("button", { name: "다시 시도", exact: true }).click();
    await status.filter({ hasText: "3페이지 · 영상 0개" }).waitFor();
    assert(
      !(await next.isDisabled()),
      "an empty page can have an API next token",
    );
    await next.click();
    await status.filter({ hasText: "4페이지 · 영상 1개" }).waitFor();
    assert(await next.isDisabled());
    await query.fill("결과 없는 검색");
    await query.press("Enter");
    await status.filter({ hasText: "1페이지 · 영상 0개" }).waitFor();
    assert.equal(await queue.locator("li").count(), 7);
    await page.getByText("검색 결과 약 0개", { exact: true }).waitFor();
    assert(await next.isDisabled());
    assert.equal(
      calls.at(-1).pageToken,
      undefined,
      "new query resets pagination",
    );
    await query.fill("카페 회화");
    await query.press("Enter");
    await status.filter({ hasText: "1페이지 · 영상 5개" }).waitFor();
    assert(await all.isChecked());
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `video search overflow at ${width}`,
      );
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: resolve(screenshots, `video-search-${width}.png`),
          fullPage: true,
        });
      if (width === 390) {
        await page
          .getByRole("link", { name: "준비 목록 7개 보기", exact: true })
          .click();
        await page.waitForFunction(() => {
          const top = document
            .getElementById("video-preparation")
            .getBoundingClientRect().top;
          // The global header scroll padding and section margin leave intentional space.
          return top >= 0 && top < innerHeight / 4;
        });
        await page.evaluate(() =>
          window.scrollTo({ top: 0, behavior: "instant" }),
        );
      }
    }
    // Whole-search selection fetches unseen pages, resumes after quota failure, and skips cached pages.
    const selectEvery = () =>
      page.getByRole("button", { name: "모든 페이지 전체 선택", exact: true });
    await queue.getByRole("button", { name: "전체 해제", exact: true }).click();
    failThird = true;
    const beforeBulk = calls.length;
    await selectEvery().click();
    await page.getByRole("alert").filter({ hasText: "검색 한도" }).waitFor();
    await page.getByText(/전체 선택은 끝나지 않았어요/).waitFor();
    assert.equal(await queue.locator("li").count(), 7);
    assert.deepEqual(
      calls.slice(beforeBulk).map((c) => c.pageToken),
      ["SECOND", "THIRD"],
    );
    await selectEvery().click();
    await page
      .getByRole("button", { name: "모든 페이지 선택 완료", exact: true })
      .waitFor();
    assert.equal(await queue.locator("li").count(), 8);
    assert.deepEqual(
      calls.slice(beforeBulk).map((c) => c.pageToken),
      ["SECOND", "THIRD", "THIRD", "FOURTH"],
    );
    assert.equal(
      await page.locator(".vs-video").count(),
      5,
      "bulk selection keeps five-item display",
    );

    // Cancelling preserves the selected prefix, and a new invocation continues at the pending token.
    await queue.getByRole("button", { name: "전체 해제", exact: true }).click();
    await query.fill("중단 확인");
    await query.press("Enter");
    await status.filter({ hasText: "1페이지 · 영상 5개" }).waitFor();
    holdSearch = true;
    const waitingSearch = page.waitForRequest(
      (r) => r.method() === "POST" && r.postDataJSON()?.pageToken === "SECOND",
    );
    await selectEvery().click();
    await waitingSearch;
    await page.waitForFunction(
      () =>
        document.querySelector(".vs-all-pages button")?.textContent ===
        "전체 선택 중지",
    );
    await page
      .getByRole("button", { name: "전체 선택 중지", exact: true })
      .click();
    await page.getByText(/전체 선택을 중지했어요/).waitFor();
    assert.equal(await queue.locator("li").count(), 5);
    releaseSearch();
    await selectEvery().click();
    await page
      .getByRole("button", { name: "모든 페이지 선택 완료", exact: true })
      .waitFor();
    assert.equal(await queue.locator("li").count(), 8);

    // All sources are explicitly mapped to their own video, with a shared rights attestation.
    const batchButton = () =>
      queue.getByRole("button", { name: /^(전체|남은) 자료 만들기/ });
    assert(await batchButton().isDisabled());
    await queue.getByLabel("공통 연습 레벨", { exact: true }).selectOption("2");
    const rights =
      "직접 제작한 영상별 원문이며 AI 처리와 수업 재사용 권한을 보유합니다.";
    await queue
      .getByLabel("목록 전체의 원문 사용권 근거", { exact: true })
      .fill(rights);
    const texts = videos.map(
      (v, i) =>
        `영상 ${i + 1}의 직접 작성한 원문입니다. 카페에서 인사하고 주문하는 개별 회화입니다. ${v.title}`,
    );
    const sourceFiles = videos.map((v, i) => ({
      name: `${v.id}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from(texts[i]),
    }));
    const upload = queue.getByLabel("원문 파일 여러 개 연결", { exact: true });
    await upload.setInputFiles(sourceFiles.slice(0, 7));
    await queue.getByText("원문 7개를 연결했어요.", { exact: true }).waitFor();
    assert(
      await batchButton().isDisabled(),
      "missing source blocks bulk start",
    );
    await upload.setInputFiles([
      sourceFiles[7],
      {
        name: "unmatched.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(texts[0]),
      },
    ]);
    await queue.getByText(/연결하지 못한 파일 1개/).waitFor();
    await queue
      .getByLabel(
        "목록의 모든 원문을 AI로 처리하고 수업에 재사용할 권한을 확인했어요.",
        { exact: true },
      )
      .check();
    assert(
      await batchButton().isDisabled(),
      "source and rights alone cannot save unclassified material",
    );
    const language = queue.getByLabel("학습 언어", { exact: true });
    const scene = queue.getByLabel("자료에 사용할 상황", { exact: true });
    const beforeSettings = calls.length;
    await language.selectOption("ja");
    assert(
      await batchButton().isDisabled(),
      "a scene must also be selected before saving",
    );
    await scene.selectOption("cafe");
    assert.equal(
      calls.length,
      beforeSettings,
      "material settings never trigger another search",
    );
    assert.equal(
      await queue.locator("li").count(),
      8,
      "classification preserves selected videos",
    );
    assert(!(await batchButton().isDisabled()));
    await page.setViewportSize({ width: 390, height: 1100 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await queue.screenshot({
      path: resolve(screenshots, "video-batch-ready.png"),
    });
    const waitingGeneration = page.waitForRequest(
      (r) => r.method() === "POST" && r.postDataJSON()?.action === "generate",
    );
    await batchButton().click();
    await waitingGeneration;
    assert(
      await page
        .getByRole("button", { name: "학습 관리", exact: true })
        .isDisabled(),
    );
    await queue
      .getByRole("button", { name: "현재 영상까지만 만들기", exact: true })
      .click();
    releaseGeneration();
    await queue.getByText(/초안 완료 1개 · 만들 자료 7개/).waitFor();
    await batchButton().waitFor();
    assert.equal(
      generations.length,
      1,
      "stop finishes the in-flight video and starts no more",
    );
    await batchButton().click();
    await queue.getByText(/초안 완료 7개 · 만들 자료 1개/).waitFor();
    await batchButton().waitFor();
    assert.equal(generations.length, 8);
    await batchButton().click();
    await queue.getByText(/초안 완료 8개 · 만들 자료 0개/).waitFor();
    await batchButton().waitFor();
    assert(await batchButton().isDisabled());
    assert.equal(
      generations.length,
      9,
      "only the one explicit failure is retried",
    );
    for (const body of generations) {
      const index = videos.findIndex((v) => v.url === body.sourceUrl);
      assert.equal(body.transcript, texts[index]);
      assert.equal(body.title, names[index]);
      assert.equal(body.level, 2);
      assert.equal(body.language, "ja");
      assert.equal(body.scene, "cafe");
      assert.equal(body.rights, rights);
      assert.equal(body.rightsConfirmed, true);
      assert.equal(body.status, undefined, "batch does not publish drafts");
    }
    const snapshot = await (
      await admin.request.get(new URL("/api/study/admin", page.url()).href)
    ).json();
    const created = snapshot.drafts.filter((d) =>
      videos.some((v) => v.url === d.sourceUrl),
    );
    assert.equal(created.length, 8, "one separate stored draft per video");
    assert.equal(
      new Set(created.map((d) => d.sourceHash)).size,
      8,
      "per-video source provenance stays separate",
    );
    assert(created.every((d) => d.status === "draft"));
    assert(
      created.every(
        (d) => d.language === "ja" && d.scene === "cafe" && d.level === 2,
      ),
    );
    const savedSummary = await queue
      .locator("li")
      .first()
      .locator("small")
      .first()
      .innerText();
    await language.selectOption("en");
    await scene.selectOption("smalltalk");
    await queue.getByLabel("공통 연습 레벨", { exact: true }).selectOption("3");
    assert.equal(
      await queue.locator("li").first().locator("small").first().innerText(),
      savedSummary,
      "changing pending defaults never relabels a saved draft",
    );
    await language.selectOption("ja");
    await page
      .getByRole("button", { name: "자료 만들기", exact: true })
      .click();
    await page
      .getByLabel("원문 사용권 근거", { exact: true })
      .fill("편집 중인 미저장 사용권 기록을 유지해야 합니다.");
    await page.getByRole("button", { name: "영상 찾기", exact: true }).click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await queue
      .getByRole("button", { name: `${names[0]} 초안 검수`, exact: true })
      .click();
    assert(
      await queue.isVisible(),
      "cancel preserves an editor containing only rights notes",
    );
    page.once("dialog", (dialog) => dialog.accept());
    await queue
      .getByRole("button", { name: `${names[0]} 초안 검수`, exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("참고 영상 주소 (선택)", { exact: true })
        .inputValue(),
      videos[0].url,
    );
    assert.equal(
      await page.getByLabel("수업 제목", { exact: true }).inputValue(),
      names[0],
    );
    await page.getByLabel("교재 찾기", { exact: true }).fill("이전 검색 필터");
    await page.getByRole("button", { name: "영상 찾기", exact: true }).click();

    // A saved response lost on the wire is marked unknown and never silently retried.
    await queue.getByRole("button", { name: "전체 해제", exact: true }).click();
    await query.fill("응답 확인");
    await query.press("Enter");
    await status.filter({ hasText: "1페이지 · 영상 1개" }).waitFor();
    await selectEvery().click();
    await queue.getByRole("button", { name: /전체 자료 만들기/ }).waitFor();
    await upload.setInputFiles([
      {
        name: `${uncertainVideo.id}.txt`,
        mimeType: "text/plain",
        buffer: Buffer.from(texts[0]),
      },
    ]);
    await queue.getByText("원문 1개를 연결했어요.", { exact: true }).waitFor();
    await queue
      .getByLabel(
        "목록의 모든 원문을 AI로 처리하고 수업에 재사용할 권한을 확인했어요.",
        { exact: true },
      )
      .check();
    loseResponse = true;
    await batchButton().click();
    await queue
      .getByText(/초안 완료 0개 · 만들 자료 0개 · 확인 필요 1개/)
      .waitFor();
    await batchButton().waitFor();
    assert(await batchButton().isDisabled());
    assert.equal(generations.length, 10);
    await queue
      .getByRole("button", { name: "콘텐츠 목록에서 확인", exact: true })
      .click();
    await page
      .locator(".hm-draft")
      .filter({ hasText: uncertainVideo.title })
      .waitFor();
    await page.getByRole("button", { name: "영상 찾기", exact: true }).click();
    await queue.getByRole("button", { name: "전체 해제", exact: true }).click();
    assert.equal(await queue.locator("li").count(), 0);
    console.log(
      "PASS keyword-only search, save-time classification, saved metadata preservation, search totals, five-item paging, ALL unseen pages, cancel/resume, partial failures, source imports, sequential bulk drafts, stop/retry, response-loss guard, separate provenance and human review",
    );
  } finally {
    await page.unroute("**/api/study/admin", handler);
    await page.unroute("https://i.ytimg.com/**", thumbnailHandler);
  }
}

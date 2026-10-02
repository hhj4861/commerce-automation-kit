import assert from "node:assert/strict";
import { resolve } from "node:path";
// Browser uses external search/analysis fixtures. Server orchestration and provider
// contracts are tested separately in video-ingestion.test.ts; auth stays real here.
export async function verifyYoutubeSearch({
  adminPage: page,
  post,
  admin,
  screenshots,
}) {
  const endpoint = "/api/study/admin/videos";
  const settings = { language: "ja", scene: "cafe", level: 2 };
  assert.equal(
    (
      await post(
        { action: "prepare", ...settings, ids: ["video000000"] },
        undefined,
        endpoint,
      )
    ).status,
    403,
  );
  for (const ids of [
    [],
    Array.from(
      { length: 11 },
      (_, i) => `video0000${String(i).padStart(2, "0")}`,
    ),
    ["video000000", "video000000"],
  ])
    assert.equal(
      (await post({ action: "prepare", ...settings, ids }, admin, endpoint))
        .status,
      400,
    );
  const prepared = await post(
    { action: "prepare", ...settings, ids: ["video000000"] },
    admin,
    endpoint,
  );
  assert.equal(prepared.status, 200);
  assert.equal(
    (
      await post(
        {
          action: "process",
          batchId: prepared.data.batchId,
          videoId: "video000001",
        },
        admin,
        endpoint,
      )
    ).status,
    400,
  );
  for (const token of [null, {}, "bad token"]) {
    const r = await post(
      { action: "search", query: "카페 회화", pageToken: token },
      admin,
      "/api/study/admin",
    );
    assert.equal(r.status, 400);
  }
  const videos = Array.from({ length: 15 }, (_, i) => ({
    id: `video0000${String(i).padStart(2, "0")}`,
    title: `카페에서 나누는 일본어 대화 ${i + 1}`,
    url: `https://www.youtube.com/watch?v=video0000${String(i).padStart(2, "0")}`,
    channel: "한마디 검증용 채널",
    thumbnail: null,
  }));
  let searchCalls = 0,
    active = 0,
    maxActive = 0,
    fail = true;
  const attempts = new Map();
  const errors = [];
  const pageError = (e) => errors.push(e.message);
  page.on("pageerror", pageError);
  const searchHandler = async (route) => {
    const b = route.request().postDataJSON();
    if (b?.action !== "search") return route.continue();
    searchCalls++;
    assert.equal(b.language, undefined);
    assert.equal(b.scene, undefined);
    const start = Number(b.pageToken || 0);
    return route.fulfill({
      json: {
        videos: videos.slice(start, start + 5),
        nextPageToken: start + 5 < videos.length ? String(start + 5) : null,
        totalResults: 12500,
        cachedAt: Date.now(),
        cacheHit: searchCalls > 1,
      },
    });
  };
  const analysisHandler = async (route) => {
    const b = route.request().postDataJSON();
    if (b.action === "prepare") return route.continue();
    attempts.set(b.videoId, (attempts.get(b.videoId) || 0) + 1);
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 180));
    active--;
    const index = videos.findIndex((v) => v.id === b.videoId);
    if (index === 1 && fail) {
      fail = false;
      return route.fulfill({
        json: {
          state: "failed",
          message: "JEV 평가를 완료하지 못했어요. 분석 결과를 재사용해요.",
        },
      });
    }
    if (index === 2)
      return route.fulfill({
        json: {
          state: "skipped",
          message: "기존 자료와 중복되어 저장하지 않았어요.",
          judgments: [
            {
              index: 0,
              choice: "duplicate",
              confidence: 0.99,
              accepted: false,
            },
          ],
        },
      });
    const draft = {
      id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
      revision: 1,
      updatedAt: Date.now(),
      ...settings,
      title: videos[index].title,
      sourceUrl: videos[index].url,
      rights: "검증용 공식 영상 분석 초안",
      status: "draft",
      ...(index === 3 ? { videoReview: { requiresHumanReview: true, rubric: "fixture", model: "fixture",
        analyzedAt: Date.now(), comparedCount: 1, referenceCount: 1,
        judgments: [{ index: 0, choice: "unreliable", confidence: 0.41, accepted: false, disposition: "review", reason: "low_confidence" }],
        evidence: [{ at: 10, evidence: "창가 자리를 묻는 표현을 설명하는 합성 근거" }] } } : {}),
      units: [
        {
          text: "窓の席はありますか。",
          meaning: "창가 자리가 있나요?",
          reading: "마도노 세키와 아리마스카",
        },
      ],
    };
    return route.fulfill({
      json: {
        state: index === 3 ? "review" : "created",
        draft,
        message: index === 3 ? "확신이 낮은 표현을 검토 대기로 보관했어요." : "JEV 통과 표현을 저장했어요.",
        judgments: [
          { index: 0, choice: index === 3 ? "unreliable" : "useful", confidence: index === 3 ? 0.41 : 0.97, accepted: index !== 3, disposition: index === 3 ? "review" : "accepted", reason: index === 3 ? "low_confidence" : "qualified" },
        ],
      },
    });
  };
  await page.route("**/api/study/admin", searchHandler);
  await page.route("**/api/study/admin/videos", analysisHandler);
  try {
    const query = page.getByLabel("검색어", { exact: true }),
      queue = page.getByRole("complementary", { name: "자료 준비 목록" });
    assert.equal(await page.locator(".vs-search select").count(), 0);
    await query.fill("카페 회화");
    await query.press("Enter");
    await page.getByText("검색 결과 약 12,500개", { exact: true }).waitFor();
    assert.equal(await page.locator(".vs-video").count(), 5);
    await page.getByLabel("이 페이지 모두 선택", { exact: true }).check();
    assert.equal(await queue.locator("li").count(), 5);
    await page
      .getByRole("button", {
        name: "모든 페이지에서 최대 10개 선택",
        exact: true,
      })
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll(".vs-batch-queue > li").length === 10,
    );
    assert.equal(searchCalls, 2);
    assert(
      await page
        .getByRole("button", { name: "최대 10개 선택 완료", exact: true })
        .isDisabled(),
    );
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.locator(".vs-live").filter({ hasText: "3페이지" }).waitFor();
    assert(await page.locator(".vs-video input").first().isDisabled());
    await page.getByRole("button", { name: "이전", exact: true }).click();
    await page.getByRole("button", { name: "이전", exact: true }).click();
    assert.equal(searchCalls, 3);
    assert.equal(
      await queue.locator('input[type="file"],textarea').count(),
      0,
      "no manual source inputs",
    );
    await queue.getByLabel("학습 언어", { exact: true }).selectOption("ja");
    await queue
      .getByLabel("자료에 사용할 상황", { exact: true })
      .selectOption("cafe");
    await queue.getByLabel("공통 연습 레벨", { exact: true }).selectOption("2");
    assert.equal(searchCalls, 3);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `overflow ${width}`,
      );
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert.equal(await page.locator(".hm-header").count(), 1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    await page.screenshot({
      path: resolve(screenshots, "video-analysis-ready-1440.png"),
      fullPage: false,
    });
    await queue
      .getByRole("button", {
        name: "전체 분석·자료 만들기 (10개)",
        exact: true,
      })
      .click();
    await queue
      .getByText("일괄 처리를 마쳤어요. 영상별 결과를 확인해 주세요.", {
        exact: true,
      })
      .waitFor();
    assert.equal(maxActive, 3);
    assert.equal(await queue.locator(".vs-job-created").count(), 7);
    assert.equal(await queue.locator(".vs-job-review").count(), 1);
    assert.equal(await queue.locator(".vs-job-skipped").count(), 1);
    assert.equal(await queue.locator(".vs-job-failed").count(), 1);
    await queue
      .getByRole("button", { name: "남은 영상 분석 (1개)", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll(".vs-job-created").length === 8,
    );
    assert.equal(attempts.get(videos[0].id), 1);
    assert.equal(attempts.get(videos[1].id), 2);
    await page.setViewportSize({ width: 390, height: 900 });
    await queue.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({
      path: resolve(screenshots, "video-analysis-result-390.png"),
      fullPage: true,
    });
    const pendingReview = queue.locator(`li[data-video-id="${videos[3].id}"]`);
    await pendingReview.scrollIntoViewIfNeeded();
    assert.match(await pendingReview.innerText(), /통과 0개.*검토 대기 1개.*제외 0개/);
    await pendingReview.getByText("분석 구간·평가 근거", { exact: true }).click();
    assert.match(await pendingReview.innerText(), /평가 분류: 근거·내용 불확실/);
    assert.match(await pendingReview.innerText(), /판정 확신이 낮아 직접 확인 필요/);
    await page.screenshot({ path: resolve(screenshots, "video-analysis-review-390.png"), fullPage: false });
    await pendingReview.getByRole("button", { name: "초안 검수", exact: true }).click();
    await page.getByText(/자동 검수로 확정하지 못한 표현이 있어 검토 대기 중이에요/).waitFor();
    await page.getByText("저장 당시 JEV·교차 검수 보기", { exact: true }).click();
    assert.match(await page.locator("details").filter({ hasText: "저장 당시 JEV·교차 검수 보기" }).innerText(), /평가 분류: 근거·내용 불확실/);
    assert(await page.getByRole("button", { name: "검수 완료 · 학습에 게시", exact: true }).isDisabled());
    await page.getByRole("button", { name: "새 초안", exact: true }).click();
    await page.getByRole("navigation", { name: "관리자 메뉴" }).getByRole("button", { name: "영상 찾기", exact: true }).click();
    assert.deepEqual(errors, []);
    await queue.getByRole("button", { name: "전체 해제", exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
  } finally {
    await page.unroute("**/api/study/admin", searchHandler);
    await page.unroute("**/api/study/admin/videos", analysisHandler);
    page.off("pageerror", pageError);
  }
  console.log(
    "PASS video search pages/cap 10, no transcript UI, concurrency 3, Jev exclusion, failure retry, responsive UI; provider responses are fixtures",
  );
}

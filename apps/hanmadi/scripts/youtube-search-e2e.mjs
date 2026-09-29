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
    language: "ja",
    scene: "smalltalk",
  };
  assert.equal(
    (await post(searchBody, undefined, "/api/study/admin")).status,
    403,
  );
  for (const pageToken of [null, {}, "bad token", "a".repeat(1025)])
    assert.equal(
      (await post({ ...searchBody, pageToken }, admin, "/api/study/admin"))
        .status,
      400,
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
  const handler = async (route) => {
    const request = route.request();
    if (
      request.method() !== "POST" ||
      request.postDataJSON()?.action !== "search"
    )
      return route.continue();
    const body = request.postDataJSON();
    calls.push(body);
    await new Promise((r) => setTimeout(r, 100));
    if (body.pageToken === "THIRD" && failThird) {
      failThird = false;
      return route.fulfill({
        status: 429,
        json: { error: "검색 한도에 도달했어요. 잠시 후 다시 시도해 주세요." },
      });
    }
    const data =
      body.query === "결과 없는 검색"
        ? { videos: [], nextPageToken: null }
        : !body.pageToken
          ? { videos: videos.slice(0, 5), nextPageToken: "SECOND" }
          : body.pageToken === "SECOND"
            ? { videos: videos.slice(4, 7), nextPageToken: "THIRD" }
            : body.pageToken === "THIRD"
              ? { videos: [], nextPageToken: "FOURTH" }
              : { videos: videos.slice(7), nextPageToken: null };
    return route.fulfill({ json: data });
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
    await query.fill("카페 회화");
    await query.press("Enter");
    await status.filter({ hasText: "1페이지 · 영상 5개" }).waitFor();
    assert.equal(await page.locator(".vs-video").count(), 5);
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
    await queue
      .getByRole("button", { name: `${names[0]} 자료 만들기`, exact: true })
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
    assert(
      await page
        .getByRole("button", { name: "AI로 학습 초안 만들기", exact: true })
        .isDisabled(),
      "metadata alone cannot generate a lesson",
    );
    await page
      .getByLabel("원문 사용권 근거", { exact: true })
      .fill("작성 중인 첫 영상의 원문 사용권 확인 내용");
    await page
      .getByLabel("직접 제공받은 텍스트·SRT·VTT 원문", { exact: true })
      .fill(
        "첫 번째 영상의 직접 작성한 원문입니다. 다음 영상으로 복사되면 안 됩니다.",
      );
    const rightsCheck = page.getByLabel(
      "이 원문을 AI로 처리하고 학습 표현으로 재사용할 권한을 확인했어요.",
      { exact: true },
    );
    await rightsCheck.check();
    await page.getByRole("button", { name: "영상 찾기", exact: true }).click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await queue
      .getByRole("button", { name: `${names[1]} 자료 만들기`, exact: true })
      .click();
    assert(await queue.isVisible(), "cancel preserves the current editor");
    await page
      .getByRole("button", { name: "자료 만들기", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("수업 제목", { exact: true }).inputValue(),
      names[0],
    );
    assert(await rightsCheck.isChecked());
    await page.getByRole("button", { name: "영상 찾기", exact: true }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await queue
      .getByRole("button", { name: `${names[1]} 자료 만들기`, exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("참고 영상 주소 (선택)", { exact: true })
        .inputValue(),
      videos[1].url,
    );
    assert.equal(
      await page.getByLabel("원문 사용권 근거", { exact: true }).inputValue(),
      "",
    );
    assert.equal(
      await page
        .getByLabel("직접 제공받은 텍스트·SRT·VTT 원문", { exact: true })
        .inputValue(),
      "",
    );
    assert.equal(await rightsCheck.isChecked(), false);
    await page.getByRole("button", { name: "영상 찾기", exact: true }).click();
    await queue.getByRole("button", { name: "전체 해제", exact: true }).click();
    assert.equal(await queue.locator("li").count(), 0);
    assert.equal(await all.isChecked(), false);
    console.log(
      "PASS YouTube 5/page, bulk and cross-page selection, cached paging, errors/retry, empty pages, mobile layout, per-video editor and rights reset",
    );
  } finally {
    await page.unroute("**/api/study/admin", handler);
    await page.unroute("https://i.ytimg.com/**", thumbnailHandler);
  }
}

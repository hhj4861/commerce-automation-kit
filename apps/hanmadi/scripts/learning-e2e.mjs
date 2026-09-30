import assert from "node:assert/strict";
import { resolve } from "node:path";

export const trainingFixture = { files: [], jobs: [], failNext: false };
export function learningProviderFixture(req, res, raw) {
  const url = new URL(req.url, "http://fixture.invalid");
  if (url.pathname === "/v1/models") {
    res.end(
      JSON.stringify({
        data: [{ id: "gemini-fixture" }, { id: "hanmadi-trained-fixture" }],
      }),
    );
    return true;
  }
  if (url.pathname === "/v1/embeddings") {
    const { input } = JSON.parse(raw);
    res.end(
      JSON.stringify({
        data: input.map((text, index) => ({
          index,
          embedding: /coffee|커피|카페인/i.test(text)
            ? [1, 0, 0]
            : /tea|차 |차를/i.test(text)
              ? [0, 1, 0]
              : /water|물 /i.test(text)
                ? [0, 0, 1]
                : [-1, -1, -1],
        })),
      }),
    );
    return true;
  }
  if (url.pathname === "/v1/files") {
    assert(raw.includes('name="purpose"\r\n\r\nfine-tune'));
    assert(raw.includes('name="target_model_names"\r\n\r\ntraining-fixture'));
    assert(!raw.includes("-test.jsonl"));
    const id = `file-${trainingFixture.files.length + 1}`;
    trainingFixture.files.push({ id, raw });
    res.end(JSON.stringify({ id }));
    return true;
  }
  if (url.pathname === "/v1/fine_tuning/jobs" && req.method === "POST") {
    const b = JSON.parse(raw);
    assert.equal(b.model, "training-fixture");
    assert(b.training_file && b.validation_file);
    const job = {
      ...b,
      id: `ftjob-${trainingFixture.jobs.length + 1}`,
      status: "queued",
      fine_tuned_model: null,
    };
    trainingFixture.jobs.push(job);
    if (trainingFixture.failNext) {
      trainingFixture.failNext = false;
      res.statusCode = 502;
      res.end(
        JSON.stringify({ error: "fixture lost response after remote create" }),
      );
      return true;
    }
    res.end(JSON.stringify(job));
    return true;
  }
  if (url.pathname === "/v1/fine_tuning/jobs") {
    res.end(JSON.stringify({ data: trainingFixture.jobs }));
    return true;
  }
  if (url.pathname.startsWith("/v1/fine_tuning/jobs/")) {
    const id = url.pathname.split("/")[4],
      job = trainingFixture.jobs.find((j) => j.id === id);
    assert(job);
    if (url.pathname.endsWith("/cancel")) {
      job.status = "cancelled";
    } else {
      job.status = "succeeded";
      job.fine_tuned_model =
        trainingFixture.resultOverride || "ft:fixture:trained";
    }
    res.end(JSON.stringify(job));
    return true;
  }
  return false;
}

export async function verifyLearning({
  adminPage: page,
  post,
  admin,
  other,
  base,
  screenshots,
  modelCalls,
}) {
  const endpoint = "/api/study/admin/learning";
  const action = (body, context = admin) => post(body, context, endpoint);
  const snapshot = async () => {
    const r = await admin.request.get(base + endpoint);
    assert.equal(r.status(), 200);
    return r.json();
  };
  assert.equal((await other.request.get(base + endpoint)).status(), 403);
  assert.equal((await action({ action: "dataset" }, other)).status, 403);
  const sources = [];
  for (const [word, meaning] of [
    ["Coffee", "커피"],
    ["Tea", "차"],
    ["Water", "물"],
  ]) {
    const saved = await post(
      {
        action: "save",
        title: `학습 ${meaning}`,
        language: "en",
        level: 1,
        scene: "cafe",
        sourceUrl: "",
        rights: "검증용 직접 작성 교재의 모델 학습 사용권 확인",
        units: Array.from({ length: 12 }, (_, i) => ({
          text: `${word}, please. Example ${i}.`,
          meaning: `${meaning} 주세요. 연습 ${i}.`,
          reading: "플리즈",
        })),
        reviewed: true,
        status: "published",
      },
      admin,
      "/api/study/admin",
    );
    assert.equal(saved.status, 200);
    sources.push(saved.data.draft);
  }
  const sourceIds = sources.map((d) => d.id);
  await page.goto(base + "/study/admin");
  await page.getByRole("button", { name: "학습 관리", exact: true }).click();
  await page
    .getByRole("heading", { name: "1. 자료 버전 만들기", exact: true })
    .waitFor();
  await page
    .getByLabel("자료 버전 이름", { exact: true })
    .fill("카페 검색 1차");
  for (const source of sources)
    await page
      .getByRole("checkbox", { name: new RegExp(source.title) })
      .check();
  await page
    .getByRole("button", { name: "선택한 교재로 버전 만들기", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "자료 버전을 만들었어요" })
    .waitFor();
  let s = await snapshot();
  const dataset = s.datasets.find((d) => d.name === "카페 검색 1차");
  assert(dataset);
  await page.getByLabel("평가 언어", { exact: true }).selectOption("en");
  await page.getByLabel("평가 상황", { exact: true }).selectOption("cafe");
  await page
    .getByLabel("평가 기능", { exact: true })
    .selectOption("translation");
  await page.getByLabel("평가 질문", { exact: true }).fill("카페인");
  await page
    .getByLabel("기대하는 검색 결과", { exact: true })
    .selectOption(sources[0].id);
  await page
    .getByRole("button", { name: "평가 질문 추가", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "평가 질문을 추가" })
    .waitFor();
  await page.getByLabel("평가 질문", { exact: true }).fill("우주선");
  await page.getByLabel("기대하는 검색 결과", { exact: true }).selectOption("");
  await page
    .getByRole("button", { name: "평가 질문 추가", exact: true })
    .click();
  await page
    .getByLabel("평가 질문", { exact: true })
    .filter({ visible: true })
    .waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector(
        'input[placeholder="예: 따뜻한 커피를 주문하고 싶어요"]',
      )?.value === "",
  );
  await page
    .getByRole("button", { name: "어휘 검색 평가", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "어휘 검색 평가를 완료" })
    .waitFor();
  s = await snapshot();
  assert.equal(s.evaluations.at(-1).passed, 1);
  assert.equal(
    (await action({ action: "semantic", enabled: true })).status,
    409,
  );
  await page
    .getByRole("button", { name: "검색 인덱스 만들기", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "의미 검색 인덱스를 만들었어요" })
    .waitFor();
  await page
    .getByRole("button", { name: "의미 검색 평가", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "의미 검색 평가를 완료" })
    .waitFor();
  assert.equal((await snapshot()).evaluations.at(-1).passed, 2);
  await page
    .getByRole("button", { name: "의미 검색 앱에 적용", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "의미 검색을 적용" })
    .waitFor();
  const preview = await post(
    {
      action: "preview",
      language: "en",
      level: 1,
      scene: "cafe",
      mode: "translation",
      query: "카페인",
    },
    admin,
    "/api/study/admin",
  );
  assert.equal(preview.status, 200);
  assert(preview.data.matches.every((m) => m.id === sources[0].id));
  assert(preview.data.matches.length > 0);
  assert.equal(
    (
      await action({
        action: "dataset",
        name: "권한 없음",
        purpose: "fine-tuning",
        sourceIds,
      })
    ).status,
    400,
  );
  const made = await action({
    action: "dataset",
    name: "카페 모델 1차",
    purpose: "fine-tuning",
    sourceIds,
    trainingRights: true,
  });
  assert.equal(made.status, 200);
  const training = made.data.result;
  for (const split of ["train", "validation", "test"]) {
    const exported = await action({ action: "export", id: training.id, split });
    assert.equal(exported.status, 200);
    assert.equal(exported.data.content.trim().split("\n").length, 12);
  }
  const prepared = await action({
    action: "prepare-training",
    id: training.id,
  });
  assert.equal(prepared.status, 200);
  const job = prepared.data.result;
  assert.equal(
    (await action({ action: "activate-training", id: job.id })).status,
    409,
  );
  assert.equal(
    (await action({ action: "start-training", id: job.id })).status,
    400,
  );
  const submissions = await Promise.all([
    action({ action: "start-training", id: job.id, confirmed: true }),
    action({ action: "start-training", id: job.id, confirmed: true }),
  ]);
  assert.deepEqual(submissions.map((r) => r.status).sort(), [200, 409]);
  assert.equal(trainingFixture.jobs.length, 1);
  assert.equal(trainingFixture.files.length, 2);
  const completed = await action({ action: "refresh-training", id: job.id });
  assert.equal(completed.status, 200);
  assert.equal(completed.data.result.status, "succeeded");
  assert.equal(
    (await action({ action: "activate-training", id: job.id })).status,
    409,
  );
  await page
    .getByRole("button", { name: "목록 새로고침", exact: true })
    .click();
  await page
    .getByRole("button", { name: "시험셋 검수 기록", exact: true })
    .click();
  await page
    .getByLabel("시험셋 검수 결과", { exact: true })
    .fill(
      "분리된 시험셋으로 기본 모델과 비교하여 언어와 뜻 및 난이도를 검수했습니다.",
    );
  await page
    .getByRole("checkbox", {
      name: "학습에 보내지 않은 시험셋으로 결과를 직접 검수했어요.",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "검수 기록 저장", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "시험셋 검수 결과를 저장" })
    .waitFor();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "검수 모델 앱에 적용", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "검수한 학습 모델을 해당 범위" })
    .waitFor();
  assert.equal((await snapshot()).activeJobId, job.id);
  assert.equal(
    (await action({ action: "delete-training-record", id: job.id })).status,
    409,
  );
  await post(
    {
      action: "assess",
      language: "en",
      answers: [0, 0, 0],
      confidence: 1,
      minutes: 5,
    },
    admin,
  );
  const chat = {
    action: "chat",
    language: "en",
    scene: "cafe",
    messages: [{ role: "user", content: "Hello" }],
  };
  assert.equal((await post(chat, admin)).status, 200);
  assert.equal(modelCalls.at(-1).model, "hanmadi-trained-fixture");
  assert.equal((await post({ ...chat, scene: "hotel" }, admin)).status, 200);
  assert.equal(modelCalls.at(-1).model, "gemini-fixture");
  // A lost submit response is recovered by remote training-file identity, never resubmitted.
  const next = (
    await action({
      action: "dataset",
      name: "응답 복구",
      purpose: "fine-tuning",
      sourceIds,
      trainingRights: true,
    })
  ).data.result;
  const unknown = (await action({ action: "prepare-training", id: next.id }))
    .data.result;
  trainingFixture.failNext = true;
  assert.equal(
    (
      await action({
        action: "start-training",
        id: unknown.id,
        confirmed: true,
      })
    ).status,
    502,
  );
  assert.equal(
    (
      await action({
        action: "start-training",
        id: unknown.id,
        confirmed: true,
      })
    ).status,
    409,
  );
  assert.equal(
    (await action({ action: "refresh-training", id: unknown.id })).data.result
      .status,
    "succeeded",
  );
  assert.equal(trainingFixture.jobs.length, 2);
  const cancelDataset = (
    await action({
      action: "dataset",
      name: "취소 검증",
      purpose: "fine-tuning",
      sourceIds,
      trainingRights: true,
    })
  ).data.result;
  const cancelJob = (
    await action({ action: "prepare-training", id: cancelDataset.id })
  ).data.result;
  assert.equal(
    (
      await action({
        action: "start-training",
        id: cancelJob.id,
        confirmed: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (await action({ action: "cancel-training", id: cancelJob.id })).data.result
      .status,
    "cancelled",
  );
  await page
    .getByRole("button", { name: "목록 새로고침", exact: true })
    .click();
  await page.getByText("카페 모델 1차", { exact: true }).first().waitFor();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `learning overflow ${width}`,
    );
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: resolve(screenshots, `learning-${width}.png`),
        fullPage: true,
      });
  }
  // A changed remote result invalidates the prior review and active model.
  trainingFixture.resultOverride = "ft:fixture:replacement";
  assert.equal(
    (await action({ action: "refresh-training", id: job.id })).status,
    200,
  );
  s = await snapshot();
  assert.equal(s.activeJobId, null);
  assert.equal(s.jobs.find((j) => j.id === job.id).review, undefined);
  trainingFixture.resultOverride = undefined;
  assert.equal(
    (await action({ action: "refresh-training", id: job.id })).status,
    200,
  );
  assert.equal(
    (
      await action({
        action: "review-training",
        id: job.id,
        confirmed: true,
        notes:
          "결과 모델을 다시 확인하고 분리된 시험셋에서 언어와 뜻 및 난이도를 재검수했습니다.",
      })
    ).status,
    200,
  );
  assert.equal(
    (await action({ action: "activate-training", id: job.id })).status,
    200,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const step of [1, 2, 3, 4]) {
    await page
      .getByRole("heading", { name: new RegExp(`^${step}[.]`) })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: resolve(screenshots, `learning-desktop-step-${step}.png`),
    });
  }
  assert.equal(
    (await action({ action: "delete-training-record", id: cancelJob.id }))
      .status,
    200,
  );
  assert.equal(
    (await action({ action: "delete-dataset", id: cancelDataset.id })).status,
    200,
  );
  const edited = await post(
    { action: "save", ...sources[0], status: "draft", reviewed: false },
    admin,
    "/api/study/admin",
  );
  assert.equal(edited.status, 200);
  s = await snapshot();
  assert.equal(s.semanticEnabled, false);
  assert.equal(s.activeJobId, null);
  assert(s.datasets.find((d) => d.id === dataset.id).invalidatedAt);
  assert.equal(
    (await action({ action: "export", id: training.id, split: "train" }))
      .status,
    409,
  );
  assert.equal(
    (await action({ action: "activate-training", id: job.id })).status,
    409,
  );
  assert.equal((await post(chat, admin)).status, 200);
  assert.equal(modelCalls.at(-1).model, "gemini-fixture");
  console.log(
    "PASS learning: owner UI/version/evaluation/semantic retrieval, source splits, fine-tuning upload/start/dedup/reconcile/cancel/review/activation/scope, unpublish invalidation, 320–1440px (fixture providers)",
  );
}

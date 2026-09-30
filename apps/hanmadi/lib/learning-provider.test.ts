import test from "node:test";
import assert from "node:assert/strict";
import {
  embed,
  providerRequest,
  trainingConfig,
  trainedAlias,
  trainingPolicy,
} from "./learning-provider";
const config = {
  baseURL: "https://example.invalid/v1",
  apiKey: "secret-do-not-leak",
  model: "embedding",
  id: "c",
};
test("provider settings are server controlled, HTTPS in production, explicit training enable/minimum", () => {
  assert.equal(trainingConfig({}), null);
  assert.throws(() =>
    trainingConfig({
      HANMADI_TRAINING_BASE_URL: "http://localhost/v1",
      HANMADI_TRAINING_API_KEY: "key",
      HANMADI_TRAINING_MODEL: "model",
      NODE_ENV: "production",
    }),
  );
  assert.throws(() =>
    trainingConfig({
      HANMADI_TRAINING_BASE_URL: "https://user:secret@host/v1",
      HANMADI_TRAINING_API_KEY: "key",
      HANMADI_TRAINING_MODEL: "model",
    }),
  );
  assert.equal(trainingPolicy({}).enabled, false);
  assert.equal(trainingPolicy({}).minimum, null);
  assert.equal(
    trainingPolicy({ HANMADI_TRAINING_MIN_EXAMPLES: "NaN" }).minimum,
    null,
  );
  assert.equal(
    trainedAlias("result", {
      HANMADI_TRAINED_MODELS: '{"result":"hanmadi-reviewed"}',
    }),
    "hanmadi-reviewed",
  );
  assert.equal(
    trainedAlias("other", {
      HANMADI_TRAINED_MODELS: '{"result":"hanmadi-reviewed"}',
    }),
    null,
  );
});
test("embedding batches respect provider indices, normalize vectors and reject partial/nonfinite dimensions", async () => {
  const fetcher = (async (_url, init) => {
    assert.equal(init?.redirect, "error");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer secret-do-not-leak",
    );
    return Response.json({
      data: [
        { index: 1, embedding: [0, 2] },
        { index: 0, embedding: [3, 0] },
      ],
    });
  }) as typeof fetch;
  assert.deepEqual(await embed(config, ["coffee", "tea"], fetcher), [
    [1, 0],
    [0, 1],
  ]);
  for (const data of [
    [{ index: 0, embedding: [1, 0] }],
    [
      { index: 0, embedding: [0, 0] },
      { index: 1, embedding: [1, 0] },
    ],
    [
      { index: 0, embedding: [1] },
      { index: 1, embedding: [1, 0] },
    ],
    [
      { index: 0, embedding: [1, 0] },
      { index: 0, embedding: [1, 0] },
    ],
  ])
    await assert.rejects(
      embed(config, ["a", "b"], (async () =>
        Response.json({ data })) as typeof fetch),
    );
});
test("provider failures never disclose remote text, credentials or source material", async () => {
  await assert.rejects(
    providerRequest(
      config,
      "/files",
      {},
      (async () =>
        new Response("secret-do-not-leak private source", {
          status: 500,
        })) as typeof fetch,
    ),
    (e) => {
      assert(e instanceof Error);
      assert(!e.message.includes("secret-do-not-leak"));
      assert(!e.message.includes("private source"));
      return true;
    },
  );
});

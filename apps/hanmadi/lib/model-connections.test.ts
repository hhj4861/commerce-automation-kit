import assert from "node:assert/strict";
import { test } from "node:test";
import { assertDefaultModel } from "./model-connections";
import { studyCompletion } from "./v2-ai";
import { ConversationError } from "./conversation";

test("the default model needs no personal connection", () => {
  assert.doesNotThrow(() => assertDefaultModel());
  assert.doesNotThrow(() => assertDefaultModel("default"));
});

test("retired selections fail before any model, account or training request", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected network call"); };
  try {
    for (const selection of ["codex-personal", "a".repeat(32) + ":gpt-test", "b".repeat(32) + ":claude-test", "", "unknown"]) {
      const retired = (e: unknown) => e instanceof ConversationError && e.status === 409 && e.message.includes("기본 Gemini");
      assert.throws(() => assertDefaultModel(selection), retired);
      await assert.rejects(studyCompletion("test", [{ role: "user", content: "hello" }], selection,
        undefined, { language: "ja", level: 1, scene: "cafe" }), retired);
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

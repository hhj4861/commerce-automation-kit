import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { parseEnv } from "node:util";

test("setup preserves unrelated app settings, keeps secrets private and is repeatable", () => {
  const fixture = mkdtempSync(join(tmpdir(), "hanmadi-gateway-"));
  try {
    mkdirSync(join(fixture, "scripts"));
    const script = join(fixture, "scripts/litellm.mjs");
    copyFileSync(new URL("./litellm.mjs", import.meta.url), script);
    const appEnv = join(fixture, ".env.local");
    const providerEnv = join(fixture, "provider.env");
    writeFileSync(appEnv, '# keep this comment\nAUTH_SECRET="test-original"\nLITELLM_API_KEY="old"\nLITELLM_API_KEY="duplicate"\n');
    writeFileSync(providerEnv, 'ELEVENLABS_API_KEY="test-provider-key"\nGEMINI_API_KEY="must-not-copy"\n');
    const run = () => execFileSync(process.execPath, [script, "setup", "--provider-env", providerEnv], { encoding: "utf8" });
    const output = run();
    const saved = readFileSync(appEnv, "utf8");
    const env = parseEnv(saved);
    const privateEnv = parseEnv(readFileSync(join(fixture, ".env.litellm"), "utf8"));
    assert.equal(env.AUTH_SECRET, "test-original");
    assert.match(saved, /# keep this comment/);
    assert.equal(saved.match(/^LITELLM_API_KEY=/gm).length, 1);
    assert.equal(env.LITELLM_API_KEY, privateEnv.LITELLM_MASTER_KEY);
    assert.equal(env.LITELLM_MODEL, "");
    assert.equal(env.LITELLM_STT_MODEL, "hanmadi-stt");
    assert.equal(env.LITELLM_TTS_MODEL, "hanmadi-tts");
    assert.equal(env.ELEVENLABS_API_KEY, undefined);
    assert.equal(privateEnv.GEMINI_API_KEY, undefined);
    assert.ok(!output.includes("test-provider-key") && !output.includes(env.LITELLM_API_KEY));
    assert.equal(statSync(appEnv).mode & 0o777, 0o600);
    assert.equal(statSync(join(fixture, ".env.litellm")).mode & 0o777, 0o600);
    run();
    assert.equal(readFileSync(appEnv, "utf8"), saved);
    // Adding provider credentials enables only the stable alias in the app.
    writeFileSync(join(fixture, ".env.litellm"), `${readFileSync(join(fixture, ".env.litellm"), "utf8")}\nHANMADI_CHAT_MODEL="openai/test-model"\nHANMADI_CHAT_API_KEY="test-chat-key"\n`);
    run();
    const connected = parseEnv(readFileSync(appEnv, "utf8"));
    assert.equal(connected.LITELLM_MODEL, "hanmadi-chat");
    assert.equal(connected.HANMADI_CHAT_API_KEY, undefined);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

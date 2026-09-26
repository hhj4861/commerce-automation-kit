// Local-only gateway. Provider credentials stay here; Next.js receives the gateway key.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";

const app = fileURLToPath(new URL("../", import.meta.url));
const runtime = resolve(app, ".litellm");
const secretPath = resolve(app, ".env.litellm");
const appEnvPath = resolve(app, ".env.local");
const baseUrl = "http://127.0.0.1:4000/v1";
const readEnv = (path) => existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};

function saveEnv(path, updates) {
  // Preserve unrelated settings/comments. Replace every duplicate managed key.
  const pending = new Set(Object.keys(updates));
  const lines = (existsSync(path) ? readFileSync(path, "utf8") : "").split("\n");
  const result = lines.flatMap((line) => {
    const key = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    if (!Object.hasOwn(updates, key)) return [line];
    if (!pending.delete(key)) return [];
    return [`${key}=${JSON.stringify(updates[key])}`];
  });
  for (const key of pending) result.push(`${key}=${JSON.stringify(updates[key])}`);
  writeFileSync(path, `${result.join("\n").trim()}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function gatewayEnv() {
  const env = readEnv(secretPath);
  if (!env.LITELLM_MASTER_KEY?.startsWith("sk-") || env.LITELLM_MASTER_KEY.length < 35)
    throw new Error("Run npm run ai:setup first (a private gateway key is required).");
  return env;
}

function modelList(env) {
  const models = [];
  if (env.HANMADI_CHAT_MODEL && env.HANMADI_CHAT_API_KEY)
    models.push({ model_name: "hanmadi-chat", litellm_params: {
      model: env.HANMADI_CHAT_MODEL, api_key: "os.environ/HANMADI_CHAT_API_KEY",
    }});
  if (env.ELEVENLABS_API_KEY) {
    models.push({ model_name: "hanmadi-stt", litellm_params: {
      model: "elevenlabs/scribe_v1", api_key: "os.environ/ELEVENLABS_API_KEY",
    }});
    models.push({ model_name: "hanmadi-tts", litellm_params: {
      model: "elevenlabs/eleven_v3", api_key: "os.environ/ELEVENLABS_API_KEY",
    }});
  }
  return models;
}

async function setup() {
  const providerIndex = process.argv.indexOf("--provider-env");
  if (providerIndex >= 0 && !process.argv[providerIndex + 1]) throw new Error("--provider-env needs a file path.");
  if (providerIndex >= 0 && !existsSync(resolve(process.argv[providerIndex + 1]))) throw new Error("Provider env file does not exist.");
  const source = providerIndex >= 0 ? readEnv(resolve(process.argv[providerIndex + 1])) : {};
  const old = readEnv(secretPath);
  const env = {
    LITELLM_MASTER_KEY: old.LITELLM_MASTER_KEY || `sk-${randomBytes(32).toString("hex")}`,
    ELEVENLABS_API_KEY: old.ELEVENLABS_API_KEY || source.ELEVENLABS_API_KEY || "",
    HANMADI_CHAT_MODEL: old.HANMADI_CHAT_MODEL || source.HANMADI_CHAT_MODEL || "",
    HANMADI_CHAT_API_KEY: old.HANMADI_CHAT_API_KEY || source.HANMADI_CHAT_API_KEY || "",
    HANMADI_TTS_VOICE: old.HANMADI_TTS_VOICE || "n2fbxG88jqAoaVPUy3IG",
  };
  saveEnv(secretPath, env);
  const names = modelList(env).map((model) => model.model_name);
  saveEnv(appEnvPath, {
    LITELLM_BASE_URL: baseUrl,
    LITELLM_API_KEY: env.LITELLM_MASTER_KEY,
    LITELLM_MODEL: names.includes("hanmadi-chat") ? "hanmadi-chat" : "",
    LITELLM_STT_MODEL: names.includes("hanmadi-stt") ? "hanmadi-stt" : "",
    LITELLM_TTS_MODEL: names.includes("hanmadi-tts") ? "hanmadi-tts" : "",
    LITELLM_TTS_VOICE: env.HANMADI_TTS_VOICE,
  });
  console.log("Saved private .env.litellm and app .env.local (mode 600; keys are never printed).");
  console.log(`Configured routes: ${names.join(", ") || "none"}. Provider authentication is not yet verified.`);
  if (!names.includes("hanmadi-chat")) console.log("CHAT PENDING: set HANMADI_CHAT_MODEL and HANMADI_CHAT_API_KEY in .env.litellm, then rerun ai:setup.");
}

async function start() {
  const env = gatewayEnv();
  const models = modelList(env);
  if (!models.length) throw new Error("No provider configured. Edit .env.litellm and run ai:setup.");
  const executable = resolve(app, "ops/litellm/.venv/bin/litellm");
  if (!existsSync(executable)) throw new Error("Install gateway: uv sync --project ops/litellm --locked");
  mkdirSync(runtime, { recursive: true, mode: 0o700 });
  const config = resolve(runtime, "config.json");
  writeFileSync(config, JSON.stringify({
    model_list: models,
    general_settings: { master_key: "os.environ/LITELLM_MASTER_KEY" },
    litellm_settings: { set_verbose: false, turn_off_message_logging: true, num_retries: 0, request_timeout: 30 },
  }, null, 2), { mode: 0o600 });
  console.log("Starting local LiteLLM on 127.0.0.1:4000. Ctrl+C stops it. No database/virtual keys/budget enforcement.");
  const child = spawn(executable, ["--config", config, "--host", "127.0.0.1", "--port", "4000"], {
    cwd: app, stdio: "inherit", env: { ...process.env, ...env, LITELLM_TELEMETRY: "False" },
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("error", () => { console.error("Could not start LiteLLM."); process.exitCode = 1; });
  child.on("exit", (code, signal) => { process.exitCode = code ?? (signal === "SIGINT" ? 0 : 1); });
}

async function check() {
  const env = readEnv(appEnvPath);
  if (env.LITELLM_BASE_URL !== baseUrl || !env.LITELLM_API_KEY) throw new Error("Run ai:setup to connect this local gateway.");
  const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options, headers: { Authorization: `Bearer ${env.LITELLM_API_KEY}`, ...options.headers },
      signal: AbortSignal.timeout(45000), redirect: "error",
    });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status} (upstream body withheld)`);
    return response;
  };
  const data = await (await request("/models")).json();
  const names = data.data.map((model) => model.id);
  console.log(`Gateway authenticated. Routes: ${names.join(", ")}`);
  const unauthorized = await fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(5000) });
  if (![401, 403].includes(unauthorized.status)) throw new Error("Gateway did not reject unauthenticated access.");
  console.log("Unauthenticated access rejected.");
  if (!process.argv.includes("--live")) {
    console.log("Provider generation not tested. Add --live for a short paid chat/TTS/STT check.");
    return;
  }
  let failed = false;
  if (!env.LITELLM_MODEL || !names.includes(env.LITELLM_MODEL)) {
    console.log("CHAT PENDING: no configured chat provider/key.");
    failed = true;
  } else {
    const chat = await (await request("/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: env.LITELLM_MODEL, messages: [{ role: "user", content: "한국어로 짧게 인사해 주세요." }], max_tokens: 80 }),
    })).json();
    if (!chat.choices?.[0]?.message?.content?.trim()) throw new Error("Chat returned no text.");
    console.log("CHAT OK: nonempty provider reply.");
  }
  if (!env.LITELLM_TTS_MODEL || !env.LITELLM_STT_MODEL) {
    console.log("VOICE PENDING: TTS/STT models missing.");
    failed = true;
  } else {
    for (const [language, input] of [["ko", "안녕하세요. 만나서 반갑습니다."], ["ja", "こんにちは。はじめまして。"], ["th", "สวัสดีค่ะ ยินดีที่ได้รู้จักค่ะ"]]) {
      const speech = await request("/audio/speech", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: env.LITELLM_TTS_MODEL, voice: env.LITELLM_TTS_VOICE, input, response_format: "mp3" }),
      });
      const audio = await speech.arrayBuffer();
      if (!speech.headers.get("content-type")?.startsWith("audio/") || audio.byteLength < 1000) throw new Error(`${language}: invalid speech audio`);
      const form = new FormData();
      form.set("model", env.LITELLM_STT_MODEL);
      form.set("language", language);
      form.set("file", new Blob([audio], { type: "audio/mpeg" }), "test.mp3");
      const transcript = await (await request("/audio/transcriptions", { method: "POST", body: form })).json();
      if (!transcript.text?.trim()) throw new Error(`${language}: empty transcription`);
      console.log(`VOICE ${language} OK: ${audio.byteLength} bytes; transcript=${JSON.stringify(transcript.text)}`);
    }
  }
  if (failed) process.exitCode = 2;
}

try {
  const command = process.argv[2];
  if (command === "setup") await setup();
  else if (command === "start") await start();
  else if (command === "check") await check();
  else throw new Error("Usage: litellm.mjs setup [--provider-env path] | start | check [--live]");
} catch (error) {
  // Never dump fetch/provider exception objects, headers, credentials or body.
  console.error(error instanceof Error && !error.cause ? error.message : "Connection failed. Check gateway status and private configuration.");
  process.exitCode = 1;
}

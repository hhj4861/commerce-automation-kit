import { createHash } from "node:crypto";
import { ConversationError } from "./conversation";
import { readLimitedBody } from "./conversation-http";

type Env = Record<string, string | undefined>;
export type ProviderConfig = {
  baseURL: string;
  apiKey: string;
  model: string;
  id: string;
};
function config(prefix: string, env: Env): ProviderConfig | null {
  const baseURL = env[`${prefix}_BASE_URL`],
    apiKey = env[`${prefix}_API_KEY`],
    model = env[`${prefix}_MODEL`];
  if (!baseURL || !apiKey || !model) return null;
  let url: URL;
  try {
    url = new URL(baseURL);
  } catch {
    throw new ConversationError(503, "학습 서버 주소 설정을 확인해 주세요.");
  }
  const local =
    env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    model.length > 200 ||
    /\s/.test(model)
  )
    throw new ConversationError(
      503,
      "학습 서버의 HTTPS 주소와 모델 설정을 확인해 주세요.",
    );
  return {
    baseURL: baseURL.replace(/\/$/, ""),
    apiKey,
    model,
    id: createHash("sha256").update(`${baseURL}|${model}`).digest("hex"),
  };
}
export function trainingConfig(env: Env = process.env) {
  return config("HANMADI_TRAINING", env);
}
export function embeddingConfig(env: Env = process.env) {
  return config("HANMADI_EMBEDDING", env);
}
export function trainingPolicy(env: Env = process.env) {
  const minimum = Number(env.HANMADI_TRAINING_MIN_EXAMPLES);
  return {
    enabled: env.HANMADI_TRAINING_ENABLED === "true",
    minimum: Number.isSafeInteger(minimum) && minimum > 0 ? minimum : null,
  };
}
export function trainedAlias(
  model: string,
  env: Env = process.env,
): string | null {
  try {
    const aliases = JSON.parse(env.HANMADI_TRAINED_MODELS || "{}");
    const alias = aliases[model];
    return typeof alias === "string" && /^[a-zA-Z0-9._:/-]{1,200}$/.test(alias)
      ? alias
      : null;
  } catch {
    throw new ConversationError(
      503,
      "운영 학습 모델 허용 목록을 확인해 주세요.",
    );
  }
}
export async function providerRequest(
  c: ProviderConfig,
  path: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  try {
    const r = await fetcher(c.baseURL + path, {
      ...init,
      headers: { Authorization: `Bearer ${c.apiKey}`, ...init.headers },
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body = JSON.parse(
      new TextDecoder().decode(await readLimitedBody(r, 8 * 1024 * 1024)),
    );
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error("invalid shape");
    return body;
  } catch {
    // Never propagate provider bodies, URLs, keys or training text.
    throw new ConversationError(
      502,
      "학습 제공자 응답을 확인하지 못했어요. 작업 상태를 조회하고 서버 설정을 확인해 주세요.",
    );
  }
}
export function remoteId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 1024 ||
    /[\s\x00-\x1f]/.test(value)
  )
    throw new ConversationError(
      502,
      "학습 제공자의 작업 번호를 확인하지 못했어요.",
    );
  return value;
}
export async function uploadTrainingFile(
  c: ProviderConfig,
  content: string,
  name: string,
) {
  const body = new FormData();
  body.set("purpose", "fine-tune");
  body.set("target_model_names", c.model);
  body.set("file", new Blob([content], { type: "application/jsonl" }), name);
  return remoteId(
    (await providerRequest(c, "/files", { method: "POST", body })).id,
  );
}
export async function embed(
  c: ProviderConfig,
  input: string[],
  fetcher: typeof fetch = fetch,
): Promise<number[][]> {
  if (!input.length || input.length > 120 || input.some((t) => t.length > 1000))
    throw new ConversationError(
      400,
      "검색 인덱스는 최대 120개 짧은 표현으로 만들어 주세요.",
    );
  const result = await providerRequest(
    c,
    "/embeddings",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: c.model, input, encoding_format: "float" }),
    },
    fetcher,
  );
  const data = result.data as { index: number; embedding: number[] }[];
  if (!Array.isArray(data) || data.length !== input.length)
    throw new ConversationError(502, "임베딩 응답 개수가 맞지 않아요.");
  const sorted = [...data].sort((a, b) => a.index - b.index);
  const dim = sorted[0]?.embedding?.length;
  if (
    !dim ||
    dim > 3072 ||
    sorted.some(
      (r, i) =>
        r.index !== i ||
        !Array.isArray(r.embedding) ||
        r.embedding.length !== dim ||
        r.embedding.some((v) => typeof v !== "number" || !Number.isFinite(v)) ||
        Math.hypot(...r.embedding) === 0,
    )
  )
    throw new ConversationError(502, "임베딩 벡터 형식을 확인하지 못했어요.");
  return sorted.map((r) => {
    const norm = Math.hypot(...r.embedding);
    return r.embedding.map((v) => Number((v / norm).toFixed(7)));
  });
}

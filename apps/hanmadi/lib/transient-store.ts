import { randomUUID } from "node:crypto";
import { ConversationError } from "./conversation";

export interface TransientStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  claim(key: string, token: string, ttlSeconds: number): Promise<boolean>;
  release(key: string, token: string): Promise<void>;
}
// Development/test only. Production uses expiring Redis keys, shared across instances.
export function memoryTransientStore(now = Date.now): TransientStore {
  const data = new Map<string, { value: string; expires: number }>();
  const get = async (key: string) => {
    for (const [k, v] of data) if (v.expires <= now()) data.delete(k);
    return data.get(key)?.value ?? null;
  };
  return {
    get,
    async set(key, value, ttl) {
      await get(key);
      data.set(key, { value, expires: now() + ttl * 1000 });
    },
    async claim(key, token, ttl) {
      // No await between the read and write: local claims must be atomic too.
      const old = data.get(key);
      if (old && old.expires > now()) return false;
      data.set(key, { value: token, expires: now() + ttl * 1000 });
      return true;
    },
    async release(key, token) {
      if (data.get(key)?.value === token) data.delete(key);
    },
  };
}
const local = memoryTransientStore();
export function transientStore(): TransientStore {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === "production")
      throw new ConversationError(503, "검색·분석 저장소 연결이 필요해요.");
    return local;
  }
  const prefix = "hanmadi:admin-transient:v1:";
  async function command(args: (string | number)[]) {
    const response = await fetch(url!.replace(/\/$/, ""), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok)
      throw new ConversationError(503, "분석 저장소 응답을 확인하지 못했어요.");
    const body = await response.json();
    if (body.error)
      throw new ConversationError(503, "분석 저장소 요청을 완료하지 못했어요.");
    return body.result;
  }
  return {
    async get(k) {
      return (await command(["GET", prefix + k])) as string | null;
    },
    async set(k, v, ttl) {
      await command(["SET", prefix + k, v, "EX", ttl]);
    },
    async claim(k, v, ttl) {
      return (await command(["SET", prefix + k, v, "EX", ttl, "NX"])) === "OK";
    },
    async release(k, v) {
      await command([
        "EVAL",
        "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",
        1,
        prefix + k,
        v,
      ]);
    },
  };
}
export async function claimSlot(
  store: TransientStore,
  namespace: string,
  slots: number,
  ttl = 150,
) {
  const token = randomUUID();
  for (let i = 0; i < slots; i++) {
    const key = `${namespace}:${i}`;
    if (await store.claim(key, token, ttl))
      return () => store.release(key, token);
  }
  return null;
}

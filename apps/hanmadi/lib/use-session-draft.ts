"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
const memory = new Map<string, string>();
const eventName = "hanmadi-session-draft";
function subscribe(callback: () => void) {
  window.addEventListener(eventName, callback);
  return () => window.removeEventListener(eventName, callback);
}
function read(key: string) {
  if (memory.has(key)) return memory.get(key)!;
  try { return sessionStorage.getItem(key); }
  catch { return memory.get(key) ?? null; }
}
function decode<T>(raw: string | null, initial: T, valid: (value: unknown) => value is T): T {
  try {
    const value = JSON.parse(raw ?? "null");
    if (value && typeof value.at === "number" && Date.now() - value.at < 86400000 && valid(value.data)) return value.data;
  } catch { /* Invalid drafts never block learning. */ }
  return initial;
}
/** Per actor/language/revision, tab-only, 24-hour drafts. Never used as server authority. */
export function useSessionDraft<T>(key: string, initial: T, valid: (value: unknown) => value is T) {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  const value = useMemo(() => decode(raw, initial, valid), [raw, initial, valid]);
  const [unavailable, setUnavailable] = useState(false);
  function set(next: T | ((previous: T) => T)) {
    const previous = decode(read(key), initial, valid);
    const data = typeof next === "function" ? (next as (v: T) => T)(previous) : next;
    const serialized = JSON.stringify({ at: Date.now(), data });
    try { sessionStorage.setItem(key, serialized); memory.delete(key); }
    catch { memory.set(key, serialized); setUnavailable(true); }
    window.dispatchEvent(new Event(eventName));
  }
  return [value, set, unavailable] as const;
}

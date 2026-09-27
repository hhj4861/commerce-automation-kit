import { isLanguage, type Language } from "./courses";

export const LEARNING_LANGUAGE_COOKIE = "hanmadi_language";
export function resolveLearningLanguage(requested: unknown, saved: unknown): Language | undefined {
  return isLanguage(requested) ? requested : isLanguage(saved) ? saved : undefined;
}
/** Only learning destinations may be carried through language selection. */
export function learningDestination(raw: unknown, language?: Language): string {
  const url = new URL("/learn", "https://hanmadi.invalid");
  if (typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\")) {
    try {
      const candidate = new URL(raw, url.origin);
      if (candidate.origin === url.origin && ["/learn", "/conversation"].includes(candidate.pathname)) {
        url.pathname = candidate.pathname;
        for (const key of ["s", "lesson"]) {
          const value = candidate.searchParams.get(key);
          if (value && /^[a-zA-Z0-9가-힣_-]{1,100}$/.test(value)) url.searchParams.set(key, value);
        }
      }
    } catch { /* Invalid destinations return to learning. */ }
  }
  if (language) url.searchParams.set("language", language);
  return url.pathname + url.search;
}
export function languageSelectionHref(from = "/learn"): string {
  return `/languages?${new URLSearchParams({ from: learningDestination(from) })}`;
}

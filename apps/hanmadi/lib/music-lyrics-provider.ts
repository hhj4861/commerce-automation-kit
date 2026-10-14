import { readLimitedBody } from "./conversation-http";
import { parseLicensedMusicLesson, type MusicLyricsResult } from "./music-lyrics";

// Only a trusted, server-configured licensed-catalog adapter may supply this feed.
// No arbitrary video/lyrics URLs, scraping, transcription or model-generated song reconstruction.
export async function loadMusicLyrics(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<MusicLyricsResult> {
  if (!env.HANMADI_MUSIC_CATALOG_URL) return { status: "unavailable", reason: "not-configured" };
  // Set only after the actual supplier contract and this song's learning-use rights are reviewed.
  if (env.HANMADI_MUSIC_LICENSE_APPROVED !== "true") return { status: "unavailable", reason: "rights-pending" };
  try {
    const url = new URL(env.HANMADI_MUSIC_CATALOG_URL);
    const localFixture = env.NODE_ENV === "development" && url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if ((!localFixture && url.protocol !== "https:") || url.username || url.password || url.hash || url.search)
      return { status: "unavailable", reason: "temporary" };
    const headers: Record<string, string> = { Accept: "application/json" };
    if (env.HANMADI_MUSIC_CATALOG_TOKEN) headers.Authorization = `Bearer ${env.HANMADI_MUSIC_CATALOG_TOKEN}`;
    const response = await fetcher(url, {
      headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
      return { status: "unavailable", reason: "temporary" };
    const raw = JSON.parse(new TextDecoder().decode(await readLimitedBody(response, 160000)));
    if (typeof raw?.expiresAt === "string" && Date.parse(raw.expiresAt) <= now)
      return { status: "unavailable", reason: "expired" };
    return { status: "ready", lesson: parseLicensedMusicLesson(raw, now) };
  } catch {
    // Never expose supplier URLs, credentials, raw lyrics or upstream error bodies in logs/responses.
    return { status: "unavailable", reason: "temporary" };
  }
}

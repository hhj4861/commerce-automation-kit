import { ConversationError } from "./conversation";
import { readLimitedBody } from "./conversation-http";
import { parseMusicSource } from "./owned-music";
import { titleText, type YoutubeVideo } from "./youtube-search";
export type MusicVideoDetails = YoutubeVideo & { captionsAvailable: boolean; seconds: number };
export type MusicCaptionTrack = { id: string; language: string; name: string; automatic: boolean };
type Env = Record<string, string | undefined>;
const API = "https://www.googleapis.com/youtube/v3/";
export function youtubeMusicId(value: unknown): string {
  if (typeof value === "string" && /^[\w-]{11}$/.test(value)) return value;
  if (typeof value === "string" && value.length <= 2048) {
    try {
      const url = new URL(value), parts = url.pathname.split("/").filter(Boolean);
      if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error();
      const id = url.hostname === "youtu.be" && parts.length === 1 ? parts[0] :
        ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(url.hostname) ?
          url.pathname === "/watch" ? url.searchParams.get("v") :
            parts.length === 2 && ["embed", "shorts", "live"].includes(parts[0]) ? parts[1] : null : null;
      if (id && /^[\w-]{11}$/.test(id)) return id;
    } catch { /* Reject URLs, never fetch the supplied address. */ }
  }
  throw new ConversationError(400, "YouTube 영상 주소 또는 11자리 영상 ID를 입력해 주세요.");
}
export function musicYoutubeConfiguration(env: Env = process.env) {
  return { search: !!env.YOUTUBE_API_KEY?.trim(), captions: ["YOUTUBE_CAPTIONS_CLIENT_ID", "YOUTUBE_CAPTIONS_CLIENT_SECRET", "YOUTUBE_CAPTIONS_REFRESH_TOKEN"].every(k => !!env[k]?.trim()) };
}
async function request(url: URL | string, init: RequestInit, fetcher: typeof fetch) {
  try { return await fetcher(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000) }); }
  catch { throw new ConversationError(502, "YouTube 연결이 지연됐어요. 수집함은 유지되니 다시 시도해 주세요."); }
}
async function json(response: Response): Promise<Record<string, unknown>> {
  try { const value = JSON.parse(new TextDecoder().decode(await readLimitedBody(response, 128000))); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value; }
  catch { throw new ConversationError(502, "YouTube 응답을 읽지 못했어요. 다시 시도해 주세요."); }
}
const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" ? v as Record<string, unknown> : {};
export async function youtubeMusicDetails(value: unknown, apiKey: string, fetcher: typeof fetch = fetch): Promise<MusicVideoDetails> {
  const id = youtubeMusicId(value);
  if (!apiKey.trim()) throw new ConversationError(503, "YouTube 검색 연결을 먼저 설정해 주세요.");
  const url = new URL(API + "videos"); url.search = new URLSearchParams({ key: apiKey, id, part: "snippet,contentDetails,status" }).toString();
  const response = await request(url, {}, fetcher);
  if (!response.ok) throw new ConversationError(502, "YouTube 영상 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
  const data = await json(response), items = data.items;
  if (!Array.isArray(items) || !items.length) throw new ConversationError(404, "영상을 찾을 수 없어요. 공개 영상 주소를 확인해 주세요.");
  const item = record(items[0]), snippet = record(item.snippet), status = record(item.status), content = record(item.contentDetails);
  if (item.id !== id || status.privacyStatus !== "public" || status.embeddable !== true)
    throw new ConversationError(422, "앱에서 재생 가능한 공개 영상을 선택해 주세요. 이 영상은 공개 또는 퍼가기 권한을 확인할 수 없어요.");
  if (snippet.liveBroadcastContent !== "none") throw new ConversationError(422, "라이브 중이거나 예정된 영상은 방송이 끝난 뒤 수집해 주세요.");
  const duration = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(content.duration));
  const seconds = duration ? Number(duration[1] || 0) * 3600 + Number(duration[2] || 0) * 60 + Number(duration[3] || 0) : 0;
  if (!seconds || seconds > 3600) throw new ConversationError(422, "길이를 확인할 수 있는 1시간 이내 영상을 선택해 주세요.");
  const thumbnails = record(snippet.thumbnails), thumbnail = record(thumbnails.medium ?? thumbnails.default).url;
  return { id, url: `https://www.youtube.com/watch?v=${id}`, title: titleText(snippet.title).slice(0, 100) || "제목 없는 영상",
    channel: titleText(snippet.channelTitle).slice(0, 100), thumbnail: typeof thumbnail === "string" && /^https:\/\/i\.ytimg\.com\//.test(thumbnail) ? thumbnail : null,
    seconds, captionsAvailable: content.caption === "true" };
}
async function accessToken(env: Env, fetcher: typeof fetch): Promise<string> {
  if (!musicYoutubeConfiguration(env).captions) throw new ConversationError(503, "자막 가져오기용 YouTube 채널 연결이 없어요. 영상 수정 권한이 있는 채널을 연결하거나 자막 파일을 등록해 주세요.");
  const response = await request("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: env.YOUTUBE_CAPTIONS_CLIENT_ID!, client_secret: env.YOUTUBE_CAPTIONS_CLIENT_SECRET!, refresh_token: env.YOUTUBE_CAPTIONS_REFRESH_TOKEN! }) }, fetcher);
  if (!response.ok) throw new ConversationError(503, "YouTube 채널 인증이 만료되었거나 연결 권한이 없어요. 관리자 설정에서 다시 연결해 주세요.");
  const data = await json(response);
  if (typeof data.access_token !== "string" || !data.access_token.trim()) throw new ConversationError(502, "YouTube 채널 인증 응답을 확인하지 못했어요.");
  return data.access_token;
}
async function captionFailure(response: Response): Promise<never> {
  const status = response.status;
  let reason = "";
  try { const data = await json(response); const errors = record(data.error).errors; if (Array.isArray(errors)) reason = String(record(errors[0]).reason ?? ""); } catch { /* Do not expose upstream bodies. */ }
  if (status === 429 || ["quotaExceeded", "dailyLimitExceeded", "userRateLimitExceeded", "rateLimitExceeded"].includes(reason))
    throw new ConversationError(429, "YouTube 자막 요청 한도에 도달했어요. 나중에 다시 시도하거나 자막 파일을 등록해 주세요.");
  if (status === 401 || status === 403) throw new ConversationError(403, "이 영상의 자막을 가져올 권한이 없어요. 연결 채널의 영상 수정 권한을 확인하거나 사용권 있는 자막 파일을 등록해 주세요.");
  if (status === 404) throw new ConversationError(404, "선택한 자막을 찾을 수 없어요. 자막 목록을 다시 확인해 주세요.");
  throw new ConversationError(502, "YouTube 자막을 받지 못했어요. 수집한 영상과 원문은 유지돼요.");
}
async function tracks(videoId: string, token: string, fetcher: typeof fetch): Promise<MusicCaptionTrack[]> {
  const url = new URL(API + "captions"); url.search = new URLSearchParams({ part: "snippet", videoId }).toString();
  const response = await request(url, { headers: { Authorization: `Bearer ${token}` } }, fetcher);
  if (!response.ok) await captionFailure(response);
  const data = await json(response);
  if (!Array.isArray(data.items)) throw new ConversationError(502, "자막 목록을 확인하지 못했어요.");
  return data.items.flatMap(value => {
    const item = record(value), s = record(item.snippet);
    if (typeof item.id !== "string" || item.id.length > 250 || !item.id || s.videoId !== videoId || s.status !== "serving" || s.isDraft === true || typeof s.language !== "string") return [];
    return [{ id: item.id, language: s.language, name: typeof s.name === "string" ? s.name.slice(0, 100) : "", automatic: s.trackKind === "ASR" }];
  });
}
export async function youtubeMusicCaptions(videoId: string, env: Env = process.env, fetcher: typeof fetch = fetch) {
  return tracks(youtubeMusicId(videoId), await accessToken(env, fetcher), fetcher);
}
export async function downloadMusicCaption(videoId: string, trackId: unknown, env: Env = process.env, fetcher: typeof fetch = fetch) {
  youtubeMusicId(videoId);
  if (typeof trackId !== "string" || !trackId || trackId.length > 250) throw new ConversationError(400, "가져올 자막을 선택해 주세요.");
  const token = await accessToken(env, fetcher);
  // Recheck membership server-side: never download an arbitrary caption ID sent by a client.
  const track = (await tracks(videoId, token, fetcher)).find(t => t.id === trackId);
  if (!track) throw new ConversationError(404, "이 영상에서 선택한 자막을 찾을 수 없어요. 목록을 다시 확인해 주세요.");
  const url = new URL(API + "captions/" + encodeURIComponent(track.id)); url.searchParams.set("tfmt", "vtt");
  const response = await request(url, { headers: { Authorization: `Bearer ${token}` } }, fetcher);
  if (!response.ok) await captionFailure(response);
  const source = new TextDecoder().decode(await readLimitedBody(response, 64000));
  parseMusicSource(source); // No truncation, fabricated timings, or automatic translation.
  return { source, track };
}

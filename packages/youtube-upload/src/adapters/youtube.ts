/**
 * YouTube Data API v3 어댑터 — OAuth(리프레시 토큰) + videos.insert + thumbnails.set.
 * 네트워크·파일 I/O를 하는 유일한 곳. 공식 googleapis 라이브러리만 사용.
 *
 * 인증: Desktop 앱 OAuth 클라이언트(client_secret.json) → 1회 브라우저 승인 →
 * 리프레시 토큰 저장 → 이후 자동 갱신(무인). (Google OOB 폐지 후에도 loopback 리다이렉트 방식 유효)
 */
import { google } from 'googleapis';
import { createReadStream, readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { VideoRequestBody } from '../core/video-resource.js';

export type OAuthClient = InstanceType<typeof google.auth.OAuth2>;

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  // commentThreads.insert 는 force-ssl 스코프를 요구한다(업로드·메타수정만으론 403).
  // 2026-07-28 이전에 발급된 토큰에는 이 스코프가 없으므로 comment 명령을 쓰려면 재인증 1회 필요.
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

interface OAuthCfg {
  client_id: string;
  client_secret: string;
  redirect_uris?: string[];
}
interface ClientSecretFile {
  installed?: OAuthCfg;
  web?: OAuthCfg;
}

/** client_secret.json 으로 OAuth2 클라이언트 생성. */
export function createOAuthClient(clientSecretPath: string): OAuthClient {
  let raw: ClientSecretFile;
  try {
    raw = JSON.parse(readFileSync(clientSecretPath, 'utf8')) as ClientSecretFile;
  } catch {
    throw new Error(`client_secret JSON 을 읽을 수 없음: ${clientSecretPath}`);
  }
  const cfg = raw.installed ?? raw.web;
  if (cfg === undefined) throw new Error("client_secret JSON 에 'installed'/'web' 설정이 없음");
  const redirect = cfg.redirect_uris?.[0] ?? 'http://localhost';
  return new google.auth.OAuth2(cfg.client_id, cfg.client_secret, redirect);
}

/** 저장된 토큰이 있으면 로드해 credentials 설정. 있으면 true. */
export function loadTokens(client: OAuthClient, tokenPath: string): boolean {
  if (!existsSync(tokenPath)) return false;
  const tokens = JSON.parse(readFileSync(tokenPath, 'utf8')) as Record<string, unknown>;
  client.setCredentials(tokens);
  return true;
}

/** 브라우저에서 열 인증 URL(offline + consent 로 리프레시 토큰 확보). */
export function authUrl(client: OAuthClient): string {
  return client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
}

/** 인증 코드 → 토큰 교환 후 저장. */
export async function exchangeCode(client: OAuthClient, code: string, tokenPath: string): Promise<void> {
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
}

/** 내 채널 목록(인증 검증용). */
export async function listChannels(client: OAuthClient): Promise<{ id: string; title: string }[]> {
  const youtube = google.youtube({ version: 'v3', auth: client });
  const res = await youtube.channels.list({ part: ['snippet'], mine: true });
  return (res.data.items ?? []).map((c) => ({ id: c.id ?? '', title: c.snippet?.title ?? '' }));
}

/** 영상 업로드 → videoId 반환. */
/**
 * 쇼츠 검색(공식 Data API search.list, 100유닛/호출) — 소재 리서치 관찰 창의 유튜브 그리드용.
 * 결과는 영상 ID·제목만 반환(임베드는 공식 iframe 플레이어) — 콘텐츠 다운로드 없음.
 */
export async function searchShorts(
  auth: OAuthClient | string, // OAuth 클라이언트 또는 API 키(검색은 키만으로 가능·만료 없음)
  query: string,
  maxResults = 9,
): Promise<{ id: string; title: string }[]> {
  const youtube = google.youtube({ version: 'v3', auth });
  const res = await youtube.search.list({
    part: ['snippet'],
    q: query,
    type: ['video'],
    videoDuration: 'short',
    regionCode: 'KR',
    relevanceLanguage: 'ko',
    order: 'relevance',
    maxResults,
  });
  return (res.data.items ?? [])
    .map((it) => ({ id: it.id?.videoId ?? '', title: it.snippet?.title ?? '' }))
    .filter((v) => v.id.length > 0);
}

export async function uploadVideo(
  client: OAuthClient,
  requestBody: VideoRequestBody,
  videoPath: string,
): Promise<string> {
  const youtube = google.youtube({ version: 'v3', auth: client });
  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody,
    media: { body: createReadStream(videoPath) },
  });
  const id = res.data.id;
  if (id === undefined || id === null || id.length === 0) throw new Error('업로드 응답에 videoId 가 없음');
  return id;
}

/** 기존 영상의 메타데이터(제목·설명·태그) 수정 — 재업로드 없이. snippet.categoryId 필수. */
export async function updateVideoMeta(
  client: OAuthClient,
  videoId: string,
  snippet: { title: string; description: string; categoryId: string; tags?: string[] },
): Promise<void> {
  const youtube = google.youtube({ version: 'v3', auth: client });
  await youtube.videos.update({ part: ['snippet'], requestBody: { id: videoId, snippet } });
}

/** 공개범위 변경(private/unlisted/public) — 재업로드 없이. */
export async function setPrivacy(client: OAuthClient, videoId: string, privacyStatus: string): Promise<void> {
  const youtube = google.youtube({ version: 'v3', auth: client });
  await youtube.videos.update({
    part: ['status'],
    requestBody: { id: videoId, status: { privacyStatus, selfDeclaredMadeForKids: false } },
  });
}

/** 최상위 댓글 작성 → commentId 반환. youtube.force-ssl 스코프 필요(구 토큰은 재인증). */
export async function insertComment(client: OAuthClient, videoId: string, text: string): Promise<string> {
  const youtube = google.youtube({ version: 'v3', auth: client });
  const res = await youtube.commentThreads.insert({
    part: ['snippet'],
    requestBody: { snippet: { videoId, topLevelComment: { snippet: { textOriginal: text } } } },
  });
  const id = res.data.id;
  if (id === undefined || id === null || id.length === 0) throw new Error('댓글 응답에 commentId 가 없음');
  return id;
}

/** 커스텀 썸네일 세팅. */
export async function setThumbnail(client: OAuthClient, videoId: string, thumbnailPath: string): Promise<void> {
  const youtube = google.youtube({ version: 'v3', auth: client });
  await youtube.thumbnails.set({ videoId, media: { body: createReadStream(thumbnailPath) } });
}

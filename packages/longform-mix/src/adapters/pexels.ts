/**
 * Pexels 무료 스톡 API 어댑터 — 사진·영상 검색 + 다운로드.
 * 라이선스: 상업 무료(저작자 표기 강제 아님, 권장). 헤더 Authorization: <API_KEY>.
 * 문서: https://www.pexels.com/api/documentation/
 * 공식 API만 사용(프로젝트 규칙) — 스크래핑 아님.
 */
import { writeFile } from 'node:fs/promises';

const BASE = 'https://api.pexels.com';

export type Orientation = 'landscape' | 'portrait' | 'square';

export interface SearchOpts {
  perPage?: number;
  orientation?: Orientation;
}

export interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  photographer: string;
  alt: string;
  /** 원본(최고화질) URL */
  original: string;
  credit: string;
}

interface RawPhoto {
  id: number;
  width: number;
  height: number;
  photographer: string;
  alt: string | null;
  src: { original: string };
}

/** 사진 검색(상업 무료). */
export async function searchPhotos(apiKey: string, query: string, opts: SearchOpts = {}): Promise<PexelsPhoto[]> {
  if (!apiKey) throw new Error('PEXELS_API_KEY 없음');
  const q = new URLSearchParams({ query, per_page: String(opts.perPage ?? 15) });
  if (opts.orientation !== undefined) q.set('orientation', opts.orientation);
  const res = await fetch(`${BASE}/v1/search?${q.toString()}`, { headers: { Authorization: apiKey } });
  if (!res.ok) throw new Error(`Pexels HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const body = (await res.json()) as { photos?: RawPhoto[] };
  return (body.photos ?? []).map((p) => ({
    id: p.id,
    width: p.width,
    height: p.height,
    photographer: p.photographer,
    alt: p.alt ?? '',
    original: p.src.original,
    credit: `Photo by ${p.photographer} on Pexels`,
  }));
}

export interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  durationSec: number;
  user: string;
  /** 다운로드 가능한 mp4 링크(1920 이하 최고화질) */
  file: string;
  credit: string;
}

interface RawVideoFile {
  link: string;
  file_type: string;
  width: number | null;
}
interface RawVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  user?: { name?: string };
  video_files?: RawVideoFile[];
}

/** 영상 검색(상업 무료). 1920 이하 최고화질 mp4 링크를 고른다. */
export async function searchVideos(apiKey: string, query: string, opts: SearchOpts = {}): Promise<PexelsVideo[]> {
  if (!apiKey) throw new Error('PEXELS_API_KEY 없음');
  const q = new URLSearchParams({ query, per_page: String(opts.perPage ?? 15) });
  if (opts.orientation !== undefined) q.set('orientation', opts.orientation);
  const res = await fetch(`${BASE}/videos/search?${q.toString()}`, { headers: { Authorization: apiKey } });
  if (!res.ok) throw new Error(`Pexels HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const body = (await res.json()) as { videos?: RawVideo[] };
  const out: PexelsVideo[] = [];
  for (const v of body.videos ?? []) {
    const mp4 = (v.video_files ?? []).filter((f) => f.file_type === 'video/mp4');
    mp4.sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
    const best = mp4.find((f) => (f.width ?? 0) <= 1920) ?? mp4[0];
    if (best === undefined) continue;
    out.push({
      id: v.id,
      width: v.width,
      height: v.height,
      durationSec: v.duration,
      user: v.user?.name ?? '',
      file: best.link,
      credit: `Video by ${v.user?.name ?? 'Pexels'} on Pexels`,
    });
  }
  return out;
}

/** URL → 로컬 파일 다운로드. 바이트 수 반환. */
export async function downloadTo(url: string, path: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`다운로드 실패 HTTP ${res.status}: ${url.slice(0, 80)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error('다운로드 결과가 비어있음');
  await writeFile(path, buf);
  return buf.length;
}

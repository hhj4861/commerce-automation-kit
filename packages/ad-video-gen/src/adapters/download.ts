/**
 * 생성 결과물 다운로드 어댑터 — global fetch 스트리밍 저장.
 * https 만 허용(생성 서비스 CDN 은 전부 https — 평문 URL 은 설정 오류로 간주).
 * 실패는 상태코드를 포함해 throw (원인 투명화).
 */
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';

export interface DownloadResult {
  path: string;
  bytes: number;
}

export async function downloadTo(url: string, outPath: string): Promise<DownloadResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`유효하지 않은 URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`https 만 허용 — 받은 프로토콜: ${parsed.protocol}`);
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`다운로드 실패 HTTP ${res.status} ${res.statusText} — ${url}`);
  }
  if (!res.body) {
    throw new Error(`응답 본문 없음 — ${url}`);
  }

  await mkdir(dirname(outPath), { recursive: true });
  let bytes = 0;
  const counter = Readable.fromWeb(res.body as WebReadableStream<Uint8Array>);
  counter.on('data', (chunk: Buffer) => (bytes += chunk.length));
  await pipeline(counter, createWriteStream(outPath));
  return { path: outPath, bytes };
}

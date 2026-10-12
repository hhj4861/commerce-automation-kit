import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DramaEpisode } from '@cak/contracts';
import { buildAssembleArgs, cuesFromEpisode, prependColdOpen, trimWindow, type AssembleLayout, type AssembleSpec, type TrimSpec } from '../core/assemble-args.js';
import { FfmpegError, hasAudio, probeDuration, runFfmpeg } from './ffmpeg.js';
import { assertUnprotectedOutput } from './episode-lock.js';

export interface AssembleEpisodeInput {
  episode: DramaEpisode;
  /** cutId → 클립 파일 */
  clipFiles: Record<string, string>;
  out: string;
  fontFile: string;
  workDir: string;
  /** 첫 2초 표기 문구. null 이면 넣지 않는다 */
  aiLabel: string | null;
  /** 쇼츠 상단 고정 제목. null/없음이면 넣지 않는다 */
  title?: string | null;
  kicker?: string | null;
  /** 맨 앞에 붙일 다른 컷의 한 토막(쇼츠 콜드 오픈) */
  /** cutId → 쓸 구간(앞뒤 잘라 쓰기) */
  trims?: Record<string, TrimSpec>;
  coldOpen?: { file: string; startSec: number; durationSec: number; caption?: string } | null;
  layout?: AssembleLayout;
  styles?: AssembleSpec['styles'];
  width?: number;
  height?: number;
  fps?: number;
}

export function assembleEpisode(input: AssembleEpisodeInput): { out: string; durationSec: number; cues: number } {
  if (input.episode.shotPolicy !== undefined) throw new FfmpegError('shot-v1 조립 차단: 실행·출시 승인 결합 경로 미구현');
  if (input.episode.continuesFromEpisode) throw new FfmpegError('회차 연결 조립 차단: 승인된 앞 회차 출시/프레임 결합 경로 미구현');
  assertUnprotectedOutput(input.workDir);
  assertUnprotectedOutput(input.out);
  // 직접 호출도 ffprobe/ffmpeg 실행·출력 생성 전에 검사한다.
  const fonts: [string, string][] = [['default', input.fontFile]];
  for (const role of ['title', 'kicker', 'subtitle', 'caption', 'label'] as const) {
    const font = input.styles?.[role]?.fontFile;
    if (font !== undefined) fonts.push([role, font]);
  }
  for (const [role, font] of fonts) {
    let isFile = false;
    try { isFile = statSync(font).isFile(); } catch { /* 누락·접근 불가도 아래 입력 오류로 보고 */ }
    if (!isFile) throw new FfmpegError(`폰트 파일 없음 또는 일반 파일 아님: ${role} — ${font}`);
  }
  const files = input.episode.cuts.map((c) => {
    const f = input.clipFiles[c.id];
    if (!f || !existsSync(f)) throw new FfmpegError(`클립 파일 없음: ${c.id}`);
    if (!hasAudio(f)) throw new FfmpegError(`오디오 트랙 없음: ${c.id}`);
    return f;
  });
  const windows = input.episode.cuts.map((c, i) => trimWindow(probeDuration(files[i]!), input.trims?.[c.id]));
  const durations = windows.map((w) => w.durationSec);
  const co = input.coldOpen ?? null;
  if (co && !existsSync(co.file)) throw new FfmpegError(`콜드 오픈 클립 없음: ${co.file}`);
  const baseCues = cuesFromEpisode(input.episode, durations);
  const cueTexts = co ? prependColdOpen(baseCues, co.durationSec, co.caption) : baseCues;
  // 모든 파생 출력부터 검사하여 일부 자막만 쓴 뒤 충돌하는 것도 막는다.
  const outputs = [
    ...cueTexts.map((_, i) => join(input.workDir, `cue-${i}.txt`)),
    ...(input.aiLabel ? [join(input.workDir, 'ai-label.txt')] : []),
    ...(input.title ? [join(input.workDir, 'title.txt')] : []),
    ...(input.kicker ? [join(input.workDir, 'kicker.txt')] : []),
  ];
  outputs.forEach(assertUnprotectedOutput);
  mkdirSync(input.workDir, { recursive: true });
  const cues = cueTexts.map((c, i) => {
    const textFile = join(input.workDir, `cue-${i}.txt`);
    writeFileSync(textFile, c.text);
    return { startSec: c.startSec, endSec: c.endSec, position: c.position, textFile, chars: [...c.text].length };
  });
  let aiLabelFile: string | null = null;
  if (input.aiLabel) {
    aiLabelFile = join(input.workDir, 'ai-label.txt');
    writeFileSync(aiLabelFile, input.aiLabel);
  }
  let titleFile: string | null = null;
  if (input.title) {
    titleFile = join(input.workDir, 'title.txt');
    writeFileSync(titleFile, input.title);
  }
  let kickerFile: string | null = null;
  if (input.kicker) {
    kickerFile = join(input.workDir, 'kicker.txt');
    writeFileSync(kickerFile, input.kicker);
  }
  mkdirSync(dirname(input.out), { recursive: true });
  runFfmpeg(buildAssembleArgs({
    clips: [
      ...(co ? [{ file: co.file, durationSec: co.durationSec, transitionIn: 'cut' as const, trimStartSec: co.startSec }] : []),
      ...input.episode.cuts.map((c, i) => ({
        file: files[i] ?? '',
        durationSec: durations[i] ?? c.durationSec,
        transitionIn: (co && i === 0 ? 'flash' : c.transitionIn ?? 'cut') as 'cut' | 'flash' | 'fade-black',
        ...(windows[i]?.startSec !== undefined ? { trimStartSec: windows[i]!.startSec! } : {}),
      })),
    ],
    cues,
    aiLabelFile,
    titleFile,
    kickerFile,
    ...(input.styles ? { styles: input.styles } : {}),
    layout: input.layout ?? 'fit',
    fontFile: input.fontFile,
    out: input.out,
    width: input.width ?? 1280,
    height: input.height ?? 720,
    fps: input.fps ?? 24,
  }));
  return { out: input.out, durationSec: probeDuration(input.out), cues: cues.length };
}

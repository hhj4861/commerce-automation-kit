import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DramaEpisode } from '@cak/contracts';
import { buildAssembleArgs, cuesFromEpisode, type AssembleLayout } from '../core/assemble-args.js';
import { FfmpegError, hasAudio, probeDuration, runFfmpeg } from './ffmpeg.js';

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
  layout?: AssembleLayout;
  width?: number;
  height?: number;
  fps?: number;
}

export function assembleEpisode(input: AssembleEpisodeInput): { out: string; durationSec: number; cues: number } {
  const files = input.episode.cuts.map((c) => {
    const f = input.clipFiles[c.id];
    if (!f || !existsSync(f)) throw new FfmpegError(`클립 파일 없음: ${c.id}`);
    if (!hasAudio(f)) throw new FfmpegError(`오디오 트랙 없음: ${c.id}`);
    return f;
  });
  const durations = files.map(probeDuration);
  mkdirSync(input.workDir, { recursive: true });
  const cues = cuesFromEpisode(input.episode, durations).map((c, i) => {
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
  mkdirSync(dirname(input.out), { recursive: true });
  runFfmpeg(buildAssembleArgs({
    clips: input.episode.cuts.map((c, i) => ({ file: files[i] ?? '', durationSec: durations[i] ?? c.durationSec, transitionIn: c.transitionIn ?? 'cut' })),
    cues,
    aiLabelFile,
    titleFile,
    layout: input.layout ?? 'fit',
    fontFile: input.fontFile,
    out: input.out,
    width: input.width ?? 1280,
    height: input.height ?? 720,
    fps: input.fps ?? 24,
  }));
  return { out: input.out, durationSec: probeDuration(input.out), cues: cues.length };
}

import type { DramaEpisode, DramaTransition } from '@cak/contracts';

export interface CueText {
  startSec: number;
  endSec: number;
  text: string;
  position: 'top' | 'bottom';
}

export interface AssembleCue {
  startSec: number;
  endSec: number;
  /** 자막 원문은 파일로 넘긴다(따옴표·쌍점이 섞인 한국어를 필터 문자열에 넣지 않기 위해) */
  textFile: string;
  position: 'top' | 'bottom';
}

export interface AssembleClip {
  file: string;
  durationSec: number;
  transitionIn: DramaTransition;
}

export interface AssembleSpec {
  clips: AssembleClip[];
  cues: AssembleCue[];
  aiLabelFile: string | null;
  fontFile: string;
  out: string;
  width: number;
  height: number;
  fps: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** 실제 클립 길이 기준으로 자막 시점을 잡는다. 컷 안의 대사는 고르게 나눈다. */
export function cuesFromEpisode(episode: DramaEpisode, durations: number[]): CueText[] {
  if (durations.length !== episode.cuts.length) throw new Error('클립 길이 수가 컷 수와 다름');
  const cues: CueText[] = [];
  let offset = 0;
  episode.cuts.forEach((cut, i) => {
    const d = durations[i] ?? cut.durationSec;
    if (cut.caption) cues.push({ startSec: r2(offset + 0.2), endSec: r2(offset + Math.min(3, d) - 0.1), text: cut.caption, position: 'top' });
    const slot = cut.lines.length ? d / cut.lines.length : 0;
    cut.lines.forEach((l, k) => cues.push({ startSec: r2(offset + k * slot + 0.2), endSec: r2(offset + (k + 1) * slot - 0.1), text: l.text, position: 'bottom' }));
    offset += d;
  });
  return cues;
}

export function escapeFilterValue(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:');
}

const FADE: Record<DramaTransition, string> = {
  cut: '',
  flash: ',fade=t=in:st=0:d=0.4:color=white',
  'fade-black': ',fade=t=in:st=0:d=0.5',
};

export function buildAssembleArgs(s: AssembleSpec): string[] {
  if (!s.clips.length) throw new Error('조립할 클립이 없음');
  const { width: W, height: H, fps } = s;
  const inputs: string[] = [];
  const parts: string[] = [];
  s.clips.forEach((c, i) => {
    inputs.push('-i', c.file);
    parts.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p${FADE[c.transitionIn]}[v${i}]`);
    parts.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]`);
  });
  parts.push(`${s.clips.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${s.clips.length}:v=1:a=1[vc][ac]`);
  const font = escapeFilterValue(s.fontFile);
  let label = 'vc';
  let k = 0;
  const draw = (textFile: string, size: number, x: string, y: string, enable: string) => {
    const next = `t${k++}`;
    parts.push(`[${label}]drawtext=fontfile='${font}':textfile='${escapeFilterValue(textFile)}':fontsize=${size}:fontcolor=white:borderw=3:bordercolor=black:x=${x}:y=${y}:enable='${enable}'[${next}]`);
    label = next;
  };
  for (const c of s.cues)
    draw(c.textFile, Math.round(H * 0.055), '(w-text_w)/2', c.position === 'top' ? `${Math.round(H * 0.12)}` : `h-text_h-${Math.round(H * 0.08)}`, `between(t,${c.startSec},${c.endSec})`);
  if (s.aiLabelFile) draw(s.aiLabelFile, Math.round(H * 0.035), 'w-text_w-24', '24', 'lt(t,2)');
  parts.push(`[${label}]null[vout]`);
  parts.push('[ac]loudnorm=I=-14:TP=-1.5:LRA=11[aout]');
  return ['-y', ...inputs, '-filter_complex', parts.join(';'), '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', s.out];
}

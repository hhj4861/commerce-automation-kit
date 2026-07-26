/**
 * 조립 ffmpeg 인자 테스트 — 순수 함수. concat·비주얼라이저·이미지루프·썸네일 토큰 고정.
 */
import { describe, it, expect } from 'vitest';
import {
  escapeDrawtext,
  concatListLine,
  buildConcatAudioArgs,
  buildVisualizerFilter,
  buildVisualizerArgs,
  buildImageAssembleArgs,
  buildThumbnailArgs,
  buildAestheticThumbnailArgs,
  buildVideoLoopArgs,
  letterspace,
  WAVE_COLORS,
  THUMB_FONT,
} from '../src/core/assembleargs.js';

describe('concatListLine / buildConcatAudioArgs', () => {
  it('경로의 작은따옴표 이스케이프', () => {
    expect(concatListLine("/x/a b.mp3")).toBe("file '/x/a b.mp3'");
    expect(concatListLine("/x/it's.mp3")).toBe("file '/x/it'\\''s.mp3'");
  });
  it('concat demuxer + aac 192k', () => {
    expect(buildConcatAudioArgs('list.txt', 'out.m4a').join(' ')).toBe(
      '-y -f concat -safe 0 -i list.txt -c:a aac -b:a 192k out.m4a',
    );
  });
});

describe('buildVisualizerFilter', () => {
  it('color 배경 + showwaves + 최종 [v] 라벨', () => {
    const f = buildVisualizerFilter();
    expect(f).toContain('color=c=0x0a0a16:s=1920x1080[bg]');
    expect(f).toContain(`[0:a]showwaves=s=1920x300:mode=cline:colors=${WAVE_COLORS}[wave]`);
    expect(f).toContain('[bg][wave]overlay=0:(H-h)/2[base]');
    expect(f.endsWith('[v]')).toBe(true);
  });
  it('타이틀/서브 있으면 drawtext 체인', () => {
    const f = buildVisualizerFilter({ title: 'GYM HYPE', subtitle: 'Phonk · Trap' });
    expect(f).toContain("text='GYM HYPE'");
    expect(f).toContain("text='Phonk · Trap'");
    expect(f).toContain('[title]');
    expect(f).toContain('[sub]');
    expect(f.endsWith('[v]')).toBe(true);
  });
  it('타이틀 없으면 base 를 바로 [v] 로', () => {
    const f = buildVisualizerFilter();
    expect(f).toContain('[base]null[v]');
  });
});

describe('buildVisualizerArgs', () => {
  it('입력=오디오, [v]+0:a 매핑, shortest, faststart', () => {
    const args = buildVisualizerArgs('mix.m4a', 'out.mp4', { title: 'T' });
    expect(args.slice(0, 3)).toEqual(['-y', '-i', 'mix.m4a']);
    const j = args.join(' ');
    expect(j).toContain('-filter_complex');
    expect(j).toContain('-map [v] -map 0:a');
    expect(j).toContain('-c:v libx264 -pix_fmt yuv420p -preset veryfast');
    expect(j).toContain('-shortest -movflags +faststart out.mp4');
  });
});

describe('buildImageAssembleArgs', () => {
  it('이미지 루프 + stillimage + shortest', () => {
    const args = buildImageAssembleArgs('bg.jpg', 'mix.m4a', 'out.mp4');
    const j = args.join(' ');
    expect(j).toContain('-loop 1 -framerate 12 -i bg.jpg -i mix.m4a');
    expect(j).toContain('scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080');
    expect(j).toContain('-c:v libx264 -tune stillimage');
    expect(j).toContain('-shortest');
  });
});

describe('buildThumbnailArgs', () => {
  it('1280x720 커버 + 스크림 + 굵은 2줄 외곽선 텍스트, 1프레임', () => {
    const args = buildThumbnailArgs('a.jpg', 'thumb.jpg', { title: '운동할 때 이거 틀면', subtitle: '미쳐버림' });
    const vf = args[args.indexOf('-vf') + 1]!;
    expect(vf).toContain('scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720');
    expect(vf).toContain('drawbox=x=0'); // 스크림
    expect(vf).toContain("text='운동할 때 이거 틀면'");
    expect(vf).toContain("text='미쳐버림'");
    expect(vf).toContain('borderw=8:bordercolor=black'); // 외곽선(스트로크)
    expect(vf).toContain('fontcolor=0xFFE24D'); // 2줄째 강조색
    expect(vf).toContain(`fontfile=${THUMB_FONT}`);
    expect(args).toContain('-frames:v');
  });
  it('외곽선/강조색 재정의', () => {
    const args = buildThumbnailArgs('a.jpg', 't.jpg', { title: 'X', outlineWidth: 12, accentColor: '0x00ff00' });
    const vf = args[args.indexOf('-vf') + 1]!;
    expect(vf).toContain('borderw=12:bordercolor=black');
  });
});

describe('escapeDrawtext', () => {
  it('특수문자 이스케이프', () => {
    const r = escapeDrawtext("50%: it's");
    expect(r).toContain('\\%');
    expect(r).toContain('\\:');
    expect(r).toContain("\\'");
  });
});

describe('letterspace', () => {
  it('글자 사이 공백 삽입', () => {
    expect(letterspace('GYM')).toBe('G Y M');
    expect(letterspace('AB CD')).toBe('A B   C D'); // 원 공백은 3칸으로
  });
});

describe('buildAestheticThumbnailArgs', () => {
  it('무드 비네트 + 스크림 + 【태그】 + letterspaced 타이틀/서브', () => {
    const args = buildAestheticThumbnailArgs('a.jpg', 't.jpg', {
      tag: 'PLAYLIST', title: letterspace('GYM HYPE'), subtitle: letterspace('WORKOUT MIX'),
    });
    const vf = args[args.indexOf('-vf') + 1]!;
    expect(vf).toContain('color=black@0.2'); // 비네트
    expect(vf).toContain("text='【 PLAYLIST 】'");
    expect(vf).toContain("text='G Y M   H Y P E'");
    expect(vf).toContain("text='W O R K O U T   M I X'");
    expect(args).toContain('-frames:v');
  });
  it('태그 없으면 태그 drawtext 생략', () => {
    const args = buildAestheticThumbnailArgs('a.jpg', 't.jpg', { title: 'X' });
    expect(args[args.indexOf('-vf') + 1]!).not.toContain('【');
  });
});

describe('buildVideoLoopArgs', () => {
  it('배경 영상 무한 루프 + map + shortest', () => {
    const args = buildVideoLoopArgs('bg.mp4', 'mix.m4a', 'out.mp4');
    const j = args.join(' ');
    expect(j).toContain('-stream_loop -1 -i bg.mp4 -i mix.m4a');
    expect(j).toContain('-map 0:v -map 1:a');
    expect(j).toContain('scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080');
    expect(j).toContain('-shortest -movflags +faststart out.mp4');
  });
});

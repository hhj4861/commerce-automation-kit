/**
 * 필러1 "하루 한 표현" 숏폼 생성기 (9:16, 무자본 — ffmpeg + 배포된 TTS 재사용)
 *
 * 발음은 배포된 hanmadi /api/tts(ElevenLabs Claire, 영구 캐시)에서 받아온다 —
 * 로컬 회사망이 ElevenLabs 직접 호출을 막아도 이 경로는 뚫려 있고, 캐시 덕에
 * 같은 문구는 크레딧을 다시 쓰지 않는다.
 *
 * 오디오 구성: 표현 3회 낭독 (보통 → 느리게 0.8x → 보통), 사이 무음.
 * 자막/텍스트: 훅(EN) → 한국어(초대형) → RR → 뜻(EN) → 반복 안내 + CTA.
 *
 * 사용:
 *   node scripts/phrase-short.mjs --ko "안녕하세요" --rr annyeonghaseyo --en "Hello" \
 *        [--hook "How Koreans actually say hello"] [--n 1] [--outdir ops/shorts/out]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values: v } = parseArgs({
  options: {
    ko: { type: "string" },
    rr: { type: "string" },
    en: { type: "string" },
    hook: { type: "string" },
    n: { type: "string" },
    outdir: { type: "string" },
  },
});
if (!v.ko || !v.rr || !v.en) {
  console.error('사용법: node scripts/phrase-short.mjs --ko "안녕하세요" --rr annyeonghaseyo --en "Hello"');
  process.exit(1);
}

const TTS_BASE = "https://hanmadi-lake.vercel.app/api/tts";
const KO_FONT = "/System/Library/Fonts/AppleSDGothicNeo.ttc";
const EN_FONT = "/System/Library/Fonts/Helvetica.ttc";
const BG = "0x14100d"; // 다크 브라운블랙 (브랜드 다크 페이퍼 톤)
const ACCENT = "0xff8a50"; // 탠저린 (다크 모드 액센트)

const outdir = v.outdir ?? "ops/shorts/out";
mkdirSync(outdir, { recursive: true });
const slug = v.rr.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase();
const mp3 = join(outdir, `${slug}.mp3`);
const wav = join(outdir, `${slug}-track.wav`);
const mp4 = join(outdir, `${slug}.mp4`);

// 1) 발음 mp3 (배포 TTS — 캐시 적중 시 무료)
const res = await fetch(`${TTS_BASE}?text=${encodeURIComponent(v.ko)}&v=3`);
if (!res.ok || !res.headers.get("content-type")?.includes("audio")) {
  console.error(`TTS 실패 (HTTP ${res.status}) — 배포 상태를 확인하세요`);
  process.exit(1);
}
writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));

// 2) 오디오 트랙: 리드인 0.9s → 보통 → 1.1s → 느리게(0.8x) → 1.1s → 보통 → 테일 1.4s
execFileSync("ffmpeg", [
  "-y", "-i", mp3,
  "-filter_complex",
  [
    "aevalsrc=0:d=0.9[lead]",
    "aevalsrc=0:d=1.1[g1]",
    "aevalsrc=0:d=1.1[g2]",
    "aevalsrc=0:d=1.4[tail]",
    "[0:a]atempo=0.8[slow]",
    "[lead][0:a][g1][slow][g2][0:a][tail]concat=n=7:v=0:a=1[a]",
  ].join(";"),
  "-map", "[a]", wav,
], { stdio: "pipe" });

const dur = parseFloat(
  execFileSync("ffprobe", ["-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", wav]).toString(),
);

// 3) 영상 합성 — 정적 타이포 카드 (자막은 캡션으로 충분, 화면은 표현에 집중)
const esc = (s) => s.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("'", "’");
const hook = v.hook ?? `How Koreans actually say “${v.en}”`;
const tag = v.n ? `KOREAN PHRASE OF THE DAY · #${v.n}` : "KOREAN PHRASE OF THE DAY";

const draw = [
  // 상단 라벨 (mono 느낌, 액센트)
  `drawtext=fontfile=${EN_FONT}:text='${esc(tag)}':fontcolor=${ACCENT}:fontsize=34:x=(w-text_w)/2:y=300:ft_load_flags=default`,
  // 훅 (EN)
  `drawtext=fontfile=${EN_FONT}:text='${esc(hook)}':fontcolor=white:fontsize=56:x=(w-text_w)/2:y=390`,
  // 한국어 초대형
  `drawtext=fontfile=${KO_FONT}:text='${esc(v.ko)}':fontcolor=white:fontsize=170:x=(w-text_w)/2:y=760`,
  // RR
  `drawtext=fontfile=${EN_FONT}:text='${esc(v.rr)}':fontcolor=0x9a8f88:fontsize=58:x=(w-text_w)/2:y=980`,
  // 뜻 (EN)
  `drawtext=fontfile=${EN_FONT}:text='${esc(`= ${v.en}`)}':fontcolor=${ACCENT}:fontsize=64:x=(w-text_w)/2:y=1090`,
  // 반복 안내
  `drawtext=fontfile=${EN_FONT}:text='Listen ${esc("×")}3 — normal · slow · normal':fontcolor=0x9a8f88:fontsize=40:x=(w-text_w)/2:y=1330`,
  // CTA
  // 화살표(→)는 Helvetica에 글리프가 없어 tofu로 깨진다 — 대시 사용
  `drawtext=fontfile=${EN_FONT}:text='Free 5-min Korean lesson — link in bio':fontcolor=white:fontsize=42:x=(w-text_w)/2:y=1560`,
].join(",");

execFileSync("ffmpeg", [
  "-y",
  "-f", "lavfi", "-i", `color=c=${BG}:s=1080x1920:d=${dur.toFixed(2)}`,
  "-i", wav,
  "-vf", draw,
  "-map", "0:v", "-map", "1:a",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
  "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
  mp4,
], { stdio: "pipe" });

// 4) 캡션 + 해시태그 (퍼널 가이드 §7 — 영어 우선, 해외 노출용 영어 태그만)
const caption = `${hook} \u{1F1F0}\u{1F1F7}

${v.ko} (${v.rr}) = ${v.en}

Save this & repeat 3 times out loud!
Free 5-min interactive lesson → link in bio

#LearnKorean #KoreanPhrases #KoreanTutor #Hangul #KoreanLanguage #KoreanForBeginners #StudyKorean`;
writeFileSync(join(outdir, `${slug}-caption.txt`), caption);

console.log(JSON.stringify({ video: mp4, durationSec: Math.round(dur * 10) / 10, caption: `${slug}-caption.txt` }, null, 2));

/**
 * 발음 듣기 공용 모듈 — 앱의 모든 🔊이 이 speak() 하나를 쓴다 (음성 통일).
 * 이벤트 핸들러에서만 호출한다 (렌더 중 호출 금지). 미지원은 조용히 무시.
 *
 * /api/tts(ElevenLabs mp3, 한국어 원어민 음성)를 우선 재생하고, 실패하면
 * (오프라인·상한 초과·미설정) 브라우저 Web Speech로 폴백한다. mp3는 탭 수명
 * 동안 프라미스째 캐시한다 — 같은 문구의 중복 요청이 겹쳐도 fetch는 한 번만
 * 나간다.
 *
 * 첫 재생 지연(생성 1~2초)이 거슬리는 곳은 prefetchSpeak()으로 미리 받아둔다
 * (자모 조합기처럼 "탭 → 즉시 소리"가 기대되는 인터랙션).
 */

const mp3Cache = new Map<string, Promise<string | null>>();
let currentAudio: HTMLAudioElement | null = null;

/** 발음 생성 방식이 바뀌면 올린다 — 브라우저/CDN에 캐시된 옛 mp3를 무효화 */
const TTS_VERSION = 3;

function loadMp3(text: string): Promise<string | null> {
  let pending = mp3Cache.get(text);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch(
          `/api/tts?text=${encodeURIComponent(text)}&v=${TTS_VERSION}`,
        );
        if (!res.ok || !res.headers.get("content-type")?.includes("audio")) {
          return null;
        }
        return URL.createObjectURL(await res.blob());
      } catch {
        return null;
      }
    })();
    mp3Cache.set(text, pending);
  }
  return pending;
}

/** 곧 재생될 문구의 mp3를 미리 받아둔다 — 재생은 하지 않는다 */
export function prefetchSpeak(text: string): void {
  void loadMp3(text);
}

export function speak(text: string): void {
  void speakViaApi(text);
}

async function speakViaApi(text: string): Promise<void> {
  try {
    currentAudio?.pause();
    window.speechSynthesis?.cancel();

    const url = await loadMp3(text);
    if (!url) return speakWithBrowserVoice(text);

    currentAudio = new Audio(url);
    await currentAudio.play();
  } catch {
    // 자동재생 차단·네트워크 오류 등 — 브라우저 음성으로라도 들려준다
    speakWithBrowserVoice(text);
  }
}

/* ─────────────────── 폴백: 브라우저 Web Speech ───────────────────
 * 두 가지 고질 문제를 함께 처리한다. 이 처리가 없으면 "어떤 건 소리가 나고
 * 어떤 건 안 나는" 간헐 증상이 생긴다:
 *  1) 음성 목록이 비동기로 늦게 로드됨 → 첫 재생이 조용히 실패한다.
 *  2) Chrome은 cancel() 직후의 speak()를 간헐적으로 무시한다.
 */

let koVoice: SpeechSynthesisVoice | null = null;
let voicesPrimed = false;

/**
 * 가장 자연스러운 한국어 음성을 고른다.
 * 브라우저/OS에는 품질 낮은 캐릭터 음성(macOS의 Eddy·Grandma 등)과 좋은 음성
 * (Google 한국어, Yuna, Enhanced/Premium)이 섞여 있다. 그냥 첫 한국어 음성을
 * 잡으면 나쁜 게 걸릴 수 있어, 품질 좋은 순서로 점수를 매겨 고른다.
 */
function pickKoVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const ko = voices.filter((v) => v.lang?.toLowerCase().startsWith("ko"));
  if (ko.length === 0) return null;

  // macOS의 저품질 노벨티(캐릭터) 음성 이름 — 피한다
  const NOVELTY =
    /eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|bells|boing|bubbles|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|albert|bahh|bad news|good news/i;

  const score = (v: SpeechSynthesisVoice): number => {
    const n = v.name.toLowerCase();
    let s = 0;
    if (/google/.test(n)) s += 6; // Chrome 클라우드 음성 — 대체로 최고 품질
    if (/yuna/.test(n)) s += 5; // macOS 표준 한국어 음성
    if (/(enhanced|premium|neural|natural)/.test(n)) s += 4;
    if (/(siri|nara|sora)/.test(n)) s += 3;
    if (v.lang?.toLowerCase().replace("_", "-") === "ko-kr") s += 1;
    if (NOVELTY.test(n)) s -= 10; // 캐릭터 음성 강한 감점
    if (!v.localService) s += 1; // 원격(클라우드) 음성이 대체로 더 자연스러움
    return s;
  };

  return [...ko].sort((a, b) => score(b) - score(a))[0] ?? null;
}

function primeVoices(): void {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const pick = () => {
      const voices = synth.getVoices();
      if (!voices.length) return;
      koVoice = pickKoVoice(voices);
      voicesPrimed = true;
    };
    pick();
    // 아직 안 실렸으면 로드 완료 이벤트에서 다시 고른다
    if (!voicesPrimed && "addEventListener" in synth) {
      synth.addEventListener("voiceschanged", pick, { once: true });
    }
  } catch {
    /* 무시 */
  }
}

function speakWithBrowserVoice(text: string): void {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (!voicesPrimed) primeVoices();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "ko-KR";
    if (koVoice) utter.voice = koVoice;
    utter.rate = 0.85;

    const wasBusy = synth.speaking || synth.pending;
    synth.cancel();
    if (wasBusy) {
      // cancel 직후 speak가 Chrome에서 드롭되는 것을 피해 한 틱 미룬다
      setTimeout(() => {
        try {
          synth.speak(utter);
        } catch {
          /* 무시 */
        }
      }, 70);
    } else {
      synth.speak(utter);
    }
  } catch {
    /* 무시 — 발음 재생은 있으면 좋은 보조 기능일 뿐이다 */
  }
}

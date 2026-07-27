/**
 * 한글 → 로마자(국립국어원 로마자 표기법, Revised Romanization) 변환기.
 *
 * 한글 음절을 초성/중성/종성으로 분해하고, 음절 경계에서 발음 규칙
 * (연음·비음화·유음화·격음화·구개음화·ㅎ탈락·겹받침 단순화)을 적용한 뒤
 * 로마자로 매핑한다. 한글이 아닌 문자(공백·문장부호 등)는 그대로 통과한다.
 *
 * 외부 API·의존 없이 순수 함수로 동작한다(클라이언트·서버 공용).
 * 경음화(된소리되기)는 RR 표준에 따라 표기에 반영하지 않는다. (학교→hakgyo)
 *
 * ── 검증용 예시 (romanize(입력) === 기대값) ────────────────────────────
 *  안녕하세요   → annyeonghaseyo   (기본)
 *  한국어       → hangugeo         (연음)
 *  먹어요       → meogeoyo         (연음)
 *  좋아요       → joayo            (ㅎ탈락 + 연음)
 *  국물         → gungmul          (비음화 ㄱ→ㅇ)
 *  막내         → mangnae          (비음화 ㄱ→ㅇ)
 *  백마         → baengma          (비음화 ㄱ→ㅇ)
 *  감사합니다   → gamsahamnida     (비음화 ㅂ→ㅁ)
 *  신라         → silla            (유음화 ㄴ+ㄹ→ll)
 *  종로         → jongno           (ㄹ의 비음화, 유음화 아님)
 *  놓다         → nota             (격음화 ㅎ+ㄷ→ㅌ)
 *  좋고         → joko             (격음화 ㅎ+ㄱ→ㅋ)
 *  좋다         → jota             (격음화 ㅎ+ㄷ→ㅌ)
 *  같이         → gachi            (구개음화 ㅌ+이→치)
 *  굳이         → guji             (구개음화 ㄷ+이→지)
 *  넣어         → neoeo            (ㅎ탈락)
 *  값           → gap              (겹받침 ㅄ→ㅂ)
 *  읽어요       → ilgeoyo          (겹받침 연음 ㄺ: ㄹ잔류 + ㄱ연음)
 *  앉아         → anja             (겹받침 연음 ㄵ: ㄴ잔류 + ㅈ연음)
 *  학교         → hakgyo           (경음화 미반영)
 * ──────────────────────────────────────────────────────────────────────
 */

// 초성 19자
const CHO = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

// 중성 21자
const JUNG = [
  "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
  "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
];

// 종성 28자 (index 0 = 받침 없음)
const JONG = [
  "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ",
  "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

// 초성 로마자 (ㅇ = 무음)
const ONSET_ROMAN: Record<string, string> = {
  "ㄱ": "g", "ㄲ": "kk", "ㄴ": "n", "ㄷ": "d", "ㄸ": "tt", "ㄹ": "r",
  "ㅁ": "m", "ㅂ": "b", "ㅃ": "pp", "ㅅ": "s", "ㅆ": "ss", "ㅇ": "",
  "ㅈ": "j", "ㅉ": "jj", "ㅊ": "ch", "ㅋ": "k", "ㅌ": "t", "ㅍ": "p", "ㅎ": "h",
};

// 중성 로마자
const VOWEL_ROMAN: Record<string, string> = {
  "ㅏ": "a", "ㅐ": "ae", "ㅑ": "ya", "ㅒ": "yae", "ㅓ": "eo", "ㅔ": "e",
  "ㅕ": "yeo", "ㅖ": "ye", "ㅗ": "o", "ㅘ": "wa", "ㅙ": "wae", "ㅚ": "oe",
  "ㅛ": "yo", "ㅜ": "u", "ㅝ": "wo", "ㅞ": "we", "ㅟ": "wi", "ㅠ": "yu",
  "ㅡ": "eu", "ㅢ": "ui", "ㅣ": "i",
};

// 종성 대표음(ㄱㄴㄷㄹㅁㅂㅇ) 로마자
const CODA_ROMAN: Record<string, string> = {
  "ㄱ": "k", "ㄴ": "n", "ㄷ": "t", "ㄹ": "l", "ㅁ": "m", "ㅂ": "p", "ㅇ": "ng",
};

// 받침 대표음(7종성): 규칙 적용·종성 로마자화의 기준
const REP: Record<string, string> = {
  "ㄱ": "ㄱ", "ㄲ": "ㄱ", "ㄳ": "ㄱ", "ㄺ": "ㄱ", "ㅋ": "ㄱ",
  "ㄴ": "ㄴ", "ㄵ": "ㄴ", "ㄶ": "ㄴ",
  "ㄷ": "ㄷ", "ㅅ": "ㄷ", "ㅆ": "ㄷ", "ㅈ": "ㄷ", "ㅊ": "ㄷ", "ㅌ": "ㄷ", "ㅎ": "ㄷ",
  "ㄹ": "ㄹ", "ㄼ": "ㄹ", "ㄽ": "ㄹ", "ㄾ": "ㄹ", "ㅀ": "ㄹ",
  "ㅁ": "ㅁ", "ㄻ": "ㅁ",
  "ㅂ": "ㅂ", "ㅍ": "ㅂ", "ㄿ": "ㅂ", "ㅄ": "ㅂ",
  "ㅇ": "ㅇ",
};

// 겹받침 분해: [앞자음, 뒷자음]. 연음 시 앞은 잔류, 뒤는 다음 초성으로 이동.
const COMPOUND: Record<string, [string, string]> = {
  "ㄳ": ["ㄱ", "ㅅ"], "ㄵ": ["ㄴ", "ㅈ"], "ㄶ": ["ㄴ", "ㅎ"],
  "ㄺ": ["ㄹ", "ㄱ"], "ㄻ": ["ㄹ", "ㅁ"], "ㄼ": ["ㄹ", "ㅂ"],
  "ㄽ": ["ㄹ", "ㅅ"], "ㄾ": ["ㄹ", "ㅌ"], "ㄿ": ["ㄹ", "ㅍ"],
  "ㅀ": ["ㄹ", "ㅎ"], "ㅄ": ["ㅂ", "ㅅ"],
};

// 비음화: 대표음 → 비음
const NASAL: Record<string, string> = {
  "ㄱ": "ㅇ", "ㄷ": "ㄴ", "ㅂ": "ㅁ", "ㄴ": "ㄴ", "ㅁ": "ㅁ", "ㅇ": "ㅇ", "ㄹ": "ㄹ",
};

// 격음화: 받침 ㅎ + 뒤 예사소리 초성 → 거센소리
const ASP_ONSET: Record<string, string> = {
  "ㄱ": "ㅋ", "ㄷ": "ㅌ", "ㅂ": "ㅍ", "ㅈ": "ㅊ",
};

// 격음화: 뒤 초성 ㅎ + 받침(마지막 자음) → 거센소리 (없으면 ㅎ 유지)
const ASP_H: Record<string, string> = {
  "ㄱ": "ㅋ", "ㄲ": "ㅋ", "ㅋ": "ㅋ",
  "ㄷ": "ㅌ", "ㅅ": "ㅌ", "ㅆ": "ㅌ", "ㅌ": "ㅌ",
  "ㅈ": "ㅊ", "ㅊ": "ㅊ",
  "ㅂ": "ㅍ", "ㅍ": "ㅍ",
};

type Token =
  | { type: "syl"; cho: string; jung: string; jong: string }
  | { type: "other"; ch: string };

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  for (const ch of input) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && cp >= HANGUL_BASE && cp <= HANGUL_LAST) {
      const s = cp - HANGUL_BASE;
      tokens.push({
        type: "syl",
        cho: CHO[Math.floor(s / 588)],
        jung: JUNG[Math.floor((s % 588) / 28)],
        jong: JONG[s % 28],
      });
    } else {
      tokens.push({ type: "other", ch });
    }
  }
  return tokens;
}

/**
 * 인접한 두 음절의 경계에 발음 규칙을 적용한다.
 * cur의 종성(jong)과 next의 초성(cho)/중성(jung)을 직접 수정한다.
 */
function applyBoundary(
  cur: { cho: string; jung: string; jong: string },
  next: { cho: string; jung: string; jong: string },
): void {
  const coda = cur.jong;
  if (coda === "") return;

  const onset = next.cho;
  const compound = COMPOUND[coda];
  const isCompound = compound !== undefined;
  const first = isCompound ? compound[0] : coda;
  const last = isCompound ? compound[1] : coda;

  // ── 연음 / ㅎ탈락 / 구개음화 (뒤 음절이 모음으로 시작, 초성 ㅇ) ──
  if (onset === "ㅇ") {
    if (coda === "ㅇ") return; // ㅇ 받침은 유지(ng), 초성 무음 유지
    if (!isCompound) {
      if (coda === "ㅎ") {
        cur.jong = ""; // ㅎ 탈락
        return;
      }
      if (coda === "ㄷ" && next.jung === "ㅣ") {
        next.cho = "ㅈ"; // 구개음화 ㄷ+이 → 지
        cur.jong = "";
        return;
      }
      if (coda === "ㅌ" && next.jung === "ㅣ") {
        next.cho = "ㅊ"; // 구개음화 ㅌ+이 → 치
        cur.jong = "";
        return;
      }
      next.cho = coda; // 단순 연음
      cur.jong = "";
      return;
    }
    // 겹받침 연음
    if (last === "ㅎ") {
      // ㄶ, ㅀ: ㅎ 탈락 + 앞자음 연음 (많아→마나, 싫어→시러)
      next.cho = first;
      cur.jong = "";
      return;
    }
    cur.jong = first; // 앞자음 잔류
    next.cho = last; // 뒷자음 연음
    return;
  }

  // ── 격음화: 받침 ㅎ + 뒤 예사소리 초성 ──
  if (last === "ㅎ") {
    if (onset === "ㄱ" || onset === "ㄷ" || onset === "ㅂ" || onset === "ㅈ") {
      next.cho = ASP_ONSET[onset];
      cur.jong = isCompound ? first : "";
      return;
    }
    if (onset === "ㅅ") {
      next.cho = "ㅆ"; // ㅎ+ㅅ → ㅆ (좋습니다→조씀니다)
      cur.jong = isCompound ? first : "";
      return;
    }
    // 그 외(ㄴ/ㅁ 등)는 아래 비음화로 처리 (ㅎ→대표음 ㄷ)
  }

  // ── 격음화: 뒤 초성 ㅎ + 받침 ──
  if (onset === "ㅎ") {
    const asp = ASP_H[last];
    if (asp !== undefined) {
      next.cho = asp;
      cur.jong = isCompound ? first : "";
      return;
    }
    // 울림소리 받침(ㄴㄹㅁㅇ) + ㅎ → ㅎ 유지 (전화→jeonhwa)
  }

  // ── 비음화 / 유음화 ──
  const cr = REP[coda];
  if (onset === "ㄹ") {
    if (cr === "ㄴ" || cr === "ㄹ") {
      cur.jong = "ㄹ"; // 유음화 (신라→silla, 물론→mullon)
      next.cho = "ㄹ";
      return;
    }
    next.cho = "ㄴ"; // ㄹ의 비음화 (종로→jongno, 백로→baengno)
    cur.jong = NASAL[cr];
    return;
  }
  if (onset === "ㄴ") {
    if (cr === "ㄹ") {
      cur.jong = "ㄹ"; // 유음화 (설날→seollal)
      next.cho = "ㄹ";
      return;
    }
    if (cr === "ㄱ" || cr === "ㄷ" || cr === "ㅂ") {
      cur.jong = NASAL[cr]; // 비음화 (막내→mangnae)
      return;
    }
    cur.jong = cr;
    return;
  }
  if (onset === "ㅁ") {
    if (cr === "ㄱ" || cr === "ㄷ" || cr === "ㅂ") {
      cur.jong = NASAL[cr]; // 비음화 (국물→gungmul, 감사합니다→...hamnida)
      return;
    }
    cur.jong = cr;
    return;
  }

  // 그 외 초성: 받침은 대표음으로 축약, 초성 변화 없음 (경음화 미반영)
  cur.jong = cr;
}

/**
 * 한글 문자열을 국립국어원 로마자 표기법(Revised Romanization)으로 변환한다.
 * 한글이 아닌 문자는 그대로 보존한다.
 */
export function romanize(hangul: string): string {
  const tokens = tokenize(hangul);

  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (a.type === "syl" && b.type === "syl") {
      applyBoundary(a, b);
    }
  }

  let out = "";
  let prevCoda = ""; // 직전 인접 음절의 종성 대표음 (ㄹㄹ→ll 판정용)
  for (const t of tokens) {
    if (t.type !== "syl") {
      out += t.ch;
      prevCoda = "";
      continue;
    }
    // 초성: ㄹ은 앞 받침이 ㄹ이면 l, 아니면 r
    const onsetR =
      t.cho === "ㄹ" ? (prevCoda === "ㄹ" ? "l" : "r") : ONSET_ROMAN[t.cho];
    const vowelR = VOWEL_ROMAN[t.jung];
    const codaRep = t.jong === "" ? "" : REP[t.jong];
    const codaR = codaRep === "" ? "" : CODA_ROMAN[codaRep];
    out += onsetR + vowelR + codaR;
    prevCoda = codaRep;
  }
  return out;
}

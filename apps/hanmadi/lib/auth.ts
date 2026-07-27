/**
 * 튜터 인증 공통 로직 — 미들웨어와 API 라우트가 함께 쓴다.
 * 파일시스템을 쓰지 않으므로 어느 런타임에서도 안전하다 (저장소는 lib/store.ts).
 *
 * 두 종류의 튜터
 * 1) 소유자(owner) — 환경변수 TUTOR_PINS에 "이름:PIN"으로 등록. 다른 튜터를 초대할 수 있다.
 *    예) TUTOR_PINS=지현:072424
 * 2) 초대 튜터 — 소유자가 보낸 초대 메일의 링크로 직접 PIN을 등록한다 (lib/store.ts에 저장).
 *
 * 세션: HMAC 서명 쿠키. AUTH_SECRET을 바꾸면 전원 로그아웃된다.
 *
 * 폐기(revocation): 쿠키는 무상태 서명이라 그 자체로는 취소할 수 없다.
 * 대신 세션에 튜터의 **불변 id(tid)** 를 담고, 매 요청마다(lib/students.ts의
 * getTutorSession) 그 튜터가 저장소에 아직 존재하는지 확인해 삭제된 튜터의
 * 쿠키를 무효화한다. 소유자(owner)는 환경변수 기반이라 예외다.
 */

export const TUTOR_COOKIE = "hanmadi_tutor";
export const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60일

export type Role = "owner" | "tutor";

export type Session = {
  /** 튜터 표시이름 (화면 표기용 — 접근 판정에는 쓰지 않는다) */
  n: string;
  /**
   * 튜터의 불변 식별자 — 테넌시·폐기 판정의 기준.
   * 초대 튜터는 등록 시 발급한 UUID, 소유자는 "owner:<이름>".
   * 이 필드가 없는 옛 쿠키는 재로그인이 필요하다 (초대 튜터는 무효 처리).
   */
  tid?: string;
  /** 이메일 (소유자는 없을 수 있음) */
  e?: string;
  r: Role;
  /** 발급 시각 (ms) */
  t: number;
};

export type EnvTutor = { name: string; pin: string };

/** 학생에게 열려 있는 경로 — 여기 해당하지 않으면 전부 튜터 인증 필요 */
export function isOpenPath(pathname: string): boolean {
  return (
    pathname === "/library" ||
    pathname.startsWith("/library/") ||
    pathname.startsWith("/s/") ||
    pathname === "/login" ||
    pathname === "/register" ||
    // 체험수업 — 학생에게 링크로 공유하는 셀프 데모 (틱톡/숏폼 착지점).
    // 민감 데이터가 없는 고정 콘텐츠라 로그인 없이 열려 있다. 튜터도 같은 URL을 쓴다.
    pathname === "/trial" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/register") ||
    // 퍼즐 진행 동기화 — 학생 포털이 로그인 없이 호출한다.
    // 라우트가 slug를 검증하고 저장하는 값도 "어떤 퍼즐을 언제 풀었는가"뿐이라
    // 비공개 slug를 아는 사람만 접근한다는 포털 설계와 동일한 수준이다.
    pathname.startsWith("/api/progress") ||
    // 레벨 진단 — 학생이 공개 링크로 스스로 응시한다.
    // 저장하는 값(레벨 제안)은 민감하지 않고 level을 자동 변경하지 않는다.
    pathname === "/level-test" ||
    pathname.startsWith("/api/placement") ||
    // 발음 듣기 — /trial·학생 포털이 로그인 없이 호출한다.
    // 라우트가 길이·한글·일일 생성 상한으로 남용을 막고, 캐시 적중은 무료다.
    pathname.startsWith("/api/tts")
  );
}

/** 환경변수에서 소유자 목록 파싱 */
export function parseEnvTutors(
  env: Record<string, string | undefined>,
): EnvTutor[] {
  const tutors = (env.TUTOR_PINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const sep = entry.indexOf(":");
      if (sep <= 0) return null;
      const name = entry.slice(0, sep).trim();
      const pin = entry.slice(sep + 1).trim();
      return name && pin ? { name, pin } : null;
    })
    .filter((t): t is EnvTutor => t !== null);

  if (tutors.length === 0 && env.TUTOR_PIN) {
    tutors.push({ name: "튜터", pin: env.TUTOR_PIN });
  }
  return tutors;
}

export function findEnvTutorByPin(
  pin: string,
  tutors: EnvTutor[],
): EnvTutor | null {
  if (!pin) return null;
  return tutors.find((t) => t.pin === pin) ?? null;
}

/**
 * 서명 키 — AUTH_SECRET을 권장한다.
 * 없으면 TUTOR_PINS에서 유도해 설정 없이도 동작하게 한다
 * (이 경우 소유자 PIN을 바꾸면 전원 재로그인이 필요하다).
 */
export function getAuthSecret(env: Record<string, string | undefined>): string {
  return env.AUTH_SECRET || `derived:${env.TUTOR_PINS ?? env.TUTOR_PIN ?? ""}`;
}

/* ─────────────────────────── 세션 서명/검증 ─────────────────────────── */

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return b64urlEncode(new Uint8Array(sig));
}

/** 쿠키 값 생성: base64url(JSON).서명 */
export async function signSession(
  session: Session,
  secret: string,
): Promise<string> {
  const payload = b64urlEncode(
    new TextEncoder().encode(JSON.stringify(session)),
  );
  return `${payload}.${await hmac(payload, secret)}`;
}

/** 쿠키 검증 — 유효하면 세션, 아니면 null */
export async function verifySession(
  value: string | undefined,
  secret: string,
): Promise<Session | null> {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;

  const payload = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if ((await hmac(payload, secret)) !== signature) return null;

  try {
    const session = JSON.parse(
      new TextDecoder().decode(b64urlDecode(payload)),
    ) as Session;
    if (!session?.n || typeof session.t !== "number") return null;
    if (Date.now() - session.t > SESSION_TTL_MS) return null;
    return session;
  } catch {
    return null;
  }
}

/* ─────────────────────────── 초대 토큰 ─────────────────────────── */

/** 초대 토큰은 원본을 메일로만 보내고, 서버에는 해시만 저장한다 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`hanmadi-invite:${token}`),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** PIN 정책 — 숫자 6자리 이상 */
export function validatePin(pin: string): string | null {
  if (!/^\d+$/.test(pin)) return "PIN은 숫자만 입력해 주세요.";
  if (pin.length < 6) return "PIN은 6자리 이상이어야 해요.";
  if (pin.length > 12) return "PIN은 12자리 이하로 입력해 주세요.";
  if (/^(\d)\1+$/.test(pin)) return "같은 숫자만 반복할 수 없어요.";
  return null;
}

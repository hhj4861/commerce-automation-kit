import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * 튜터·초대 저장소 (Node 런타임 전용 — API 라우트에서만 import).
 *
 * 드라이버 2종이 같은 인터페이스를 구현하고, 환경변수로 자동 선택된다.
 *
 * 1) Redis (Upstash REST) — 배포용. 아래 중 한 쌍이 있으면 자동 사용:
 *      UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *      KV_REST_API_URL       + KV_REST_API_TOKEN        (Vercel KV 통합)
 *    HTTP 기반이라 SDK 설치가 필요 없고 서버리스에서 그대로 동작한다.
 *
 * 2) 파일 (.data/tutors.json) — 로컬 개발용 폴백. 서버리스에서는 요청마다
 *    초기화되므로 배포 환경에서는 반드시 Redis를 연결해야 한다.
 *
 * 데이터 구조: 해시 3개 (동시 쓰기 충돌 없이 항목 단위로 갱신)
 *   hanmadi:tutors   field=이름       value=RegisteredTutor JSON
 *   hanmadi:invites  field=토큰해시   value=Invite JSON
 *   hanmadi:students field=slug       value=Student JSON (수업 기록 포함)
 *
 * 보관 정책: **TTL을 설정하지 않는다.** 쓰기마다 HSET과 PERSIST를 함께 보내
 * 만료가 붙지 않도록 보장한다. 초대장의 7일 제한은 Invite.expiresAt(애플리케이션
 * 로직)으로만 판단하며, Redis 데이터 자체는 지우기 전까지 영구 보관된다.
 */

import type { Student, LessonLog } from "@/data/types";

export type RegisteredTutor = {
  /**
   * 불변 식별자 — 세션(tid)·학생(tutorId) 격리의 기준.
   * 표시이름과 달리 등록 후 절대 바뀌지 않으며 재사용되지 않는다.
   * (등록 이전에 만들어진 레코드는 이 값이 없을 수 있어 로그인 시 backfill 한다.)
   */
  id: string;
  name: string;
  email: string;
  /** scrypt 해시 — "salt:hash" 형식, 평문 PIN은 저장하지 않는다 */
  pinHash: string;
  createdAt: number;
};

export type Invite = {
  /** 초대 링크에 담기는 토큰의 해시 (원본 토큰은 메일로만 전달된다) */
  tokenHash: string;
  email: string;
  invitedBy: string;
  createdAt: number;
  expiresAt: number;
  usedAt?: number;
  usedByName?: string;
};

const TUTORS_KEY = "hanmadi:tutors";
const INVITES_KEY = "hanmadi:invites";
const STUDENTS_KEY = "hanmadi:students";
const PROGRESS_KEY = "hanmadi:progress";

/* ────────────────────────────── 드라이버 ────────────────────────────── */

type Driver = {
  readonly kind: "redis" | "file";
  hgetall(key: string): Promise<Record<string, string>>;
  hset(key: string, field: string, value: string): Promise<void>;
  hdel(key: string, field: string): Promise<void>;
};

function redisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

function createRedisDriver(config: { url: string; token: string }): Driver {
  async function send(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${config.url}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(
        `Redis 요청 실패 (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`,
      );
    }
    return res.json();
  }

  async function command(args: (string | number)[]): Promise<unknown> {
    const body = (await send("", args.map(String))) as {
      result?: unknown;
      error?: string;
    };
    if (body.error) throw new Error(`Redis ${args[0]} 실패: ${body.error}`);
    return body.result;
  }

  /**
   * 여러 명령을 한 번의 HTTP 요청으로 보낸다 (Upstash 파이프라인).
   * 쓰기 시 HSET + PERSIST를 함께 보내 만료가 붙지 않도록 보장하는 용도.
   */
  async function pipeline(commands: string[][]): Promise<void> {
    const results = (await send("/pipeline", commands)) as {
      error?: string;
    }[];
    const failed = Array.isArray(results)
      ? results.find((r) => r?.error)
      : undefined;
    if (failed) throw new Error(`Redis 파이프라인 실패: ${failed.error}`);
  }

  return {
    kind: "redis",
    async hgetall(key) {
      const result = await command(["HGETALL", key]);
      const out: Record<string, string> = {};
      // Upstash는 [field, value, field, value, …] 평면 배열로 반환한다
      if (Array.isArray(result)) {
        for (let i = 0; i + 1 < result.length; i += 2) {
          out[String(result[i])] = String(result[i + 1]);
        }
      } else if (result && typeof result === "object") {
        for (const [k, v] of Object.entries(result)) out[k] = String(v);
      }
      return out;
    },
    async hset(key, field, value) {
      // HSET은 원래 TTL을 만들지 않지만, 어떤 경로로도 만료가 붙지 않도록
      // PERSIST를 같은 요청에 실어 보낸다 (데이터는 영구 보관).
      await pipeline([
        ["HSET", key, field, value],
        ["PERSIST", key],
      ]);
    },
    async hdel(key, field) {
      await command(["HDEL", key, field]);
    },
  };
}

function createFileDriver(): Driver {
  const path = join(process.cwd(), ".data", "tutors.json");

  type FileShape = Record<string, Record<string, string>>;

  function read(): FileShape {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as FileShape;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function write(data: FileShape): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
  }

  return {
    kind: "file",
    async hgetall(key) {
      return read()[key] ?? {};
    },
    async hset(key, field, value) {
      const data = read();
      data[key] = { ...(data[key] ?? {}), [field]: value };
      write(data);
    },
    async hdel(key, field) {
      const data = read();
      if (!data[key]) return;
      delete data[key][field];
      write(data);
    },
  };
}

let cached: Driver | null = null;

function driver(): Driver {
  if (cached) return cached;
  const config = redisConfig();
  cached = config ? createRedisDriver(config) : createFileDriver();
  return cached;
}

/** 현재 어떤 저장소를 쓰는지 — 관리 화면에서 배포 설정 확인용 */
export function storeKind(): "redis" | "file" {
  return driver().kind;
}

function parseAll<T>(raw: Record<string, string>): T[] {
  const out: T[] = [];
  for (const value of Object.values(raw)) {
    try {
      out.push(JSON.parse(value) as T);
    } catch {
      /* 손상된 항목은 건너뛴다 */
    }
  }
  return out;
}

/* ────────────────────────────── PIN 해싱 ────────────────────────────── */

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pin, salt, 32).toString("hex")}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(pin, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/* ────────────────────────────── 튜터 ────────────────────────────── */

export async function listTutors(): Promise<RegisteredTutor[]> {
  const tutors = parseAll<RegisteredTutor>(await driver().hgetall(TUTORS_KEY));
  return tutors.sort((a, b) => a.createdAt - b.createdAt);
}

export async function findTutorByName(
  name: string,
): Promise<RegisteredTutor | null> {
  return (await listTutors()).find((t) => t.name === name) ?? null;
}

export async function findTutorByEmail(
  email: string,
): Promise<RegisteredTutor | null> {
  return (await listTutors()).find((t) => t.email === email) ?? null;
}

/** 불변 id로 튜터 찾기 — 세션 폐기 확인의 기준 */
export async function findTutorById(
  id: string,
): Promise<RegisteredTutor | null> {
  if (!id) return null;
  return (await listTutors()).find((t) => t.id === id) ?? null;
}

/** PIN으로 등록 튜터 찾기 — 전체를 순회하며 해시 비교 */
export async function findRegisteredTutorByPin(
  pin: string,
): Promise<RegisteredTutor | null> {
  if (!pin) return null;
  return (await listTutors()).find((t) => verifyPin(pin, t.pinHash)) ?? null;
}

export async function addTutor(tutor: RegisteredTutor): Promise<void> {
  await driver().hset(TUTORS_KEY, tutor.name, JSON.stringify(tutor));
}

/**
 * 튜터 삭제 — 삭제된 튜터의 학생을 **고아로 남기지 않는다.**
 * 그 튜터가 담당하던 학생·수업기록을 소유자(reassignTo)로 이관해,
 * 나중에 같은 이름으로 등록한 다른 사람이 상속받지 못하게 한다
 * (불변 tutorId 격리와 함께 이름 재사용 공격을 원천 차단).
 */
export async function removeTutor(
  name: string,
  reassignTo: { id: string; name: string },
): Promise<boolean> {
  const tutor = await findTutorByName(name);
  if (!tutor) return false;
  await driver().hdel(TUTORS_KEY, name);

  for (const student of await listStudents()) {
    const ownedById = Boolean(tutor.id) && student.tutorId === tutor.id;
    // tutorId가 아직 없는 레거시 학생은 이름으로 판별한다
    const ownedByLegacyName = !student.tutorId && student.tutorName === tutor.name;
    if (ownedById || ownedByLegacyName) {
      await saveStudent({
        ...student,
        tutorId: reassignTo.id,
        tutorName: reassignTo.name,
      });
    }
  }
  return true;
}

/* ────────────────────────────── 초대 ────────────────────────────── */

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

export async function listInvites(): Promise<Invite[]> {
  const invites = parseAll<Invite>(await driver().hgetall(INVITES_KEY));
  return invites.sort((a, b) => b.createdAt - a.createdAt);
}

export async function addInvite(invite: Invite): Promise<void> {
  // 같은 이메일의 미사용 초대는 새 초대로 대체한다
  const stale = (await listInvites()).filter(
    (i) => i.email === invite.email && !i.usedAt,
  );
  for (const old of stale) {
    await driver().hdel(INVITES_KEY, old.tokenHash);
  }
  await driver().hset(INVITES_KEY, invite.tokenHash, JSON.stringify(invite));
}

export async function findInviteByTokenHash(
  tokenHash: string,
): Promise<Invite | null> {
  const raw = await driver().hgetall(INVITES_KEY);
  const value = raw[tokenHash];
  if (!value) return null;
  try {
    return JSON.parse(value) as Invite;
  } catch {
    return null;
  }
}

export async function markInviteUsed(
  tokenHash: string,
  usedByName: string,
): Promise<void> {
  const invite = await findInviteByTokenHash(tokenHash);
  if (!invite) return;
  await driver().hset(
    INVITES_KEY,
    tokenHash,
    JSON.stringify({ ...invite, usedAt: Date.now(), usedByName }),
  );
}

export async function revokeInvite(tokenHash: string): Promise<boolean> {
  if (!(await findInviteByTokenHash(tokenHash))) return false;
  await driver().hdel(INVITES_KEY, tokenHash);
  return true;
}

/* ────────────────────────────── 학생 / 수업 기록 ────────────────────────────── */

/**
 * 학생과 수업 기록은 전부 저장소에 보관된다 (코드 수정·재배포 불필요).
 * data/students/index.ts의 샘플은 저장소가 비었을 때만 쓰이는 시드다.
 */

export async function listStudents(): Promise<Student[]> {
  const students = parseAll<Student>(await driver().hgetall(STUDENTS_KEY));
  return students.sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export async function getStoredStudent(slug: string): Promise<Student | null> {
  const raw = await driver().hgetall(STUDENTS_KEY);
  const value = raw[slug];
  if (!value) return null;
  try {
    return JSON.parse(value) as Student;
  } catch {
    return null;
  }
}

export async function saveStudent(student: Student): Promise<void> {
  await driver().hset(STUDENTS_KEY, student.slug, JSON.stringify(student));
}

export async function removeStudent(slug: string): Promise<boolean> {
  if (!(await getStoredStudent(slug))) return false;
  await driver().hdel(STUDENTS_KEY, slug);
  return true;
}

/**
 * 레벨 진단 결과 저장 — 학생이 공개 링크로 셀프 진단한 결과를 그 학생 레코드에 붙인다.
 * 로그인 없는 공개 경로(/api/placement)가 호출하므로, level을 자동으로 바꾸지 않고
 * placement 제안만 저장한다 (튜터가 관리 화면에서 확정). 저장소에 없고 시드에만 있던
 * 학생이면 seed를 넘겨 저장소로 승격시킨다.
 */
export async function savePlacement(
  slug: string,
  placement: Student["placement"],
  seed?: Student,
): Promise<Student | null> {
  const current = (await getStoredStudent(slug)) ?? seed ?? null;
  if (!current) return null;
  const updated: Student = { ...current, placement };
  await saveStudent(updated);
  return updated;
}

/* ────────────────────────────── 퍼즐 진행 기록 ────────────────────────────── */

/** 푼 퍼즐 → 푼 시각(ms). 기기가 바뀌어도 이어지도록 저장소에 보관한다. */
export type PuzzleProgress = Record<string, number>;

/** 한 학생이 쌓을 수 있는 최대 기록 수 — 비정상 요청 방어 */
const MAX_PROGRESS_ENTRIES = 3000;

export async function getProgress(slug: string): Promise<PuzzleProgress> {
  const raw = await driver().hgetall(PROGRESS_KEY);
  const value = raw[slug];
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as PuzzleProgress;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * 진행 기록 병합 — 같은 퍼즐은 "처음 푼 시각"을 유지한다.
 * 학생이 여러 기기에서 풀어도 기록이 사라지지 않는다.
 */
export async function mergeProgress(
  slug: string,
  incoming: PuzzleProgress,
): Promise<PuzzleProgress> {
  const current = await getProgress(slug);
  const merged: PuzzleProgress = { ...current };

  for (const [id, solvedAt] of Object.entries(incoming)) {
    if (typeof solvedAt !== "number" || !Number.isFinite(solvedAt)) continue;
    const existing = merged[id];
    merged[id] = existing ? Math.min(existing, solvedAt) : solvedAt;
  }

  // 오래된 기록부터 잘라 상한을 지킨다
  const entries = Object.entries(merged);
  const capped =
    entries.length > MAX_PROGRESS_ENTRIES
      ? Object.fromEntries(
          entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_PROGRESS_ENTRIES),
        )
      : merged;

  await driver().hset(PROGRESS_KEY, slug, JSON.stringify(capped));
  return capped;
}

export async function removeProgress(slug: string): Promise<void> {
  await driver().hdel(PROGRESS_KEY, slug);
}

/** 수업 기록 1건 추가 — /live에서 저장 시 사용. id가 같으면 덮어쓴다. */
export async function appendLesson(
  slug: string,
  lesson: LessonLog,
): Promise<Student | null> {
  const student = await getStoredStudent(slug);
  if (!student) return null;

  const existing = student.lessons.findIndex((l) => l.id === lesson.id);
  const lessons =
    existing >= 0
      ? student.lessons.map((l, i) => (i === existing ? lesson : l))
      : [...student.lessons, lesson];

  const updated: Student = { ...student, lessons };
  await saveStudent(updated);
  return updated;
}

import { NextResponse } from "next/server";
import { publicQuestions, scorePlacement } from "@/lib/placement";
import { savePlacement } from "@/lib/store";
import { getStudentBySlug } from "@/lib/students";

export const runtime = "nodejs";

/**
 * 레벨 진단 (공개) — 학생이 로그인 없이 스스로 푼다.
 *
 * GET               → 문항(정답 제외) 반환. 익명 응시 가능.
 * POST { answers }  → 채점 결과 반환 (익명).
 * POST { answers, slug } → 채점 + 그 학생 레코드에 placement 제안 저장.
 *   slug는 튜터가 학생에게 보낸 개인 링크에서만 들어온다. 비공개 slug 자체가 열쇠이고,
 *   저장하는 값(레벨 제안·점수)은 민감하지 않으며 level을 자동으로 바꾸지 않는다.
 */

export async function GET() {
  return NextResponse.json({ ok: true, questions: publicQuestions() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    answers?: unknown;
    slug?: unknown;
  } | null;

  const raw = body?.answers;
  if (!raw || typeof raw !== "object") {
    return NextResponse.json(
      { ok: false, error: "답안이 필요해요." },
      { status: 400 },
    );
  }

  // answers 정규화 — { [id]: number }만 남긴다
  const answers: Record<string, number> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isInteger(n) && n >= 0 && n < 12) answers[id] = n;
  }

  const result = scorePlacement(answers, Date.now());

  // 개인 링크(slug)로 응시했으면 그 학생에게 제안을 저장한다
  const slug = typeof body?.slug === "string" ? body.slug : "";
  let saved = false;
  if (slug) {
    const student = await getStudentBySlug(slug);
    if (student) {
      await savePlacement(slug, { ...result, applied: false }, student);
      saved = true;
    }
  }

  return NextResponse.json({ ok: true, result, saved });
}

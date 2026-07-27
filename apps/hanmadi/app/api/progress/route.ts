import { NextResponse } from "next/server";
import { getProgress, mergeProgress } from "@/lib/store";
import { getStudentBySlug } from "@/lib/students";

export const runtime = "nodejs";

/**
 * 퍼즐 진행 기록 동기화.
 *
 * 학생 포털은 로그인이 없다 — 비공개 slug 자체가 열쇠다.
 * 따라서 이 엔드포인트는 slug를 아는 사람만 호출할 수 있고,
 * 저장하는 값도 "어떤 퍼즐을 언제 풀었는가"뿐이라 민감 정보가 없다.
 *
 * 병합 규칙: 같은 퍼즐은 처음 푼 시각을 유지한다 → 기기를 옮겨도 기록이 이어진다.
 */

const MAX_INCOMING = 500;
const MAX_ID_LENGTH = 120;

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  if (!slug || !(await getStudentBySlug(slug))) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  return NextResponse.json({ ok: true, solved: await getProgress(slug) });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    slug?: unknown;
    solved?: unknown;
  } | null;

  const slug = typeof body?.slug === "string" ? body.slug : "";
  if (!slug || !(await getStudentBySlug(slug))) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const incoming: Record<string, number> = {};
  if (body?.solved && typeof body.solved === "object") {
    for (const [id, at] of Object.entries(body.solved as Record<string, unknown>)) {
      if (Object.keys(incoming).length >= MAX_INCOMING) break;
      if (typeof id !== "string" || id.length === 0 || id.length > MAX_ID_LENGTH) {
        continue;
      }
      const solvedAt = typeof at === "number" ? at : Number(at);
      if (!Number.isFinite(solvedAt) || solvedAt <= 0) continue;
      incoming[id] = solvedAt;
    }
  }

  const merged = await mergeProgress(slug, incoming);
  return NextResponse.json({ ok: true, solved: merged });
}

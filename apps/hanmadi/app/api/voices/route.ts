import { NextResponse } from "next/server";
import { getTutorSession } from "@/lib/students";

export const runtime = "nodejs";

/**
 * 음성 탐색/채택 (튜터 전용 관리 유틸) — ElevenLabs 보이스 라이브러리 프록시.
 *
 * 앱의 발음 음성을 고를 때 쓴다. 서버에서 호출하는 이유: 키가 서버에만 있고,
 * 운영 환경(회사망)이 ElevenLabs 직접 호출을 막는 경우에도 동작해야 해서다.
 *
 * GET  ?gender=female&search=... → 한국어 공유 음성 목록(프리뷰 URL 포함)
 * POST { ownerId, voiceId, name } → 그 음성을 계정 보이스 뱅크에 추가
 *   (공유 음성은 뱅크에 추가해야 TTS에 쓸 수 있다. 이후 ELEVENLABS_VOICE_ID 교체)
 */

const API = "https://api.elevenlabs.io/v1";

function key(): string | null {
  return process.env.ELEVENLABS_API_KEY ?? null;
}

export async function GET(req: Request) {
  if (!(await getTutorSession())) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const apiKey = key();
  if (!apiKey) return NextResponse.json({ ok: false, reason: "키 없음" }, { status: 503 });

  const url = new URL(req.url);
  const params = new URLSearchParams({ language: "ko", page_size: "30" });
  const gender = url.searchParams.get("gender");
  const search = url.searchParams.get("search");
  if (gender) params.set("gender", gender);
  if (search) params.set("search", search);

  const res = await fetch(`${API}/shared-voices?${params}`, {
    headers: { "xi-api-key": apiKey },
    cache: "no-store",
  });
  if (!res.ok) {
    return NextResponse.json({ ok: false, reason: `ElevenLabs ${res.status}` }, { status: 502 });
  }
  const data = (await res.json()) as {
    voices: {
      voice_id: string;
      public_owner_id: string;
      name: string;
      gender?: string;
      age?: string;
      description?: string;
      preview_url?: string;
      cloned_by_count?: number;
    }[];
  };
  const voices = data.voices
    .sort((a, b) => (b.cloned_by_count ?? 0) - (a.cloned_by_count ?? 0))
    .map((v) => ({
      voiceId: v.voice_id,
      ownerId: v.public_owner_id,
      name: v.name,
      gender: v.gender,
      age: v.age,
      uses: v.cloned_by_count ?? 0,
      description: (v.description ?? "").slice(0, 120),
      preview: v.preview_url ?? null,
    }));
  return NextResponse.json({ ok: true, voices });
}

export async function POST(req: Request) {
  if (!(await getTutorSession())) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const apiKey = key();
  if (!apiKey) return NextResponse.json({ ok: false, reason: "키 없음" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as {
    ownerId?: string;
    voiceId?: string;
    name?: string;
  } | null;
  if (!body?.ownerId || !body.voiceId) {
    return NextResponse.json({ ok: false, reason: "ownerId/voiceId 필요" }, { status: 400 });
  }

  const res = await fetch(`${API}/voices/add/${body.ownerId}/${body.voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ new_name: body.name ?? "hanmadi-voice" }),
  });
  const detail = (await res.text().catch(() => "")).slice(0, 300);
  if (!res.ok) {
    return NextResponse.json({ ok: false, reason: `ElevenLabs ${res.status}: ${detail}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, added: body.voiceId });
}

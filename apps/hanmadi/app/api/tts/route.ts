import { NextResponse } from "next/server";
import { synthesizeKorean } from "@/lib/tts";

export const runtime = "nodejs";

/**
 * 발음 mp3 (공개) — GET ?text={한국어 문구} → audio/mpeg
 *
 * 브라우저 Web Speech는 기기 복불복이라, ElevenLabs로 생성한 mp3를 내려준다.
 * 같은 문구는 저장소에 영구 캐시되고(크레딧 1회), 응답에 immutable 캐시 헤더를
 * 붙여 Vercel CDN·브라우저가 재요청 자체를 흡수한다. 실패(키 없음·상한·API 오류)는
 * 상태코드만 돌려주고, 클라이언트 speak()가 브라우저 음성으로 폴백한다.
 */
export async function GET(req: Request) {
  const text = new URL(req.url).searchParams.get("text") ?? "";
  const result = await synthesizeKorean(text);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.reason },
      { status: result.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  return new Response(new Uint8Array(result.mp3), {
    headers: {
      "Content-Type": "audio/mpeg",
      // CDN(s-maxage)은 새 배포마다 비워지니 길게, 브라우저(max-age)는 발음
      // 수정이 배포 없이 도달할 수 있도록 1일로 짧게 잡는다
      "Cache-Control": "public, max-age=86400, s-maxage=31536000",
    },
  });
}

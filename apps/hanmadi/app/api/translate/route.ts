import { NextResponse } from "next/server";
import { lookupPhrase } from "@/lib/phrase-dict";
import { getTutorSession } from "@/lib/students";

export const runtime = "nodejs";

/**
 * 한국어 → 영어 뜻 (튜터 전용) — /live에서 새 표현을 입력하면 영어 뜻을 자동으로 채운다.
 *
 * GET ?ko={ko} → { ok: true, en: string, source: "dict" | "api" | "none" }
 *   source "dict": 학습팩 사전(검수된 ko/en)에 정확 일치 — 무료·정확, 1순위.
 *   source "api" : 사전에 없어 무료 키리스 번역(MyMemory)으로 보완한 값.
 *   source "none": 입력이 비었거나 너무 길거나 번역 실패 — en은 "".
 *
 * 자동 번역은 보조 기능이라 오류·타임아웃·빈 결과는 조용히 en:""으로 폴백한다
 * (튜터가 언제든 손으로 입력·수정할 수 있다). 튜터 세션이 없으면 403 — /live에서만 호출.
 */
export async function GET(req: Request) {
  const session = await getTutorSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 403 });

  const ko = (new URL(req.url).searchParams.get("ko") ?? "").trim();
  // 비었거나 지나치게 길면(표현 단위가 아니면) 번역하지 않는다
  if (!ko || ko.length > 100) {
    return NextResponse.json({ ok: true, en: "", source: "none" });
  }

  // 1) 학습팩 사전 — 검수된 쌍이면 그대로 반환 (무료·정확)
  const hit = lookupPhrase(ko);
  if (hit) {
    return NextResponse.json({ ok: true, en: hit, source: "dict" });
  }

  // 2) 무료 키리스 번역 폴백 — 실패/빈 결과는 조용히 none
  const en = await translateFallback(ko);
  return en
    ? NextResponse.json({ ok: true, en, source: "api" })
    : NextResponse.json({ ok: true, en: "", source: "none" });
}

/**
 * MyMemory 무료 번역(API 키 불필요)을 서버에서 호출한다.
 * 오류·타임아웃·형식 불일치·빈 결과는 모두 ""로 폴백한다.
 */
async function translateFallback(ko: string): Promise<string> {
  const url =
    "https://api.mymemory.translated.net/get?q=" +
    encodeURIComponent(ko) +
    "&langpair=ko|en";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return "";
    const data: unknown = await res.json();
    return extractTranslated(data);
  } catch {
    // 네트워크 오류·타임아웃(abort)·JSON 파싱 실패 — 모두 조용히 폴백
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/** MyMemory 응답에서 번역문만 안전하게 뽑는다. 상태가 200이 아니거나 형식이 다르면 "". */
function extractTranslated(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const obj = data as { responseStatus?: unknown; responseData?: unknown };
  // 200이 아니면(쿼터 초과·오류) 번역문을 신뢰하지 않는다 (숫자/문자 모두 대응)
  if (Number(obj.responseStatus) !== 200) return "";
  const rd = obj.responseData;
  if (!rd || typeof rd !== "object") return "";
  const text = (rd as { translatedText?: unknown }).translatedText;
  return typeof text === "string" ? text.trim() : "";
}

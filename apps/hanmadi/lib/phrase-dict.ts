/**
 * ko→en 표현 사전 — data/packs의 모든 팩을 순회해 만든 정적 조회 테이블.
 *
 * /live에서 튜터가 한국어를 입력하면 영어 뜻을 자동으로 채우는 API의 1차 소스다.
 * 학습팩에 이미 사람이 검수한 ko/en 쌍만 모으므로 무료이고 정확하다. 사전에 없으면
 * 호출부(app/api/translate)가 무료 번역 API로 폴백한다.
 *
 * 수집 대상 블록: phrase-cards(cards) · dialogue(lines) · drill(items).
 * 셋 다 ko와 (검수된) en을 함께 들고 있는 표현 단위 블록이다.
 * heading/checklist 등 제목·지시문 위주 블록은 어휘 조회를 흐릴 수 있어 제외한다.
 */
import { packs } from "@/data/packs";

/**
 * 조회 키 정규화 — 사전 적재와 조회에 같은 함수를 써야 일치한다.
 * 앞뒤 공백 제거 · 내부 공백 1칸 축약 · 양끝 문장부호/따옴표 제거 후 소문자화.
 * (한글은 대소문자가 없어 소문자화는 로마자·영문이 섞인 키에만 영향을 준다.)
 */
function normalizeKo(ko: string): string {
  return ko
    .trim()
    .replace(/\s+/g, " ")
    // 양끝의 공백·문장부호·따옴표만 제거한다 (내부 부호는 의미 구분을 위해 유지)
    .replace(/^[\s.,!?~…"'“”‘’]+|[\s.,!?~…"'“”‘’]+$/g, "")
    .toLowerCase();
}

let dict: Map<string, string> | null = null;

/** packs를 한 번 순회해 정규화된 ko → en 사전을 만든다 (같은 키는 먼저 나온 값 유지). */
function buildDict(): Map<string, string> {
  const map = new Map<string, string>();
  const add = (ko: string, en: string) => {
    const key = normalizeKo(ko);
    const val = en.trim();
    if (!key || !val) return;
    if (!map.has(key)) map.set(key, val);
  };

  for (const pack of packs) {
    for (const block of pack.blocks) {
      switch (block.type) {
        case "phrase-cards":
          for (const card of block.cards) add(card.ko, card.en);
          break;
        case "dialogue":
          for (const line of block.lines) add(line.ko, line.en);
          break;
        case "drill":
          // drill의 en은 선택 필드라 있을 때만 담는다
          for (const item of block.items) if (item.en) add(item.ko, item.en);
          break;
      }
    }
  }
  return map;
}

function getDict(): Map<string, string> {
  if (!dict) dict = buildDict();
  return dict;
}

/** 정규화 후 정확 일치로 영어 뜻을 조회한다. 없으면 null. */
export function lookupPhrase(ko: string): string | null {
  const key = normalizeKo(ko);
  if (!key) return null;
  return getDict().get(key) ?? null;
}

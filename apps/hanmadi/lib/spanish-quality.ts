/** Shared guidance, not a full phonetic or semantic verifier. Hangul is approximate. */
export const spanishQualityGuidance = `Spanish pronunciation and meaning:
- Keep reading and Korean meaning separate. Hangul is an approximation of the Spanish sounds, not an exact phonetic alphabet.
- por favor: 포르 파보르 (also 뽀르 파보르), never 바뽀르 or 바호르. In a polite request, translate its function naturally as 주세요/부탁해요; do not append 포르 파보르 to the Korean meaning.
- cuenta: 쿠엔타 (also 꾸엔따), never 꿰운따. Preserve the ue sequence, not eu.
- sin hielo: 신 이에로. Spanish h is silent; b and v share the same basic pronunciation.
- Preserve quoted words and proper names when they really are names or the topic of discussion; do not confuse those with polite requests.`;

/** Only the specific production regressions we can identify with bounded rules. */
export function spanishQualityIssue(text: string, reading: string, meaning?: string): string | null {
  const source = text.normalize("NFC").toLocaleLowerCase("es");
  const sounds = reading.normalize("NFC").replace(/[^가-힣]/g, "");
  // Whole-word matching avoids cuenta matching encuentra/cuentan, etc.
  const favor = /(?<!\p{L})por\s+favor(?!\p{L})/u.test(source);
  if (favor && /[포뽀]르(?:바[뽀보]르|바호르|파호르)/.test(sounds))
    return "Pronounce por favor as 포르 파보르, not 바뽀르 or 바호르.";
  if (/(?<!\p{L})cuenta(?!\p{L})/u.test(source) && /[꿰쾌퀘]운[따타]/.test(sounds))
    return "Pronounce cuenta as 쿠엔타/꾸엔따, preserving ue, not 꿰운따.";
  // Only an unquoted sentence-final polite request, not a business name or a
  // metalinguistic example. Never reject all foreign loanwords in Korean.
  const request = /,\s*por\s+favor[.!?…]*\s*$/u.test(source)
    && !/["“”«»'‘’]/.test(source)
    && !/\b(?:llama|llamado|nombre|significa|expresi[oó]n|palabra|pronuncia)\b/u.test(source);
  const korean = meaning?.normalize("NFC").replace(/\s/g, "") ?? "";
  if (request && /[포뽀]르[파빠바][보뽀호]르|porfavor/i.test(korean))
    return "Translate polite por favor naturally into Korean (주세요/부탁해요); do not copy its sounds into the meaning.";
  return null;
}

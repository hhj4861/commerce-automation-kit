import type { StudyLanguage, Phrase } from "./v2";

export const learnerQualityGuidance = `Preserve every requested item, number and negative condition in BOTH text and meaning. "얼음 없이" means no ice, NOT less sugar. Do not add hot/iced/sweet preferences. Thai coffee is กาแฟ (커 까패), no ice is ไม่ใส่น้ำแข็ง (마이 싸이 남캥), one cup is หนึ่งแก้ว (능 깨우). Never output ขอแฟ or invent a missing syllable. Japanese 韓国 is 캉코쿠, 週末 is 슈마츠, 乾杯 is 간파이, not 칸바이. Spanish ¿Algo más? is 알고 마스, not 알골 마스.`;

/** Bounded observed regressions, not a general-purpose semantic/phonetic grader. */
export function pronunciationIssue(text: string, reading: string, language: StudyLanguage): string | null {
  const sounds = reading.replace(/[^가-힣]/g, "");
  if (language === "ja") {
    if (text.includes("韓国") && sounds.includes("한국")) return "Pronounce 韓国 as 캉코쿠, never the Korean translation 한국.";
    if (text.includes("週末") && /슈마와/.test(sounds)) return "Pronounce 週末は as 슈마츠와; do not omit 츠.";
    if (text.includes("乾杯") && /[간칸]바이/.test(sounds)) return "Pronounce 乾杯 as 간파이/칸파이, not 칸바이.";
  }
  if (language === "es" && /\balgo\s+m[aá]s\b/i.test(text) && /알골마스/.test(sounds))
    return "Pronounce Algo más as 알고 마스, not 알골 마스.";
  return null;
}

export function learnerMeaningIssue(input: string, phrase: Phrase, language: StudyLanguage): string | null {
  // Do not claim arbitrary meaning verification: recognize this explicit request only.
  if (!/커피/.test(input) || !/얼음(?:은|을)?\s*(없이|빼|넣지|제외)/.test(input)) return null;
  const coffee = {ja:/コーヒー/, th:/กาแฟ|คอฟฟี่/, en:/\bcoffee\b/i, es:/(?<!\p{L})caf[eé](?!\p{L})/iu}[language];
  const noIce = {ja:/氷(?:を|は)?(?:抜き|抜いて|抜いた|なし|無し|入れない)|氷(?:を|は)?(?:入れず|除いて)/, th:/ไม่(?:ต้อง)?(?:ใส่|เอา)\s*น้ำแข็ง|งดน้ำแข็ง|ไม่ใส่น้ําแข็ง/, en:/\b(?:without(?:\s+any)?|no)\s+ice\b/i, es:/\bsin(?:\s+nada\s+de)?\s+hielo\b/i}[language];
  if (!coffee.test(phrase.text) || !noIce.test(phrase.text)) return "Preserve coffee AND no ice. Thai: ขอกาแฟหนึ่งแก้ว ไม่ใส่น้ำแข็ง. No sugar is NOT no ice.";
  if (/한\s*잔|1\s*잔/.test(input)) {
    const one = {ja:/一杯|1杯|ひとつ|一つ/, th:/(?:หนึ่ง|1|๑)\s*แก้ว|แก้ว\s*(?:หนึ่ง|1|๑)/, en:/\b(?:one|a|1)\s+(?:cup\s+of\s+)?coffee\b/i, es:/\b(?:un|1)\s+caf[eé](?!\p{L})/iu}[language];
    if (!one.test(phrase.text)) return "Keep the learner's quantity: one cup of coffee.";
  }
  if (!/커피/.test(phrase.meaning) || !/얼음(?:은|을)?\s*(없이|빼|넣지|제외|없는|안|뺀)/.test(phrase.meaning)) return "The Korean meaning must preserve coffee and no ice too.";
  const addedSweet = {ja:/砂糖|甘さ|甘く/, th:/หวาน|น้ำตาล/, en:/\bsugar|sweet/i, es:/az[uú]car|dulce/i}[language];
  if (!/달|당도|설탕|단맛/.test(input) && addedSweet.test(phrase.text)) return "Do not add a sugar/sweetness preference that the learner never requested.";
  const temperature = {ja:/アイス|ホット|冷たい|温かい/, th:/เย็น|ร้อน/, en:/\biced|\bhot\b|\bcold\b/i, es:/caliente|fr[ií]o/i}[language];
  if (!/아이스|차가|차갑|차게|시원|뜨거|따뜻|핫/.test(input) && temperature.test(phrase.text)) return "No ice is not a request for iced or hot coffee. Do not add a temperature.";
  return null;
}

export function dialogueIssue(input: string, reply: Phrase, language: StudyLanguage, scene: string, history: { role: string; content: string }[] = []): string | null {
  if (scene !== "cafe" || !/커피/.test(input) || !/얼음(?:은|을)?\s*(없이|빼|넣지|제외)/.test(input)) return null;
  // Observed first-order error: no ice was turned into an iced coffee assertion.
  // Prior USER choices can establish temperature; an assistant's invented choice cannot.
  const temperatureChosen = [input, ...history.filter(m => m.role === "user").map(m => m.content)]
    .some(value => /아이스|차가|차갑|차게|시원|뜨거|따뜻|핫|アイス|ホット|冷たい|温かい|\b(?:iced|hot|cold)\b/i.test(value));
  if (language === "ja" && !temperatureChosen &&
      /(?:アイス|ホット|冷たい|温かい)コーヒーですね/.test(reply.text))
    return "Do not invent a drink temperature. No ice does not mean iced or hot. Acknowledge 氷抜きのコーヒー without adding アイス or ホット.";
  if (/얼음(?:은|을)?\s*(없이|빼|안).*?(?:까요|겠어요\?)/.test(reply.meaning)) return "The learner already requested no ice. Acknowledge it; do not ask them to request it again.";
  if (language === "en" && /\biced\s+coffee\b/i.test(reply.text) && /hot\s+or\s+iced/i.test(reply.text)) return "Do not assert iced coffee and then ask hot or iced. Acknowledge coffee without ice.";
  if (language === "es" && /^Un caf[eé][^.!?]*por favor[.!]/i.test(reply.text)) return "You are the cafe staff, not the customer. Confirm the order; do not repeat the customer's request ending in por favor.";
  return null;
}

/** Default for newly generated Thai speaking practice, not inbound quoted speech. */
export const thaiMaleSpeechGuidance = `Thai speaker style: use a male speaker by default. Use ผม (폼) for first-person singular when needed, and ครับ (캅; careful pronunciation 크랍) for polite statements AND questions. Do not use female polite particles ค่ะ/คะ or the female self-reference ดิฉัน for the speaking learner or AI partner. Keep particles natural, not after every word; short fragments need no forced particle. When text ends in ครับ, its Hangul reading must end in 캅 or 크랍. This is a speaking-style default, not a claim about the user's identity; preserve the meaning and gender of people mentioned or quoted.`;

export function thaiMaleSpeechIssue(text: string, reading: string, language: StudyLanguage): string | null {
  if (language !== "th") return null;
  // Boundaries avoid matching words such as คะน้า (Chinese kale) or คะแนน (score).
  const ownSpeech = text.replace(/"[^"]*"|“[^”]*”|‘[^’]*’|「[^」]*」/g, "");
  if (/(?:ค่ะ|คะ)(?=$|[\s\p{P}])/u.test(ownSpeech))
    return "Use the default male speaker's polite particle ครับ, not ค่ะ/คะ; update the Hangul reading to match (캅).";
  if (/ครับ[\s\p{P}]*$/u.test(text) && !/(?:캅|크랍)[\s\p{P}]*$/u.test(reading))
    return "Pronounce the final ครับ as 캅 or 크랍, not 카. Keep text and reading aligned.";
  return null;
}

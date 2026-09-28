import { getLesson, languages, type Language } from "./courses";

/** Original speaking activities built around existing course expressions. No literacy prerequisite. */
export function speakingSteps(language: Language, lessonId: string) {
  const lesson = getLesson(language, lessonId);
  if (!lesson) return [];
  const indices = lessonId === "greetings" && language === "th" ? [0, 3] : lessonId === "directions" ? [1, 2] : [0, 1];
  const situations: Record<string, string[]> = {
    greetings: ["낮에 처음 만난 사람에게 인사를 건네요.", "처음 만난 사람과 반가운 마음을 나눠요."],
    cafe: ["카페에서 주문할 차례예요. 커피 한 잔을 부탁해요.", language === "th" ? "단맛을 좋아하지 않아요. 달지 않게 부탁해요." : "직원이 따뜻한 음료를 준비하려 해요. 아이스로 부탁해요."],
    directions: ["길을 걷다가 역을 찾고 있어요. 지나가는 사람에게 물어요.", language === "ko" ? "길을 알려 준 사람에게 감사 인사를 해요." : "이번에는 화장실을 찾고 있어요. 같은 방식으로 물어요."],
  };
  return indices.map((index, step) => ({ phrase: lesson.phrases[index], situation: situations[lessonId]?.[step] ?? lesson.goal }));
}
export type SpeakingConfidence = "repeat" | "help" | "alone";
export function guidedInstruction(language: Language, lessonId: string, step: number) {
  const target = speakingSteps(language, lessonId)[step];
  return `쓰기 없이 듣고 말하는 입문 연습. 상황: ${target.situation} 연습 표현: ${target.phrase.text} (${target.phrase.koreanReading ?? target.phrase.reading}; ${target.phrase.meaning}). 음성 인식 결과에 대해 ${languages[language].name}로 상대역의 짧은 반응 한 문장을 먼저 주고 한국어 도움 한 문장을 덧붙이세요. 틀린 표현이면 고친 예시를 먼저 주세요. 새 질문·새 어휘로 진도를 앞서가지 마세요. 음성 인식은 틀릴 수 있으며 발음·성조 점수나 합격을 판정하지 마세요.`;
}

/** Read only a standalone target-language line, never Korean coaching as Japanese/Thai. */
export function spokenReply(reply: string, language: Language): string | undefined {
  if (language === "ko") return undefined;
  const script = language === "ja" ? /[\u3040-\u30ff\u3400-\u9fff]/ : /[\u0e00-\u0e7f]/;
  return reply.split("\n").map(line => line.replace(/^[\s#*•-]+/, "").replace(/\*\*/g, "").trim())
    .find(line => line.length > 0 && line.length <= 300 && script.test(line) && !/[가-힣<>]/.test(line) && !/https?:|\[[^\]]+\]\(/.test(line));
}

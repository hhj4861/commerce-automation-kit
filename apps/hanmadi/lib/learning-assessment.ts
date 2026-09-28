// Server-only question bank. Client components receive choices, never answers.
import type { Language } from "./courses";
import type { LearningLevel } from "./adaptive-learning";
type Question = { id: string; prompt: string; choices: string[]; answer: number };
const q = (id: string, prompt: string, choices: string[], answer: number): Question => ({ id, prompt, choices, answer });
const questions: Record<Language, Question[]> = {
  ko: [
    q("greeting", "처음 만난 사람에게 공손하게 인사하려면?", ["안녕하세요", "잘 자", "얼마예요?"], 0),
    q("meaning", "‘도서관’은 어떤 장소인가요?", ["음식을 주문하는 곳", "책을 읽거나 빌리는 곳", "기차를 타는 곳"], 1),
    q("request", "물을 공손하게 부탁하는 문장은?", ["물이 갔어요", "물에 있어요", "물 한 잔 주세요"], 2),
    q("past", "어제 한 일을 말하는 문장은?", ["어제 영화를 봤어요", "내일 영화를 볼 거예요", "지금 영화를 봐요"], 0),
    q("reason", "‘비가 와서 집에 있었어요’에서 집에 있었던 이유는?", ["집이 멀어서", "비가 와서", "약속이 있어서"], 1),
    q("situation", "약속 시간을 바꾸고 싶을 때 자연스러운 말은?", ["약속이 몇 개예요?", "약속은 맛있어요", "약속을 한 시간 늦춰도 될까요?"], 2),
  ],
  ja: [
    q("greeting", "낮에 처음 만난 사람에게 하는 인사는?", ["こんにちは", "おやすみなさい", "いくらですか"], 0),
    q("meaning", "‘駅’의 뜻은?", ["학교", "역", "가게"], 1),
    q("request", "커피 한 잔을 부탁하는 표현은?", ["コーヒーに行きます", "コーヒーを読みます", "コーヒーを一杯ください"], 2),
    q("past", "어제 영화를 봤다고 말하는 문장은?", ["昨日、映画を見ました", "明日、映画を見ます", "今、映画を見ています"], 0),
    q("reason", "‘雨が降っているので、家にいます’에서 집에 있는 이유는?", ["날씨가 좋아서", "비가 와서", "집이 멀어서"], 1),
    q("situation", "약속을 내일로 변경할 수 있는지 묻는 표현은?", ["明日は何色ですか", "昨日はどこでしたか", "約束を明日に変更できますか"], 2),
  ],
  th: [
    q("greeting", "사람을 만났을 때 하는 인사는?", ["สวัสดี", "ขอบคุณ", "เท่าไหร่"], 0),
    q("meaning", "‘น้ำ’의 뜻은?", ["책", "물", "집"], 1),
    q("request", "커피 한 잔을 부탁하는 표현은?", ["ไปโรงเรียน", "อ่านหนังสือ", "ขอกาแฟหนึ่งแก้ว"], 2),
    q("past", "‘เมื่อวานไปตลาด’는 언제 시장에 갔다는 뜻인가요?", ["어제", "내일", "매주"], 0),
    q("reason", "‘เพราะฝนตกเลยอยู่บ้าน’에서 집에 있는 이유는?", ["배가 고파서", "비가 와서", "학교가 멀어서"], 1),
    q("situation", "‘เปลี่ยนเวลานัดเป็นพรุ่งนี้ได้ไหม’의 뜻은?", ["약속 장소가 어디인가요?", "어제 무엇을 먹었나요?", "약속을 내일로 바꿀 수 있나요?"], 2),
  ],
};
export function assessmentQuestions(language: Language) {
  return questions[language].map(({ id, prompt, choices }) => ({ id, prompt, choices }));
}
export function scoreAssessment(language: Language, raw: unknown): { score: number; level: LearningLevel } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("모든 문제에 답하거나 ‘모르겠어요’를 선택해 주세요.");
  const answers = raw as Record<string, unknown>;
  if (Object.keys(answers).length !== questions[language].length) throw new Error("모든 문제에 답해 주세요.");
  let correct = 0;
  for (const question of questions[language]) {
    const answer = answers[question.id];
    if (typeof answer !== "number" || !Number.isInteger(answer) || answer < -1 || answer >= question.choices.length) throw new Error("답안을 확인해 주세요.");
    if (answer === question.answer) correct++;
  }
  return { score: correct, level: correct <= 2 ? "beginner" : correct <= 4 ? "elementary" : "intermediate" };
}

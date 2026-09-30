import authoredPlans from "./v2-scene-plans.json";
import translatedRows from "./v2-scene-phrases.json";
import { clubLevels } from "./v2-club-lessons";

export type LessonPlan = {
  title: string;
  goal: string;
  context: string;
  instruction: string;
  cues: string[];
  rows: string;
};
const skills = [
  "Practice brief concrete statements and requests. Use one simple utterance at a time; help is optional. Do not require explanations.",
  "Practice short question-and-answer exchanges. Ask for or confirm a detail, then respond to the learner's actual answer.",
  "Practice reasons, comparisons and connected proposals. Elicit a preference plus a reason or a relevant follow-up.",
  "Practice clarification, tactful refusals, conditional alternatives and negotiating unexpected problems without inventing one on every turn.",
];
const clubContexts = [
  "클럽이나 바에서 처음 만난 사람과 짧게 이야기하고 필요한 것을 요청해요.",
  "옆 사람과 음악 취향을 나누고 함께할 활동을 정해요.",
  "음악에 대한 감상을 나눈 뒤 다음 활동을 제안해요.",
  "원치 않는 권유나 주문 착오가 생겨 정중하게 상황을 조율해요.",
];
const rowsByLesson: Record<string, string[][]> = translatedRows;
export const sceneLessonPlans: Record<string, LessonPlan[]> = {
  ...Object.fromEntries(
    Object.entries(authoredPlans).map(([scene, plans]) => [
      scene,
      plans.map((plan, i) => ({
        title: plan.title,
        goal: plan.goal,
        context: plan.context,
        instruction: `${skills[i]} Learning goal: ${plan.goal} Possible setting: ${plan.context} Use this as optional scaffolding, not a script to overwrite the ongoing conversation.`,
        cues: plan.steps.map((step) => step.cue),
        rows: rowsByLesson[`${scene}:${i + 1}`]
          .map((row) => row.join("|"))
          .join("\n"),
      })),
    ]),
  ),
  club: clubLevels.map((plan, i) => ({ ...plan, context: clubContexts[i] })),
};

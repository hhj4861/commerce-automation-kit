import { randomUUID } from "node:crypto";
import { addLearningRecord, getLearningRecords } from "./store";
import { learningProfile, type LearningEvent } from "./adaptive-learning";
import type { Language } from "./courses";

export async function readLearningProfile(actor: string, language: Language) {
  const events = (await getLearningRecords(actor, language)).map(raw => JSON.parse(raw) as LearningEvent);
  return learningProfile(events);
}
export async function recordLearningEvent(actor: string, language: Language, event: LearningEvent) {
  return addLearningRecord(actor, language, event.id, JSON.stringify(event));
}
export async function recordLearningChat(actor: string, language: Language, assessmentId: string, lessonId: string) {
  await recordLearningEvent(actor, language, { kind: "chat", id: randomUUID(), at: Date.now(), assessmentId, lessonId });
}

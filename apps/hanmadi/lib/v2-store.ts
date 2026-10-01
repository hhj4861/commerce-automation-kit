import { createHash } from "node:crypto";
import { readKnowledge, saveKnowledgeDraft } from "./knowledge-store";
import type { ContentDraft } from "./knowledge";
export type { ContentDraft } from "./knowledge";
import { v2Driver } from "./store";
import { ConversationError } from "./conversation";
import {
  emptyStudy,
  safePractice,
  type StudyState,
  type StudyLanguage,
  type Phrase,
  type Unit,
} from "./v2";
export async function readStudy(actor: string): Promise<StudyState> {
  const raw = await v2Driver().get(`study:${actor}`);
  return raw ? JSON.parse(raw) : emptyStudy();
}
export async function changeStudy(
  actor: string,
  change: (state: StudyState) => void,
): Promise<StudyState> {
  const db = v2Driver(),
    key = `study:${actor}`;
  for (let attempt = 0; attempt < 8; attempt++) {
    const raw = await db.get(key),
      state: StudyState = raw ? JSON.parse(raw) : emptyStudy();
    change(state);
    state.revision++;
    if (await db.cas(key, raw, JSON.stringify(state))) return state;
  }
  throw new ConversationError(
    409,
    "다른 화면에서 저장 중이에요. 다시 시도해 주세요.",
  );
}
export function expressionId(language: StudyLanguage, phrase: Phrase) {
  return createHash("sha256")
    .update(
      `${language}:${phrase.text
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[\s\p{P}]/gu, "")}`,
    )
    .digest("hex");
}
export async function saveExpression(
  actor: string,
  language: StudyLanguage,
  phrase: Phrase,
  source: "translation" | "chat" | "vocabulary",
  epoch: number,
  automatic = false,
) {
  let saved = false;
  const state = await changeStudy(actor, (state) => {
    saved = false;
    if (
      state.saveEpoch !== epoch ||
      (source === "translation" && !state.autoSave) ||
      (source === "chat" && automatic && state.autoSaveChat === false) ||
      !safePractice(phrase)
    )
      return;
    const id = expressionId(language, phrase);
    if (state.expressions.some((e) => e.id === id)) {
      saved = true;
      return;
    }
    if (state.expressions.length >= 500) return;
    state.expressions.push({
      ...phrase,
      id,
      language,
      source,
      createdAt: Date.now(),
      dueAt: Date.now(),
    });
    saved = true;
  });
  return { saved, state };
}
export async function readContent(): Promise<ContentDraft[]> {
  return (await readKnowledge()).drafts;
}
export async function writeContent(
  draft: Omit<ContentDraft, "id" | "revision" | "updatedAt"> & {
    id?: string;
    revision?: number;
  },
) {
  return saveKnowledgeDraft(draft);
}
export async function publishedUnits(): Promise<Unit[]> {
  return (await readContent())
    .filter((d) => d.status === "published")
    .flatMap((d) =>
      d.units.map((phrase, i) => ({
        id: `admin:${d.id}:${d.revision}:${i}`,
        language: d.language,
        scene: d.scene,
        level: d.level,
        title: d.title,
        phrase,
        source: "admin" as const,
      })),
    );
}

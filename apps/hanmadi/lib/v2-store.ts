import { createHash, randomUUID } from "node:crypto";
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
  source: "translation" | "chat",
  epoch: number,
) {
  let saved = false;
  const state = await changeStudy(actor, (state) => {
    saved = false;
    if (
      state.saveEpoch !== epoch ||
      (source === "translation" && !state.autoSave) ||
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
export type ContentDraft = {
  id: string;
  title: string;
  language: StudyLanguage;
  scene: string;
  level: number;
  sourceUrl: string;
  rights: string;
  units: Phrase[];
  status: "draft" | "published";
  revision: number;
  updatedAt: number;
};
export async function readContent(): Promise<ContentDraft[]> {
  const raw = await v2Driver().get("curriculum");
  return raw ? JSON.parse(raw) : [];
}
export async function writeContent(
  draft: Omit<ContentDraft, "id" | "revision" | "updatedAt"> & {
    id?: string;
    revision?: number;
  },
) {
  const db = v2Driver();
  const id = draft.id ?? randomUUID();
  for (let attempt = 0; attempt < 8; attempt++) {
    const raw = await db.get("curriculum");
    const items: ContentDraft[] = raw ? JSON.parse(raw) : [];
    const old = items.find((d) => d.id === id);
    if (draft.id && (!old || old.revision !== draft.revision))
      throw new ConversationError(
        409,
        "다른 관리자가 수정했어요. 새로 불러와 주세요.",
      );
    if (!old && items.length >= 200)
      throw new ConversationError(409, "콘텐츠 보관 한도에 도달했어요.");
    const updated = {
      ...draft,
      id,
      revision: (old?.revision ?? 0) + 1,
      updatedAt: Date.now(),
    };
    if (
      await db.cas(
        "curriculum",
        raw,
        JSON.stringify([...items.filter((d) => d.id !== id), updated]),
      )
    )
      return updated;
  }
  throw new ConversationError(409, "저장 중 충돌했어요. 다시 시도해 주세요.");
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

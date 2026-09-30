import { randomUUID } from "node:crypto";
import { v2Driver } from "./store";
import { ConversationError } from "./conversation";
import { safePractice, type Phrase, type StudyLanguage } from "./v2";
import { invalidateLearning } from "./learning-pipeline";
import {
  decodeKnowledge,
  type KnowledgeState,
  type ContentDraft,
  type KnowledgeEvent,
} from "./knowledge";

type Driver = Pick<ReturnType<typeof v2Driver>, "get" | "cas">;
export async function readKnowledge(db: Driver = v2Driver()) {
  return decodeKnowledge(await db.get("curriculum"));
}
export async function changeKnowledge<T>(
  change: (state: KnowledgeState) => T,
  db: Driver = v2Driver(),
): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const raw = await db.get("curriculum");
    const state = decodeKnowledge(raw);
    const result = change(state);
    if (await db.cas("curriculum", raw, JSON.stringify(state))) return result;
  }
  throw new ConversationError(
    409,
    "다른 화면에서 자료를 수정했어요. 다시 불러와 주세요.",
  );
}
function record(
  state: KnowledgeState,
  event: Omit<KnowledgeEvent, "id" | "at">,
) {
  state.events.push({ ...event, id: randomUUID(), at: Date.now() });
  state.events = state.events.slice(-500);
}
export async function contributionEpoch(
  actor: string,
  db: Driver = v2Driver(),
) {
  return (await readKnowledge(db)).epochs[actor] ?? "initial";
}
export type ContributionResult =
  | "not-requested"
  | "no-safe-expression"
  | "received"
  | "duplicate"
  | "withdrawn"
  | "full"
  | "unavailable";
export async function contribute(
  actor: string,
  language: StudyLanguage,
  phrase: Phrase,
  epoch: string,
  db: Driver = v2Driver(),
): Promise<ContributionResult> {
  if (!safePractice(phrase)) return "no-safe-expression";
  return changeKnowledge((state) => {
    if ((state.epochs[actor] ?? "initial") !== epoch) return "withdrawn";
    const own = state.contributions.filter((c) => c.actor === actor);
    if (
      own.some(
        (c) =>
          c.language === language &&
          c.phrase.text.normalize("NFKC") === phrase.text.normalize("NFKC"),
      )
    )
      return "duplicate";
    if (own.length >= 50 || state.contributions.length >= 500) return "full";
    state.contributions.push({
      id: randomUUID(),
      actor,
      language,
      phrase,
      createdAt: Date.now(),
      consentVersion: "shared-examples-v1",
      status: "pending",
    });
    return "received";
  }, db);
}
export async function withdrawContributions(
  actor: string,
  db: Driver = v2Driver(),
) {
  return changeKnowledge((state) => {
    const ids = new Set(
      state.contributions.filter((c) => c.actor === actor).map((c) => c.id),
    );
    const drafts = state.drafts.filter(
      (d) => d.contributionId && ids.has(d.contributionId),
    );
    const erased = new Set([...ids, ...drafts.map((d) => d.id)]);
    invalidateLearning(state, new Set(drafts.map((d) => d.id)), true);
    state.drafts = state.drafts.filter(
      (d) => !d.contributionId || !ids.has(d.contributionId),
    );
    state.contributions = state.contributions.filter((c) => c.actor !== actor);
    state.events = state.events.filter((e) => !erased.has(e.target));
    state.epochs[actor] = randomUUID(); // Invalidates all work started before withdrawal.
    record(state, { action: "withdrawn", target: "user-contributions" });
    return {
      removed: ids.size,
      unpublished: drafts.filter((d) => d.status === "published").length,
    };
  }, db);
}
export async function rejectContribution(id: string, db: Driver = v2Driver()) {
  return changeKnowledge((state) => {
    const item = state.contributions.find((c) => c.id === id);
    if (!item || item.status !== "pending")
      throw new ConversationError(
        409,
        "후보 상태가 바뀌었어요. 다시 불러와 주세요.",
      );
    item.status = "rejected";
    record(state, { action: "rejected", target: id });
  }, db);
}
export type ContentInput = Omit<
  ContentDraft,
  "id" | "revision" | "updatedAt"
> & { id?: string; revision?: number };
export async function saveKnowledgeDraft(
  input: ContentInput,
  db: Driver = v2Driver(),
) {
  const id = input.id ?? randomUUID();
  return changeKnowledge((state) => {
    const old = state.drafts.find((d) => d.id === id);
    if (input.id && (!old || old.revision !== input.revision))
      throw new ConversationError(
        409,
        "다른 관리자가 수정했거나 제공자가 자료를 회수했어요. 새로 불러와 주세요.",
      );
    if (!old && state.drafts.length >= 200)
      throw new ConversationError(409, "콘텐츠 보관 한도에 도달했어요.");
    // Provenance cannot be removed/replaced by a save request.
    const contributionId = old?.contributionId ?? input.contributionId;
    if (
      old &&
      input.contributionId &&
      old.contributionId !== input.contributionId
    )
      throw new ConversationError(
        409,
        "기존 교재의 제공 출처는 변경할 수 없어요.",
      );
    const candidate = contributionId
      ? state.contributions.find((c) => c.id === contributionId)
      : undefined;
    if (
      contributionId &&
      (!candidate ||
        candidate.status === "rejected" ||
        candidate.language !== input.language)
    )
      throw new ConversationError(
        409,
        "제공자가 회수했거나 사용할 수 없는 번역 후보예요.",
      );
    if (!old && candidate && candidate.status !== "pending")
      throw new ConversationError(409, "이미 교재로 가져온 후보예요.");
    const updated: ContentDraft = {
      ...input,
      id,
      revision: (old?.revision ?? 0) + 1,
      updatedAt: Date.now(),
      ...(contributionId ? { contributionId } : {}),
      ...((old?.sourceHash ?? input.sourceHash)
        ? { sourceHash: old?.sourceHash ?? input.sourceHash }
        : {}),
    };
    if (old) invalidateLearning(state, new Set([id]));
    state.drafts = [...state.drafts.filter((d) => d.id !== id), updated];
    if (candidate) candidate.status = "converted";
    record(state, {
      action:
        updated.status === "published"
          ? "published"
          : old?.status === "published"
            ? "unpublished"
            : "draft",
      target: id,
      revision: updated.revision,
    });
    return updated;
  }, db);
}

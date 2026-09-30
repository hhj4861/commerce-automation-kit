import { getConversationTutor } from "@/lib/conversation-access";
import {
  assertConversationOrigin,
  conversationFailure,
  conversationJson,
  readConversationJson,
} from "@/lib/conversation-http";
import { changeKnowledge, readKnowledge } from "@/lib/knowledge-store";
import {
  currentDataset,
  fail,
  jsonl,
  learning,
  makeDataset,
  saveEvaluation,
  validateCase,
} from "@/lib/learning-pipeline";
import {
  embeddingConfig,
  trainedAlias,
  trainingConfig,
  trainingPolicy,
} from "@/lib/learning-provider";
import {
  buildSemanticIndex,
  enableSemantic,
  evaluateSemantic,
} from "@/lib/learning-retrieval";
import {
  activateTraining,
  prepareTraining,
  refreshTraining,
  reviewTraining,
  submitTraining,
} from "@/lib/learning-training";
import { v2Driver } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 90;
async function owner() {
  if ((await getConversationTutor())?.r !== "owner")
    fail("소유자 계정으로 로그인해 주세요.", 403);
}
export async function GET() {
  try {
    await owner();
    const state = await readKnowledge(),
      l = learning(state),
      training = trainingConfig(),
      embedding = embeddingConfig();
    return conversationJson({
      published: state.drafts.filter((d) => d.status === "published"),
      datasets: l.datasets,
      cases: l.cases,
      evaluations: l.evaluations,
      jobs: l.jobs.map((j) => ({
        ...j,
        aliasReady: !!(j.resultModel && trainedAlias(j.resultModel)),
      })),
      index: l.index
        ? {
            datasetId: l.index.datasetId,
            model: l.index.model,
            createdAt: l.index.createdAt,
            count: l.index.keys.length,
          }
        : null,
      semanticEnabled: !!l.semanticEnabled,
      activeJobId: l.activeJobId ?? null,
      capabilities: {
        embeddingConfigured: !!embedding,
        trainingConfigured: !!training,
        trainingModel: training?.model ?? null,
        ...trainingPolicy(),
      },
    });
  } catch (e) {
    return conversationFailure(e);
  }
}
export async function POST(req: Request) {
  try {
    assertConversationOrigin(req);
    await owner();
    const b = (await readConversationJson(req)) as Record<string, unknown>;
    if (!b || typeof b.action !== "string")
      fail("학습 관리 작업을 확인해 주세요.");
    const id = typeof b.id === "string" ? b.id : "";
    if (
      [
        "build-index",
        "evaluate-semantic",
        "start-training",
        "activate-training",
      ].includes(String(b.action))
    ) {
      if (
        (await v2Driver().count(
          `learning-operations:${new Date().toISOString().slice(0, 10)}`,
        )) > 40
      )
        fail("오늘의 학습 관리 실행 한도에 도달했어요.", 429);
    }
    let result: unknown;
    switch (b.action) {
      case "dataset":
        result = await changeKnowledge((s) =>
          makeDataset(s, {
            name: b.name as string,
            sourceIds: b.sourceIds as string[],
            purpose: b.purpose as "retrieval" | "fine-tuning",
            trainingRights: b.trainingRights === true,
          }),
        );
        break;
      case "delete-dataset":
        result = await changeKnowledge((s) => {
          const l = learning(s);
          if (l.jobs.some((j) => j.datasetId === id))
            fail("학습 작업에 연결된 버전은 삭제할 수 없어요.", 409);
          l.datasets = l.datasets.filter((d) => d.id !== id);
          l.evaluations = l.evaluations.filter((e) => e.datasetId !== id);
          if (l.index?.datasetId === id) {
            delete l.index;
            l.semanticEnabled = false;
          }
          return { ok: true };
        });
        break;
      case "export": {
        if (!["train", "validation", "test"].includes(String(b.split)))
          fail("내보낼 자료 구분을 선택해 주세요.");
        const d = currentDataset(await readKnowledge(), id);
        return conversationJson({
          filename: `hanmadi-${d.id}-${b.split}.jsonl`,
          content: jsonl(d, b.split as "train" | "validation" | "test"),
        });
      }
      case "case":
        result = await changeKnowledge((s) => {
          const l = learning(s);
          if (l.cases.length >= 40)
            fail("평가 질문은 최대 40개로 구성해 주세요.");
          const c = validateCase(b.case, s);
          l.cases.push(c);
          l.semanticEnabled = false;
          return c;
        });
        break;
      case "delete-case":
        result = await changeKnowledge((s) => {
          const l = learning(s);
          l.cases = l.cases.filter((c) => c.id !== id);
          l.semanticEnabled = false;
          return { ok: true };
        });
        break;
      case "evaluate":
        result = await saveEvaluation(id);
        break;
      case "build-index":
        result = await buildSemanticIndex(id);
        break;
      case "evaluate-semantic":
        result = await evaluateSemantic(id);
        break;
      case "semantic":
        if (typeof b.enabled !== "boolean") fail("적용 여부를 확인해 주세요.");
        result = await enableSemantic(b.enabled as boolean);
        break;
      case "prepare-training":
        result = await prepareTraining(id);
        break;
      case "start-training":
        result = await submitTraining(id, b.confirmed === true);
        break;
      case "refresh-training":
        result = await refreshTraining(id);
        break;
      case "cancel-training":
        result = await refreshTraining(id, true);
        break;
      case "review-training":
        result = await reviewTraining(
          id,
          b.notes as string,
          b.confirmed === true,
        );
        break;
      case "activate-training":
        result = await activateTraining(id);
        break;
      case "delete-training-record":
        result = await changeKnowledge((s) => {
          const l = learning(s),
            job = l.jobs.find((j) => j.id === id);
          if (!job) fail("학습 작업을 찾지 못했어요.", 404);
          if (
            l.activeJobId === id ||
            !["succeeded", "failed", "cancelled"].includes(job!.status)
          )
            fail(
              "앱에 적용 중이 아니며 완료·실패·취소된 작업만 기록을 삭제할 수 있어요.",
              409,
            );
          l.jobs = l.jobs.filter((j) => j.id !== id);
          return { ok: true };
        });
        break;
      case "default-model":
        result = await changeKnowledge((s) => {
          delete learning(s).activeJobId;
          return { ok: true };
        });
        break;
      default:
        fail("지원하지 않는 학습 관리 작업이에요.");
    }
    return conversationJson({ result });
  } catch (e) {
    return conversationFailure(e);
  }
}

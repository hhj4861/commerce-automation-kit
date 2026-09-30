import { randomUUID } from "node:crypto";
import { changeKnowledge, readKnowledge } from "./knowledge-store";
import {
  currentDataset,
  datasetExamples,
  fail,
  jsonl,
  learning,
} from "./learning-pipeline";
import {
  providerRequest,
  remoteId,
  trainedAlias,
  trainingConfig,
  trainingPolicy,
  uploadTrainingFile,
} from "./learning-provider";
import type { TrainingJob } from "./learning-types";
import type { KnowledgeState } from "./knowledge";
import { getLiteLLMConfig } from "./conversation";

function jobIn(state: KnowledgeState, id: string) {
  const job = learning(state).jobs.find((j) => j.id === id);
  return job ?? fail("학습 작업을 찾지 못했어요.", 404);
}
async function update(id: string, mutate: (j: TrainingJob) => void) {
  return changeKnowledge((s) => {
    const j = jobIn(s, id);
    mutate(j);
    if (
      learning(s).activeJobId === j.id &&
      (j.status !== "succeeded" || !j.review)
    )
      delete learning(s).activeJobId;
    j.updatedAt = Date.now();
    return j;
  });
}
function remoteState(job: TrainingJob, data: Record<string, unknown>) {
  const status = String(data.status);
  if (
    ![
      "validating_files",
      "queued",
      "running",
      "succeeded",
      "failed",
      "cancelled",
    ].includes(status)
  )
    return fail("제공자의 학습 상태를 확인하지 못했어요.", 502);
  job.remoteId = remoteId(data.id);
  job.remoteStatus = status;
  job.status =
    status === "succeeded"
      ? "succeeded"
      : status === "failed"
        ? "failed"
        : status === "cancelled"
          ? "cancelled"
          : "submitted";
  const resultModel =
    status === "succeeded" ? remoteId(data.fine_tuned_model) : undefined;
  if (job.resultModel !== resultModel || status !== "succeeded")
    delete job.review;
  job.resultModel = resultModel;
  delete job.message;
}
export async function prepareTraining(datasetId: string) {
  const c = trainingConfig();
  if (!c)
    return fail("학습 전용 LiteLLM 주소·키·모델을 서버에 설정해 주세요.", 503);
  const policy = trainingPolicy();
  if (!policy.minimum)
    return fail(
      "제공자에서 확인한 최소 학습 예제 수를 서버에 설정해 주세요.",
      503,
    );
  return changeKnowledge((s) => {
    const dataset = currentDataset(s, datasetId),
      l = learning(s);
    if (dataset.purpose !== "fine-tuning")
      return fail("모델 학습용으로 권한을 확인한 자료 버전이 필요해요.");
    if (datasetExamples(dataset, "train").length < policy.minimum!)
      return fail(`학습 분할에 최소 ${policy.minimum}개 예제가 필요해요.`);
    if (
      l.jobs.some(
        (j) =>
          j.datasetId === datasetId &&
          !["failed", "cancelled"].includes(j.status),
      )
    )
      return fail(
        "이미 이 버전의 학습 작업이 있어요. 기존 작업 상태를 확인해 주세요.",
        409,
      );
    if (l.jobs.length >= 30)
      return fail("학습 작업 보관 한도에 도달했어요.", 409);
    const job: TrainingJob = {
      id: randomUUID(),
      datasetId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      target: c.model,
      configId: c.id,
      status: "prepared",
    };
    l.jobs.push(job);
    return job;
  });
}
export async function submitTraining(id: string, confirmed: boolean) {
  const c = trainingConfig(),
    policy = trainingPolicy();
  if (!c || !policy.enabled || !policy.minimum)
    return fail("학습 실행이 서버에서 활성화되지 않았어요.", 503);
  if (confirmed !== true)
    return fail("제공자 비용·데이터 전송을 확인한 후 학습을 시작해 주세요.");
  const dataset = await changeKnowledge((s) => {
    const j = jobIn(s, id),
      d = currentDataset(s, j.datasetId);
    if (j.status !== "prepared" || j.configId !== c.id)
      return fail(
        "이미 제출했거나 학습 서버 설정이 바뀌었어요. 상태를 확인해 주세요.",
        409,
      );
    if (datasetExamples(d, "train").length < policy.minimum!)
      return fail("최소 학습 예제 수를 다시 확인해 주세요.");
    j.status = "submitting";
    j.updatedAt = Date.now();
    return d;
  });
  try {
    const trainingFile = await uploadTrainingFile(
      c,
      jsonl(dataset, "train"),
      `${id}-train.jsonl`,
    );
    await update(id, (j) => {
      j.trainingFile = trainingFile;
    });
    const validationFile = await uploadTrainingFile(
      c,
      jsonl(dataset, "validation"),
      `${id}-validation.jsonl`,
    );
    await update(id, (j) => {
      j.validationFile = validationFile;
    });
    // A changed source must never cause an automatic resubmission of a snapshot.
    currentDataset(await readKnowledge(), dataset.id);
    const remote = await providerRequest(c, "/fine_tuning/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: c.model,
        training_file: trainingFile,
        validation_file: validationFile,
        suffix: "hanmadi",
      }),
    });
    return await update(id, (j) => remoteState(j, remote));
  } catch {
    await update(id, (j) => {
      j.status = "unknown";
      j.message =
        "제출 결과를 확인해야 해요. 중복 과금을 막기 위해 자동 재제출하지 않아요. 상태 조회 또는 제공자 콘솔에서 확인해 주세요.";
    });
    return fail(
      "학습 제출 결과가 불확실해요. 작업 목록에서 상태를 확인해 주세요.",
      502,
    );
  }
}
export async function refreshTraining(id: string, cancel = false) {
  const j = jobIn(await readKnowledge(), id),
    c = trainingConfig();
  if (!c || c.id !== j.configId)
    return fail("이 작업에 사용한 학습 서버 설정이 필요해요.", 409);
  if (j.status === "prepared" && cancel)
    return update(id, (j) => {
      j.status = "cancelled";
    });
  let rid = j.remoteId;
  if (!rid) {
    if (!j.trainingFile)
      return fail(
        "제공자 작업 번호가 없어요. 업로드 처리 여부를 제공자 콘솔에서 확인해 주세요.",
        409,
      );
    const response = await providerRequest(
      c,
      `/fine_tuning/jobs?target_model_names=${encodeURIComponent(c.model)}&limit=100`,
    );
    const matches = (Array.isArray(response.data) ? response.data : []).filter(
      (v: Record<string, unknown>) => v.training_file === j.trainingFile,
    );
    if (matches.length !== 1)
      return fail(
        "연결할 작업을 확정하지 못했어요. 제공자 콘솔에서 확인해 주세요. 자동 재제출은 하지 않아요.",
        409,
      );
    rid = remoteId(matches[0].id);
  }
  const response = await providerRequest(
    c,
    `/fine_tuning/jobs/${encodeURIComponent(rid)}${cancel ? "/cancel" : ""}`,
    { method: cancel ? "POST" : "GET" },
  );
  if (
    remoteId(response.id) !== rid ||
    response.training_file !== j.trainingFile
  )
    return fail("학습 파일과 작업 번호가 일치하지 않아요.", 502);
  return update(id, (job) => remoteState(job, response));
}
export async function reviewTraining(
  id: string,
  notes: string,
  confirmed: boolean,
) {
  if (
    confirmed !== true ||
    typeof notes !== "string" ||
    notes.trim().length < 20 ||
    notes.length > 1000
  )
    return fail(
      "분리된 시험셋으로 언어·뜻·난이도를 검수하고 결과를 20자 이상 기록해 주세요.",
    );
  return changeKnowledge((s) => {
    const j = jobIn(s, id);
    currentDataset(s, j.datasetId);
    if (j.status !== "succeeded" || !j.resultModel)
      return fail("완료된 학습 작업만 검수할 수 있어요.", 409);
    j.review = { at: Date.now(), notes: notes.trim() };
    return j;
  });
}
export async function activateTraining(id: string) {
  const state = await readKnowledge(),
    candidate = jobIn(state, id);
  currentDataset(state, candidate.datasetId);
  const alias = candidate.resultModel
    ? trainedAlias(candidate.resultModel)
    : null;
  if (candidate.status !== "succeeded" || !candidate.review || !alias)
    return fail(
      "학습 완료·시험셋 검수·서버 모델 별칭 등록을 확인해 주세요.",
      409,
    );
  const app = getLiteLLMConfig();
  const available = await providerRequest(
    {
      baseURL: app.baseUrl,
      apiKey: app.apiKey,
      model: alias,
      id: "app-inference",
    },
    "/models",
  );
  if (
    !Array.isArray(available.data) ||
    !available.data.some((m) => m && typeof m === "object" && m.id === alias)
  )
    return fail("앱의 LiteLLM 키로 결과 모델 별칭을 사용할 수 없어요.", 409);
  return changeKnowledge((s) => {
    const j = jobIn(s, id);
    currentDataset(s, j.datasetId);
    if (
      j.status !== "succeeded" ||
      !j.resultModel ||
      !j.review ||
      !trainedAlias(j.resultModel)
    )
      return fail(
        "학습 완료·시험셋 검수·서버의 모델 별칭 등록을 모두 확인해 주세요.",
        409,
      );
    learning(s).activeJobId = id;
    return j;
  });
}
export async function activeTrainingAlias(scope: {
  language: string;
  level: number;
  scene: string;
}) {
  const state = await readKnowledge(),
    l = learning(state);
  const j = l.jobs.find((j) => j.id === l.activeJobId);
  if (!j || j.status !== "succeeded" || !j.resultModel || !j.review)
    return null;
  // Invalidations clear activeJobId atomically. Also guard older data explicitly.
  if (
    !l.datasets.some(
      (d) =>
        d.id === j.datasetId &&
        !d.invalidatedAt &&
        d.drafts.every((snapshot) =>
          state.drafts.some(
            (live) =>
              live.id === snapshot.id &&
              live.revision === snapshot.revision &&
              live.status === "published",
          ),
        ) &&
        d.drafts.some(
          (d) =>
            d.language === scope.language &&
            d.level === scope.level &&
            d.scene === scope.scene,
        ),
    )
  )
    return null;
  return trainedAlias(j.resultModel);
}

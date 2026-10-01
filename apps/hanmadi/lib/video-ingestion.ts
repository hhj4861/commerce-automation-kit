import { createHash, randomUUID } from "node:crypto";
import { ConversationError } from "./conversation";
import { curriculum, isLevel, isStudyLanguage } from "./v2";
import { readKnowledge, saveKnowledgeDraft } from "./knowledge-store";
import { claimSlot, transientStore } from "./transient-store";
import { analyzeVideo, judgeVideo } from "./video-provider";
import { v2Driver } from "./store";
import {
  VIDEO_SELECTION_LIMIT,
  VIDEO_CONCURRENCY,
  VIDEO_RUBRIC,
  type VideoSettings,
  type VideoResult,
  type VideoAnalysis,
} from "./video-policy";
const TTL = 86400;
export const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function validateVideoBatch(b: Record<string, unknown>) {
  if (
    !Array.isArray(b.ids) ||
    b.ids.length < 1 ||
    b.ids.length > VIDEO_SELECTION_LIMIT ||
    b.ids.some(
      (id) => typeof id !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(id),
    ) ||
    new Set(b.ids).size !== b.ids.length
  )
    throw new ConversationError(
      400,
      `중복 없이 영상 1~${VIDEO_SELECTION_LIMIT}개를 선택해 주세요.`,
    );
  if (
    !isStudyLanguage(b.language) ||
    !isLevel(b.level) ||
    !curriculum.scenes.some((s) => s.id === b.scene)
  )
    throw new ConversationError(
      400,
      "자료의 학습 언어·상황·레벨을 선택해 주세요.",
    );
  return {
    ids: b.ids as string[],
    settings: { language: b.language, level: b.level, scene: String(b.scene) },
  };
}
export async function createVideoBatch(
  b: Record<string, unknown>,
  store = transientStore(),
) {
  const batch = validateVideoBatch(b);
  const id = hash({ ...batch, rubric: VIDEO_RUBRIC });
  await store.set("batch:" + id, JSON.stringify(batch), TTL);
  return { batchId: id };
}
export async function getVideoBatch(id: unknown, store = transientStore()) {
  if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id))
    throw new ConversationError(400, "분석 목록을 다시 준비해 주세요.");
  const raw = await store.get("batch:" + id);
  if (!raw)
    throw new ConversationError(
      410,
      "분석 목록의 24시간 보관 기간이 지났어요. 영상을 다시 선택해 주세요.",
    );
  return JSON.parse(raw) as { ids: string[]; settings: VideoSettings };
}
export function videoJobKey(id: string, settings: VideoSettings) {
  return hash({
    id,
    settings,
    rubric: VIDEO_RUBRIC,
    model: process.env.HANMADI_VIDEO_MODEL || process.env.LITELLM_MODEL,
  });
}
const defaults = () => ({
  store: transientStore(),
  analyze: analyzeVideo,
  judge: judgeVideo,
  read: readKnowledge,
  save: saveKnowledgeDraft,
  count: () =>
    v2Driver().count(`video-analysis:${new Date().toISOString().slice(0, 10)}`),
});
export async function processVideo(
  id: string,
  settings: VideoSettings,
  deps = defaults(),
): Promise<VideoResult> {
  const { store } = deps;
  const key = videoJobKey(id, settings),
    resultKey = "result:" + key;
  const cached = await store.get(resultKey);
  if (cached) return JSON.parse(cached);
  const token = randomUUID(),
    lock = "video-lock:" + key;
  if (!(await store.claim(lock, token, 150)))
    return { state: "running", message: "이미 이 영상을 처리하고 있어요." };
  let release: (() => Promise<void>) | null = null;
  try {
    const done = await store.get(resultKey);
    if (done) return JSON.parse(done);
    // sourceHash is durable idempotency, even after cache expiry or a lost save response.
    const existing = (await deps.read()).drafts.find(
      (d) => d.sourceHash === key,
    );
    if (existing)
      return {
        state: "created",
        draft: existing,
        message: "이미 저장한 자료를 불러왔어요.",
      };
    release = await claimSlot(store, "video-slots", VIDEO_CONCURRENCY);
    if (!release)
      return {
        state: "running",
        message: "동시 분석 3개가 진행 중이에요. 잠시 후 자동으로 이어집니다.",
      };
    const analysisKey = "analysis:" + key;
    const raw = await store.get(analysisKey);
    let analysis: VideoAnalysis;
    if (raw) analysis = JSON.parse(raw);
    else {
      if ((await deps.count()) > 50)
        throw new ConversationError(
          429,
          "오늘의 새 영상 분석 한도(50개)에 도달했어요.",
        );
      analysis = await deps.analyze(id, settings);
      await store.set(analysisKey, JSON.stringify(analysis), TTL);
    }
    // Serialize judgment+save across instances so each video sees preceding accepted drafts.
    const judgeLock = "video-judge",
      judgeToken = randomUUID();
    let claimed = false;
    for (let i = 0; i < 50; i++) {
      claimed = await store.claim(judgeLock, judgeToken, 25);
      if (claimed) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!claimed)
      return {
        state: "running",
        message: "분석은 완료됐어요. 앞선 자료의 JEV 평가를 기다리고 있어요.",
      };
    try {
      const before = await deps.read();
      const existing = before.drafts.find((d) => d.sourceHash === key);
      if (existing)
        return {
          state: "created",
          draft: existing,
          message: "이미 저장한 자료를 불러왔어요.",
        };
      const judged = await deps.judge(analysis, before.drafts, settings);
      const units = analysis.units
        .filter((_, i) => judged.judgments[i]?.accepted)
        .map(({ text, meaning, reading }) => ({ text, meaning, reading }));
      let result: VideoResult;
      if (!units.length)
        result = {
          state: "skipped",
          message:
            "중복·학습 적합성·근거 또는 확신 기준을 통과한 표현이 없어 저장하지 않았어요.",
          judgments: judged.judgments,
        };
      else {
        const draft = await deps.save(
          {
            ...settings,
            title: analysis.title,
            sourceUrl: `https://www.youtube.com/watch?v=${id}`,
            rights:
              "공개 영상 공식 URL 분석을 참고한 자체 학습 표현. 게시 전 내용·출처·이용 범위 검수 필요.",
            sourceHash: key,
            units,
            status: "draft",
            videoReview: {
              rubric: VIDEO_RUBRIC,
              model: judged.model,
              judgments: judged.judgments,
              comparedCount: judged.comparedCount,
              referenceCount: judged.referenceCount,
              evidence: analysis.units.map(({ at, evidence }) => ({
                at,
                evidence,
              })),
              analyzedAt: Date.now(),
            },
          },
          undefined,
          hash(before.drafts),
        );
        result = {
          state: "created",
          draft,
          judgments: judged.judgments,
          message: `JEV 평가 통과 ${units.length}개 표현을 초안으로 저장했어요.`,
        };
      }
      await store.set(resultKey, JSON.stringify(result), TTL);
      return result;
    } finally {
      await store.release(judgeLock, judgeToken);
    }
  } catch (e) {
    return {
      state: "failed",
      message:
        e instanceof ConversationError
          ? e.message
          : "처리 결과를 확인하지 못했어요. 다시 시도하면 저장된 결과부터 확인해요.",
    };
  } finally {
    if (release) await release();
    await store.release(lock, token);
  }
}

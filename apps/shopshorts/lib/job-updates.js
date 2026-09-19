import { videoGenerationProblem } from './video-generation.js';

/** 저장 충돌만 최대 3회 재시도. 매번 최신 상태로 패치를 다시 계산한다. */
export async function updateJobWithRetry(api, id, patch) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { jobs } = await api('/api/jobs');
    const fresh = jobs.find((j) => j.brief.id === id);
    if (!fresh) throw new Error(`잡 소실: ${id}`);
    const delta = await patch(fresh);
    if (delta === null) return fresh;
    const next = { ...fresh, ...delta };
    if (next.status === 'script-approved' && next.videoGeneration && await videoGenerationProblem(next)) {
      delete next.videoGeneration;
    }
    try {
      await api(`/api/jobs/${id}`, {
        method: 'PUT', headers: { 'content-type': 'application/json', 'x-shopshorts-worker': '1' },
        body: JSON.stringify(next),
      });
      return next;
    } catch (error) {
      if (error.status !== 409 || attempt === 2) throw error;
    }
  }
}

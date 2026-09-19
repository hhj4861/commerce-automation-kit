// Versioned, provider-neutral events. Only the delivery adapter changes for SQS/Pub/Sub.
const stages = { draft: '기획을 확인해 주세요', generated: '클립 생성이 완료됐어요', assembled: '영상 검수를 준비해 주세요', review: '발행 검수를 기다리고 있어요', rejected: '기획 수정이 필요해요', published: '발행 완료로 기록됐어요' };
const failed = state => ['error', 'failed'].includes(state);
export function jobObservations(job) {
  const id = job.brief?.id;
  if (!id) return [];
  const base = { source: 'job', sourceId: id, name: String(job.brief.productName || '쇼츠 작업').slice(0, 160), href: `/?job=${encodeURIComponent(id)}` };
  return [
    { key: `job:${id}:generation-error`, fingerprint: job.videoGenerationError ? 'failed' : '', event: job.videoGenerationError ? { ...base, title: '영상 생성 계획을 확인해 주세요', kind: 'error' } : null },
    { key: `job:${id}:status`, fingerprint: job.status || '', event: stages[job.status] ? { ...base, title: stages[job.status], kind: job.status === 'rejected' ? 'warning' : 'info' } : null },
    ...['finalize', 'upload', 'videoGeneration'].map(part => ({
      key: `job:${id}:${part}`, fingerprint: job[part]?.state || '',
      event: failed(job[part]?.state) ? { ...base, title: { finalize: '영상 조립에 실패했어요', upload: '업로드 결과를 확인해 주세요', videoGeneration: '영상 생성에 실패했어요' }[part], kind: 'error' }
        : part === 'upload' && job.upload?.state === 'done' ? { ...base, title: '업로드가 완료됐어요', kind: 'success' } : null,
    })),
  ];
}
export function studioObservations(project) {
  const task = project.task;
  return [{
    key: `studio:${project.id}:task`, fingerprint: `${task?.id || ''}:${task?.state || ''}`,
    event: task && ['done', 'failed'].includes(task.state) ? {
      source: 'studio', sourceId: project.id, name: String(project.title || '영상 제작').slice(0, 160),
      title: task.state === 'failed' ? '영상 제작 작업에 실패했어요' : `${({ scenario: '시나리오 작성', render: '영상 조립', publish: '업로드', media: '소재 생성' })[task.action] || '영상 제작 작업'} 완료`,
      kind: task.state === 'failed' ? 'error' : 'success', href: `/studio?id=${encodeURIComponent(project.id)}`,
    } : null,
  }];
}

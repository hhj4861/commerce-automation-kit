// Public YouTube metadata only. Never infer an official Shorts flag from duration.
export const METADATA_MAX_BYTES = 50 * 1024 * 1024;
const bad = message => { throw new Error(message); };
export function threeMonthPeriod(now = new Date()) {
  const end = new Date(now), start = new Date(end);
  const day = start.getUTCDate();
  start.setUTCDate(1); start.setUTCMonth(start.getUTCMonth() - 3);
  const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(day, last));
  return {start: start.toISOString(), end: end.toISOString()};
}
export function hashtags(value) {
  if (!Array.isArray(value)) bad('해시태그 목록을 완성하지 못했습니다. 다시 추천받으세요.');
  const tags = [...new Set(value.map(t => typeof t === 'string' ? t.normalize('NFKC').replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '') : '').filter(Boolean))].map(t => '#' + t);
  if (!tags.length || tags.length > 25 || tags.some(t => t.length > 60)) bad('해시태그 길이와 개수를 확인하세요.');
  return tags;
}
export function publicHashtags(title, description) {
  return [...new Set((`${title}\n${description}`.match(/#[\p{L}\p{N}_]+/gu) || []))].slice(0, 40);
}
export function seconds(value) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value || '');
  return m ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0) : 0;
}
export function benchmarkVideo(item, period, format) {
  const s = item.snippet || {}, count = item.statistics?.viewCount;
  const published = Date.parse(s.publishedAt), duration = seconds(item.contentDetails?.duration);
  if (!/^[\w-]{11}$/.test(item.id || '') || !Number.isFinite(published) || published < Date.parse(period.start) || published > Date.parse(period.end)) return null;
  if (!duration || (format === 'short' ? duration > 180 : duration <= 180) || !/^\d+$/.test(String(count ?? ''))) return null;
  if (s.liveBroadcastContent && s.liveBroadcastContent !== 'none') return null;
  const views = Number(count); if (!Number.isSafeInteger(views)) return null;
  return {id: item.id, url: `https://www.youtube.com/watch?v=${item.id}`, title: String(s.title || '').slice(0, 300), description: String(s.description || '').slice(0, 5000), channel: String(s.channelTitle || '').slice(0, 200), channelId: s.channelId, publishedAt: s.publishedAt, views, duration, checkedAt: period.end, formatStatus: format === 'short' ? 'short-candidate' : 'long', hashtags: publicHashtags(s.title, s.description)};
}
export async function researchYouTube(analysis, format, env, {fetcher = fetch, now = new Date()} = {}) {
  if (!env.YOUTUBE_API_KEY) bad('유사 영상 조사를 위한 YouTube 연결이 필요합니다. 관리자에게 연결을 요청하세요.');
  const period = threeMonthPeriod(now), ids = new Set(), failures = [];
  async function get(resource, params) {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
    for (const [key, value] of Object.entries({...params, key: env.YOUTUBE_API_KEY})) url.searchParams.set(key, String(value));
    let response;
    try { response = await fetcher(url, {signal: AbortSignal.timeout(30000)}); }
    catch { bad('YouTube 자료에 연결하지 못했습니다. 잠시 후 다시 시도하세요.'); }
    if (!response.ok) bad(`YouTube 자료 조회에 실패했습니다(${response.status}). 연결과 이용 한도를 확인하세요.`);
    return response.json();
  }
  for (const q of analysis.queries.slice(0, 2)) {
    try {
      const result = await get('search', {part: 'snippet', type: 'video', q, publishedAfter: period.start, publishedBefore: period.end, order: 'viewCount', maxResults: 25, relevanceLanguage: analysis.language || 'ko', ...(format === 'short' ? {videoDuration: 'short'} : {})});
      for (const item of result.items || []) if (/^[\w-]{11}$/.test(item.id?.videoId || '')) ids.add(item.id.videoId);
    } catch (error) { failures.push(error.message); }
  }
  if (failures.length === analysis.queries.slice(0, 2).length) bad(failures[0]);
  const data = ids.size ? await get('videos', {part: 'snippet,contentDetails,statistics', id: [...ids].slice(0, 50).join(',')}) : {items: []};
  const candidates = (data.items || []).filter(item => ids.has(item.id)).map(item => benchmarkVideo(item, period, format)).filter(Boolean).sort((a, b) => b.views - a.views);
  return {period, checkedAt: period.end, candidates, failures, formatCaveat: format === 'short' ? '공개 자료로는 쇼츠 여부를 확정할 수 없습니다. 3분 이하 영상을 후보로 조사했으며, 쇼츠로 확인된 표본과 구분합니다.' : '3분을 넘는 일반 영상을 조사했습니다. 짧은 일반 영상은 포함하지 않았습니다.'};
}
const required = (v, max, label) => typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : bad(`${label} 분석 결과가 올바르지 않습니다. 다시 시도하세요.`);
export function parseAnalysis(value, media) {
  const observations = value?.observations;
  if (!Array.isArray(observations) || observations.length < 3 || observations.length > 16) bad('영상 장면 근거가 부족합니다. 다시 분석하세요.');
  const rows = observations.map(o => {
    if (!Number.isFinite(o.at) || o.at < 0 || o.at > media.duration) bad('장면 분석 시간이 영상 범위를 벗어났습니다.');
    return {at: o.at, visual: required(o.visual, 800, '화면'), subtitle: String(o.subtitle || '').slice(0, 1000), speech: String(o.speech || '').slice(0, 1000)};
  });
  if (!rows.some(o => o.at <= media.duration * .2) || !rows.some(o => o.at >= media.duration * .7)) bad('영상의 도입과 결말을 모두 확인하지 못했습니다. 다시 분석하세요.');
  if (!Array.isArray(value.queries)) bad('유사 영상 검색어가 올바르지 않습니다.');
  const queries = [...new Set(value.queries.map(q => required(q, 120, '검색어')))];
  if (!queries.length || queries.length > 2) bad('유사 영상 검색어가 올바르지 않습니다.');
  if (!Array.isArray(value.facts) || !value.facts.length || value.facts.length > 12) bad('영상에 근거한 핵심 내용을 확인하지 못했습니다.');
  return {category: required(value.category, 80, '카테고리'), subject: required(value.subject, 200, '소재'), summary: required(value.summary, 2000, '내용'), language: /^[a-z]{2}$/.test(value.language) ? value.language : 'ko', facts: value.facts.map(v => required(v, 800, '핵심 내용')), uncertainties: (Array.isArray(value.uncertainties) ? value.uncertainties : []).slice(0, 10).map(v => String(v).slice(0, 500)), observations: rows, media, queries};
}
export function parseMetadata(value, research) {
  if (!Array.isArray(value?.suggestions) || value.suggestions.length !== 3) bad('서로 다른 추천안 3개를 완성하지 못했습니다. 다시 시도하세요.');
  const candidates = new Map(research.candidates.map(v => [v.id, v]));
  if (!Array.isArray(value.references) || value.references.length > 5) bad('참고 영상 목록이 올바르지 않습니다.');
  const seen = new Set();
  const references = value.references.map(ref => {
    if (!candidates.has(ref.id) || seen.has(ref.id)) bad('확인하지 않은 참고 영상이 포함됐습니다. 다시 시도하세요.');
    seen.add(ref.id);
    return {...candidates.get(ref.id), relevance: required(ref.relevance, 600, '관련성'), pattern: required(ref.pattern, 1000, '참고 방식')};
  });
  const suggestions = value.suggestions.map(v => {
    const referenceIds = v.referenceIds || [];
    if (!Array.isArray(referenceIds) || referenceIds.some(id => !seen.has(id))) bad('추천 근거가 확인한 참고 영상과 일치하지 않습니다.');
    return {type: required(v.type, 40, '추천 유형'), title: required(v.title, 100, '제목'), description: required(v.description, 3000, '설명'), hashtags: hashtags(v.hashtags), reason: required(v.reason, 800, '추천 이유'), referenceIds: [...new Set(referenceIds)]};
  });
  if (suggestions.some(s => (s.description+'\n\n'+s.hashtags.join(' ')).length > 4000)) bad('설명과 해시태그가 게시 입력란의 길이를 넘었습니다. 다시 시도하세요.');
  if (new Set(suggestions.map(s => s.title)).size !== 3 || new Set(suggestions.map(s => s.type)).size !== 3) bad('추천 제목과 유형이 중복됩니다. 다시 시도하세요.');
  return {suggestions, references, limitations: [...research.failures, research.formatCaveat, ...(references.length < 3 ? ['최근 3개월의 관련 표본이 3개 미만입니다. 인기 흐름으로 일반화하기 어렵습니다.'] : []), ...(Array.isArray(value.limitations) ? value.limitations.slice(0, 6).map(v => String(v).slice(0, 600)) : [])], period: research.period, checkedAt: research.checkedAt};
}

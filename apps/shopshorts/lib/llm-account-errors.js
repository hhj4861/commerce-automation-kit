// Only these fixed diagnostics may cross the runner boundary. Never return CLI
// stdout/stderr: login output can contain authorization URLs and credentials.
const messages = Object.freeze({
  DISCOVERY_RESEARCH_UNGROUNDED: 'AI가 고른 대상명을 인용된 검색 자료에서 확인하지 못해 추천을 보류했어요. 주제나 조건을 좁혀 다시 추천받아 주세요.',
  DISCOVERY_NO_ACCEPTED_CANDIDATES: '검색 근거와 새로움을 모두 충족한 후보를 찾지 못했어요. 관심사를 더 구체화해 주세요.',
  DISCOVERY_BUDGET_LIMIT: '오늘의 주제 검증 요청 한도에 도달했어요. 한도가 회복된 뒤 다시 시도해 주세요.',
  DISCOVERY_IN_PROGRESS: '이전 주제 검증이 진행 중이에요. 완료 후 결과를 확인해 주세요.',
  DISCOVERY_UNAVAILABLE: '공통 주제 검증을 완료하지 못했어요. 잠시 후 다시 시도하고, 반복되면 운영자에게 확인을 요청해 주세요.',
  RECOMMENDATION_CASE_INVALID: '실제 건축 사례와 확인 가능한 출처를 갖춘 기획을 완성하지 못했어요. 다시 추천받아 주세요.',
  CODEX_AUTH_FAILED: 'Codex 인증이 만료되었거나 유효하지 않습니다. 계정을 다시 연결해 주세요.',
  CODEX_RATE_LIMITED: 'Codex 구독 사용 한도에 도달했습니다. 한도가 회복된 뒤 다시 시도해 주세요.',
  CODEX_NETWORK_FAILED: 'Codex 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  CODEX_TIMEOUT: 'Codex 응답 시간이 초과됐습니다. 잠시 후 다시 시도해 주세요.',
  CODEX_NOT_INSTALLED: '실행기에 Codex가 설치되어 있지 않습니다. 운영자에게 확인을 요청해 주세요.',
  CODEX_RUNTIME_FAILED: 'Codex 실행 환경을 준비하지 못했습니다. 운영자에게 확인을 요청해 주세요.',
  CODEX_OUTPUT_INVALID: 'Codex 생성 결과를 읽지 못했습니다. 다시 시도해 주세요.',
  CODEX_REQUEST_FAILED: 'Codex 요청을 완료하지 못했습니다. 잠시 후 다시 시도하고, 반복되면 운영자에게 확인을 요청해 주세요.',
  RECOMMENDATION_REPEATED: '이전 추천과 다른 기획을 완성하지 못했어요. 관심사를 구체화한 뒤 다시 추천받으세요.',
  SCENARIO_RESEARCH_INCOMPLETE: '추가 조사 후에도 핵심 질문에 답할 근거가 부족해 대본 작성 전에 멈췄어요. 질문을 구체화하거나 확인 가능한 자료를 보완해 주세요.',
  SCENARIO_RESEARCH_REVIEW_INVALID: '조사 검토 결과의 근거 인용·형식을 확인하지 못했어요. 근거 부족 판정과는 다른 오류입니다.',
  SCENARIO_RESEARCH_INVALID: '주제를 뒷받침할 검색 근거를 확인하지 못했어요. 주제를 구체화해 다시 시도해 주세요.',
  SCENARIO_FORMAT_INVALID: '대본의 장면 형식 또는 목표 길이를 맞추지 못했어요. 다시 생성해 주세요.',
  SCENARIO_REVIEW_INVALID: '대본 검토 결과의 인용·형식을 확인하지 못했어요. 대본 내용 부족 판정과는 다른 오류입니다. 다시 검토해 주세요.',
  SCENARIO_DEPTH_INVALID: '대본의 이유·작동 과정·예시 또는 마무리 설명이 부족해 제작을 멈췄어요. 주제 범위를 좁혀 시나리오를 다시 생성해 주세요.',
  SCENARIO_ARC_INVALID: '도입·킬링파트·마무리가 연결된 대본을 완성하지 못했습니다. 시나리오를 다시 생성해 주세요.',
  SCENARIO_DIRECTION_INVALID: '영상의 공통 연출과 장면별 구도를 완성하지 못했어요. 대본을 다시 생성해 주세요.',
  CLAUDE_LOGIN_RUNTIME_MISSING: 'Claude 연결 실행 환경이 준비되지 않았습니다. 운영자에게 확인을 요청해 주세요.',
  CLAUDE_LOGIN_FAILED: 'Claude 로그인을 완료하지 못했습니다. 다시 연결하고 새 인증 코드를 입력해 주세요.',
  CLAUDE_AUTH_FAILED: 'Claude 인증을 확인하지 못했습니다. 계정을 다시 연결해 주세요.',
  CLAUDE_KEYCHAIN_FAILED: '실행기에서 Claude 인증 정보에 접근하지 못했습니다. 운영자가 Mac 키체인 접근 상태를 확인해야 합니다.',
  CLAUDE_CREDENTIAL_FAILED: 'Claude 인증 정보를 저장하지 못했습니다. 운영자에게 실행기 확인을 요청해 주세요.',
  CLAUDE_RATE_LIMITED: 'Claude 구독 사용 한도에 도달했습니다. 한도가 회복된 뒤 다시 시도해 주세요.',
  CLAUDE_NETWORK_FAILED: 'Claude 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  CLAUDE_TIMEOUT: 'Claude 응답 시간이 초과됐습니다. 잠시 후 다시 시도해 주세요.',
  CLAUDE_NOT_INSTALLED: '실행기에 Claude가 설치되어 있지 않습니다. 운영자에게 확인을 요청해 주세요.',
  CLAUDE_OUTPUT_INVALID: 'Claude 추천 결과를 읽지 못했습니다. 다시 추천받아 주세요.',
  CLAUDE_REQUEST_FAILED: 'Claude 요청을 완료하지 못했습니다. 다시 시도하고, 반복되면 운영자에게 확인을 요청해 주세요.',
});
export const claudeFailure = (code = 'CLAUDE_REQUEST_FAILED') => Object.assign(new Error(messages[code] || messages.CLAUDE_REQUEST_FAILED), { code });
export const codexFailure = (code = 'CODEX_REQUEST_FAILED', status = 502) => Object.assign(new Error(messages[code] || messages.CODEX_REQUEST_FAILED), { code, status });
export const accountFailureCode = error => Object.hasOwn(messages, error?.code) ? error.code : 'UNKNOWN';
export function accountFailureMessage(provider, error) {
  const code = accountFailureCode(error);
  if(code==='SCENARIO_FORMAT_INVALID' && typeof error?.validationIssue?.path==='string'){
    // Persist a useful diagnosis through the existing safe message transport.
    // Only fixed field names become labels; input values and rule text stay private.
    const path=error.validationIssue.path;
    const match=/^scenes\[(\d{1,2})\]\.(.+)$/.exec(path);
    const key=(match?match[2]:path).replace(/\[\d{1,2}\]/g,'');
    const labels={'scenes':'장면 목록','scenes[].duration':'전체 길이','duration':'장면 길이','scene':'장면 형식','id':'장면 구분','narration':'대사','prompt':'화면 설명','camera':'카메라 움직임','shot':'장면 구도','hybrid.renderer':'제작 방식','hybrid.focus':'확대할 대상','hybrid.depth':'구조도 깊이','hybrid.authored':'등록된 3D 장면','hybrid.parts':'건축 부품 구성','hybrid.parts.layerId':'건축 부품 연결','hybrid.parts.material':'건축 부품 재질','hybrid.parts.offset':'부품 깊이 위치','hybrid.parts.hinge':'부품 회전 설정','visualDirection.treatment':'장면 설명 방식','kind':'장면 유형','title':'제목','webtoon':'웹툰 구성','webtoon.artPrompt':'웹툰 원화 설명','webtoon.answer':'장면의 설명 목적','webtoon.layers':'움직이는 대상 구성','webtoon.layers.id':'대상 구분','webtoon.layers.label':'대상 이름','webtoon.layers.meaning':'대상과 대사의 연결','webtoon.layers.shape':'도형 종류','webtoon.layers.color':'대상 색상','webtoon.layers.from':'동작 시작 위치','webtoon.layers.to':'동작 종료 위치','webtoon.layers.size':'대상 크기','webtoon.layers.start':'동작 시작 시점','webtoon.layers.end':'동작 종료 시점','webtoon.layers.motion':'동작 종류','webtoon.layers.points':'도형 좌표'};
    if(Object.hasOwn(labels,key))return `${messages[code]} 확인 항목: ${match?`${Number(match[1])+1}번 장면의 `:''}${labels[key]}.`;
  }
  if(code==='SCENARIO_RESEARCH_INCOMPLETE' && Array.isArray(error?.failedChecks)){
    const labels={focus:'선택한 질문의 답',why:'기존 문제와 선택 이유',mechanism:'변화가 생기는 작동 과정',example:'해당 사례의 적용 근거',payoff:'결과와 적용 한계'};
    const missing=Object.keys(labels).filter(k=>error.failedChecks.includes(k)).map(k=>labels[k]);
    if(missing.length)return `${messages[code]} 확인 항목: ${missing.join(', ')}.`;
  }
  if(code==='SCENARIO_DEPTH_INVALID' && Array.isArray(error?.failedChecks)){
    const labels={focus:'질문과 답의 일치',why:'필요한 이유',mechanism:'작동 과정',example:'구체적 예시',payoff:'완결된 답',pacing:'설명 호흡',visuals:'대사와 화면의 연결'};
    const missing=Object.keys(labels).filter(key=>error.failedChecks.includes(key)).map(key=>labels[key]);
    if(missing.length)return `대본 검토에서 보완이 필요해 제작을 멈췄어요. 확인할 항목: ${missing.join(', ')}. 이 부분을 구체화해 다시 생성해 주세요.`;
  }
  if (code.startsWith('DISCOVERY_')) return messages[code];
  if (['SCENARIO_RESEARCH_INCOMPLETE', 'SCENARIO_RESEARCH_REVIEW_INVALID', 'SCENARIO_REVIEW_INVALID', 'SCENARIO_FORMAT_INVALID', 'SCENARIO_DEPTH_INVALID', 'SCENARIO_RESEARCH_INVALID', 'SCENARIO_ARC_INVALID', 'SCENARIO_DIRECTION_INVALID', 'RECOMMENDATION_REPEATED', 'RECOMMENDATION_CASE_INVALID'].includes(code)) return messages[code];
  return provider === 'claude' ? messages[code] || messages.CLAUDE_REQUEST_FAILED
    : code.startsWith('CODEX_') ? messages[code] : messages.CODEX_REQUEST_FAILED;
}
export function classifyCodexFailure(text = '') {
  if (/usage_limit_reached|rate_limit|rate limit|usage limit|hit your limit|exceeded.*limit|\b429\b/i.test(text)) return 'CODEX_RATE_LIMITED';
  if (/authentication_error|invalid_grant|refresh_token_reused|invalid.*token|expired.*token|token.*expired|not logged in|login expired|\b401\b/i.test(text)) return 'CODEX_AUTH_FAILED';
  if (/ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|unable to connect|network error|connection.*(?:closed|reset)|error sending request|stream disconnected/i.test(text)) return 'CODEX_NETWORK_FAILED';
  if (/timed? out|timeout/i.test(text)) return 'CODEX_TIMEOUT';
  if (/model.*(?:not found|not supported|does not exist)|error loading config|unexpected argument/i.test(text)) return 'CODEX_RUNTIME_FAILED';
  return 'CODEX_REQUEST_FAILED';
}
export function classifyClaudeFailure(text) {
  if (/keychain|errSec|user interaction is not allowed/i.test(text)) return 'CLAUDE_KEYCHAIN_FAILED';
  if (/rate_limit|rate limit|usage limit|hit your limit|exceeded.*limit|\b429\b/i.test(text)) return 'CLAUDE_RATE_LIMITED';
  if (/authentication_error|invalid_grant|invalid.*(?:token|code)|expired.*(?:token|code)|(?:token|code).*expired|not logged in|login expired|\b401\b/i.test(text)) return 'CLAUDE_AUTH_FAILED';
  if (/ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|unable to connect|network error/i.test(text)) return 'CLAUDE_NETWORK_FAILED';
  return 'CLAUDE_REQUEST_FAILED';
}

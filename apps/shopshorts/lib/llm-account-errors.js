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
  SCENARIO_RESEARCH_INVALID: '주제를 뒷받침할 검색 근거를 확인하지 못했어요. 주제를 구체화해 다시 시도해 주세요.',
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
  if (code.startsWith('DISCOVERY_')) return messages[code];
  if (['SCENARIO_DEPTH_INVALID', 'SCENARIO_RESEARCH_INVALID', 'SCENARIO_ARC_INVALID', 'SCENARIO_DIRECTION_INVALID', 'RECOMMENDATION_REPEATED', 'RECOMMENDATION_CASE_INVALID'].includes(code)) return messages[code];
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

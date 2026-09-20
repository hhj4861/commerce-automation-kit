// Only these fixed diagnostics may cross the runner boundary. Never return CLI
// stdout/stderr: login output can contain authorization URLs and credentials.
const messages = Object.freeze({
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
export const accountFailureCode = error => Object.hasOwn(messages, error?.code) ? error.code : 'UNKNOWN';
export function accountFailureMessage(provider, error) {
  const code = accountFailureCode(error);
  return provider === 'claude' ? messages[code] || messages.CLAUDE_REQUEST_FAILED
    : 'Codex 요청을 완료하지 못했습니다. 다시 시도하고, 반복되면 계정 연결 상태를 확인해 주세요.';
}
export function classifyClaudeFailure(text) {
  if (/keychain|errSec|user interaction is not allowed/i.test(text)) return 'CLAUDE_KEYCHAIN_FAILED';
  if (/rate_limit|rate limit|usage limit|hit your limit|exceeded.*limit|\b429\b/i.test(text)) return 'CLAUDE_RATE_LIMITED';
  if (/authentication_error|invalid_grant|invalid.*(?:token|code)|expired.*(?:token|code)|(?:token|code).*expired|not logged in|login expired|\b401\b/i.test(text)) return 'CLAUDE_AUTH_FAILED';
  if (/ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|unable to connect|network error/i.test(text)) return 'CLAUDE_NETWORK_FAILED';
  return 'CLAUDE_REQUEST_FAILED';
}

// Explicit operator smoke test. Sends only this fixed, non-personal fixture.
// Supply a restricted LiteLLM virtual key; never use the provider/master key.
import { createJevClient, JevError } from '../jev.mjs';

try {
  const client = createJevClient({
    baseUrl: process.env.LITELLM_BASE_URL,
    apiKey: process.env.LITELLM_API_KEY,
    model: process.env.JEV_MODEL || 'jev-1.13.0',
    allowLocalhost: process.env.JEV_ALLOW_LOCALHOST === 'true',
    timeoutMs: 15000,
  });
  const started = Date.now();
  const result = await client.evaluate({
    state: '주문 상태는 배송 완료입니다. 고객에게 상품이 도착했습니다.',
    questions: {
      delivery: { type: 'choice', instructions: '주문의 배송 상태를 선택하세요.',
        criteria: { delivered: '배송 완료', pending: '배송 대기' } },
      relevance: { type: 'noul', instructions: '주문 배송에 관한 내용인가요?' },
      clarity: { type: 'score', instructions: '배송 완료 여부를 얼마나 명확히 설명하나요?',
        criteria: ['배송 상태가 없음', '배송 상태가 명시됨'] },
    },
  });
  const expectedChoice = result.answers.delivery.choice === 'delivered';
  console.log(JSON.stringify({ status: expectedChoice ? 'passed' : 'semantic_mismatch',
    elapsedMs: Date.now() - started, model: result.model, answers: result.answers, usage: result.usage }));
  if (!expectedChoice) process.exitCode = 2;
} catch (error) {
  console.log(JSON.stringify(error instanceof JevError
    ? { status: 'failed', code: error.code, httpStatus: error.status }
    : { status: 'failed', code: 'unexpected_error' }));
  process.exitCode = 1;
}

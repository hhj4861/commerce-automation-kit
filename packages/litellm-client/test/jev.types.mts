import { createJevClient, JevError, type JevQuestions } from '@cak/litellm-client/jev';

const client = createJevClient({ baseUrl: 'https://gateway.example/llm', apiKey: 'type-fixture' });
const result = await client.evaluate({ state: { text: '검토 대상' }, questions: {
  duplicate: { type: 'choice', instructions: '중복인가요?', criteria: { duplicate: null, fresh: '새 주제' } },
  quality: { type: 'score', instructions: ['품질'], criteria: ['부족', { description: '충분' }] },
  relevant: { type: 'noul', instructions: '관련 있나요?' },
} });
const choice: 'duplicate' | 'fresh' = result.answers.duplicate.choice;
const probability: number = result.answers.duplicate.probabilities.fresh;
const score: number = result.answers.quality.score;
const noul: number = result.answers.relevant.noul;
// @ts-expect-error Jev does not return a confidence field for noul
result.answers.relevant.confidence;
// @ts-expect-error choice is limited to the supplied criteria
const invalid: 'unrelated' = result.answers.duplicate.choice;
// @ts-expect-error score is not a text-generation response
result.answers.quality.text;
// @ts-expect-error content excludes null at the state root
client.evaluate({ state: null, questions: {} });
const dynamic: JevQuestions = { decision: { type: 'noul', instructions: 'yes?' } };
const dynamicResult = await client.evaluate({ state: '', questions: dynamic });
if (dynamicResult.answers.decision.type === 'choice') {
  const value: string = dynamicResult.answers.decision.choice;
  void value;
}
const error = new JevError('timeout', 504);
void [choice, probability, score, noul, error, invalid];

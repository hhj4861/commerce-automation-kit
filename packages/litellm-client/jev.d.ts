export type JevJSON = null | boolean | number | string | readonly JevJSON[] | { readonly [key: string]: JevJSON };
export type JevContent = string | readonly JevJSON[] | { readonly [key: string]: JevJSON };
export type JevChoiceQuestion = { readonly type: 'choice'; readonly instructions: JevContent; readonly criteria: Readonly<Record<string, JevContent | null>> };
export type JevScoreQuestion = { readonly type: 'score'; readonly instructions: JevContent; readonly criteria: readonly JevContent[] };
export type JevNoulQuestion = { readonly type: 'noul'; readonly instructions: JevContent; readonly criteria?: { readonly true?: JevContent; readonly false?: JevContent } };
export type JevQuestion = JevChoiceQuestion | JevScoreQuestion | JevNoulQuestion;
export type JevQuestions = Readonly<Record<string, JevQuestion>>;
export type JevChoiceAnswer<K extends string = string> = { type: 'choice'; choice: K; probabilities: Record<K, number>; confidence: number };
export type JevScoreAnswer = { type: 'score'; score: number; legend: Record<string, string>; probabilities: Record<string, number>; confidence: number };
/** Probability of yes; deliberately has no confidence or inferred boolean. */
export type JevNoulAnswer = { type: 'noul'; noul: number };
export type JevAnswer<Q extends JevQuestion> = Q extends JevChoiceQuestion ? JevChoiceAnswer<Extract<keyof Q['criteria'], string>> : Q extends JevScoreQuestion ? JevScoreAnswer : JevNoulAnswer;
export type JevResult<Q extends JevQuestions> = {
  model: string;
  answers: { [K in keyof Q]: JevAnswer<Q[K]> };
  usage: { input_tokens: number; output_tokens: number };
};
export type JevClientOptions = {
  /** LiteLLM root/prefix (e.g. https://ai.example/llm), optional trailing /v1. */
  baseUrl: string;
  /** Platform-scoped LiteLLM virtual key, never a browser or provider key. */
  apiKey: string;
  /** Defaults to the pinned jev-1.13.0; aliases must be chosen explicitly. */
  model?: string;
  allowLocalhost?: boolean;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Local UTF-8 byte limits, default 1 MiB each, not provider token limits. */
  maxRequestBytes?: number;
  maxResponseBytes?: number;
};
export type JevErrorCode = 'server_only' | 'invalid_config' | 'invalid_input' | 'request_too_large' |
  'response_too_large' | 'invalid_response' | 'authentication_failed' | 'rate_limited' | 'overloaded' |
  'redirect_rejected' | 'upstream_error' | 'network_error' | 'timeout' | 'cancelled';
export class JevError extends Error { code: JevErrorCode; status: number; constructor(code: JevErrorCode, status?: number); }
export interface JevClient {
  evaluate<const Q extends JevQuestions>(input: { state: JevContent; questions: Q; signal?: AbortSignal }): Promise<JevResult<Q>>;
}
export function createJevClient(options: JevClientOptions): JevClient;

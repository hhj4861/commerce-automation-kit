export type LiteLLMConfig = { baseUrl: string; apiKey: string; model: string; allowLocalhost?: boolean };
export type ClientOptions = LiteLLMConfig & { fetch?: typeof fetch; timeoutMs?: number };
export class LiteLLMError extends Error { code: string; status: number; constructor(code: string, status?: number); }
export function normalizeConfig(config: LiteLLMConfig): { baseUrl: string; apiKey: string; model: string };
export type TextInput = {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  maxTokens?: number; maxChars?: number; signal?: AbortSignal; responseFormat?: object;
};
export type JSONInput = TextInput & { name: string; schema: object };
export interface LiteLLMClient {
  completeText(input: TextInput): Promise<string>;
  generateJSON(input: JSONInput): Promise<Record<string, unknown>>;
  listModels(input?: { signal?: AbortSignal }): Promise<string[]>;
  transcribe(input: { file: Blob; filename?: string; language?: string; maxChars?: number; signal?: AbortSignal }): Promise<string>;
  speech(input: { text: string; voice?: string; signal?: AbortSignal }): Promise<Response>;
}
export function createLiteLLMClient(options: ClientOptions): LiteLLMClient;
export const connectionMethods: Readonly<{ codex: "subscription_oauth"; claude: "api_key"; openai: "api_key" }>;
export type PlatformScope = Readonly<{ platformId: string; subject: string }>;
export type ConnectionState = "disconnected" | "authorizing" | "connected" | "expired" | "quota_exceeded" | "error";
export type ConnectionRecord = {
  id: string; scope: PlatformScope; provider: keyof typeof connectionMethods;
  method: "subscription_oauth" | "api_key"; state: ConnectionState;
};
export type ConnectionChoice = Omit<ConnectionRecord, "scope"> & { selectable: boolean };
export type DefaultChoice = { id: "default"; provider: "default"; method: "application_key"; state: "configured"; selectable: true };
/** All adapter methods must enforce platform+subject scope in private storage.
 * resolve must atomically check state/ownership and load that record's secret route.
 * Authentication, challenge delivery, credential encryption and revocation are
 * responsibilities of the server adapter; the SDK never accepts browser identity.
 */
export interface ConnectionAdapter {
  list(scope: PlatformScope): Promise<ConnectionRecord[]>;
  get(scope: PlatformScope, id: string): Promise<ConnectionRecord | null>;
  start(scope: PlatformScope, input: { provider: keyof typeof connectionMethods; method: "subscription_oauth" | "api_key" }): Promise<ConnectionRecord>;
  refresh(scope: PlatformScope, id: string): Promise<ConnectionRecord>;
  disconnect(scope: PlatformScope, id: string): Promise<void>;
  resolve(scope: PlatformScope, id: string): Promise<ConnectionRecord & { route: LiteLLMConfig }>;
}
export function createModelSession(options: {
  scope: PlatformScope; defaultRoute: LiteLLMConfig; adapter?: ConnectionAdapter; fetch?: typeof fetch; timeoutMs?: number;
}): {
  list(): Promise<Array<ConnectionChoice | DefaultChoice>>;
  connect(provider: keyof typeof connectionMethods, method: "subscription_oauth" | "api_key"): Promise<ConnectionChoice>;
  refresh(id: string): Promise<ConnectionChoice>;
  disconnect(id: string): Promise<void>;
  client(selection?: string): LiteLLMClient;
};

export { createAccountClient, publicAccountConnections, assertAccountSelection, accountSelectionPattern } from "./accounts.mjs";
export type { AccountConnection } from "./accounts.mjs";

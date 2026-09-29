import type { TextInput, JSONInput } from './index.js';
export type AccountConnection = {
  id: string; provider: 'codex' | 'claude';
  state: 'authorizing' | 'connected' | 'expired' | 'quota_exceeded' | 'error' | 'disconnected';
  models: string[]; challenge?: { url: string; code: string; expiresAt: number };
};
export const accountSelectionPattern: RegExp;
export function publicAccountConnections(value: unknown): AccountConnection[];
export function assertAccountSelection(connections: AccountConnection[], selection: string): void;
export function createAccountClient(options: {
  baseUrl: string; apiKey: string; subject: string; allowLocalhost?: boolean; fetch?: typeof fetch; timeoutMs?: number;
}): {
  list(): Promise<AccountConnection[]>;
  connect(provider: 'codex' | 'claude', input?: { apiKey?: string; ttlSeconds?: number }): Promise<AccountConnection>;
  disconnect(id: string): Promise<void>;
  client(selection: string): {
    completeText(input: TextInput): Promise<string>;
    generateJSON(input: JSONInput): Promise<Record<string, unknown>>;
  };
};

import type { JWTVerifyGetKey } from 'jose';
export type GoogleIdentity = { subject: string; email: string; name: string };
export function verifyGoogleIdentity(credential: string, options: { clientId: string; nonce: string }, keySet?: JWTVerifyGetKey): Promise<GoogleIdentity>;

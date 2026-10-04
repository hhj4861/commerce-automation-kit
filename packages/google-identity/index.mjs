import { createRemoteJWKSet, jwtVerify } from 'jose';
const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), { timeoutDuration: 10000 });

/** Verify identity only. Never creates a session, assigns a role or links by email. */
export async function verifyGoogleIdentity(credential, { clientId, nonce }, keySet = keys) {
  if (typeof credential !== 'string' || !credential || credential.length > 12000 ||
      typeof clientId !== 'string' || !clientId || typeof nonce !== 'string' || !nonce)
    throw new Error('Invalid Google credential');
  const { payload } = await jwtVerify(credential, keySet, {
    algorithms: ['RS256'], issuer: ['accounts.google.com', 'https://accounts.google.com'],
    audience: clientId, requiredClaims: ['sub', 'email', 'email_verified', 'nonce', 'iat', 'exp'],
    maxTokenAge: '2h',
  });
  if (payload.aud !== clientId || (payload.azp !== undefined && payload.azp !== clientId) ||
      payload.nonce !== nonce || payload.email_verified !== true ||
      typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255 ||
      typeof payload.email !== 'string' || payload.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email))
    throw new Error('Invalid Google identity');
  return { subject: payload.sub, email: payload.email.toLowerCase(),
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim().slice(0, 100) : '학습자' };
}

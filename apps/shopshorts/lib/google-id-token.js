import { createRemoteJWKSet, jwtVerify } from 'jose';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), { timeoutDuration: 10000 });

// Google Identity Services: validate on the server, never trust decoded browser claims.
export async function verifyGoogleIdToken(credential, clientId, nonce, keys = googleKeys) {
  if (typeof credential !== 'string' || credential.length > 12000 || !nonce) throw new Error('Invalid credential');
  const { payload } = await jwtVerify(credential, keys, {
    algorithms: ['RS256'], issuer: ['accounts.google.com', 'https://accounts.google.com'],
    audience: clientId, requiredClaims: ['sub', 'email', 'email_verified', 'nonce', 'iat', 'exp'], maxTokenAge: '2h'
  });
  if (payload.aud !== clientId || (payload.azp && payload.azp !== clientId) || payload.nonce !== nonce ||
      payload.email_verified !== true || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255 ||
      typeof payload.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) throw new Error('Invalid Google identity');
  return { sub: payload.sub, email: payload.email.toLowerCase(), name: String(payload.name || payload.email).slice(0, 100) };
}

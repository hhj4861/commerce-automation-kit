import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { verifyGoogleIdentity } from '../index.mjs';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: 'test', alg: 'RS256' }] });
const options = { clientId: 'app.apps.googleusercontent.com', nonce: 'browser-nonce' };
const claims = () => ({ iss: 'https://accounts.google.com', aud: options.clientId, sub: 'stable-subject',
  email: 'Learner@example.com', email_verified: true, name: ' 학습자 ', nonce: options.nonce,
  iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
const token = (changes = {}, key = privateKey) => new SignJWT({ ...claims(), ...changes })
  .setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(key);
test('valid signed Google identity exposes only normalized identity fields', async () => {
  assert.deepEqual(await verifyGoogleIdentity(await token(), options, keys), {
    subject: 'stable-subject', email: 'learner@example.com', name: '학습자',
  });
  assert.equal((await verifyGoogleIdentity(await token({ iss: 'accounts.google.com', name: '' }), options, keys)).name, '학습자');
});
for (const [label, changes] of Object.entries({
  issuer: { iss: 'https://attacker.example' }, audience: { aud: 'other-client' },
  multipleAudiences: { aud: [options.clientId, 'other-client'] }, authorizedParty: { azp: 'other-client' },
  nonce: { nonce: 'other-browser' }, unverified: { email_verified: false }, stringVerified: { email_verified: 'true' },
  email: { email: 'invalid' }, subject: { sub: '' }, expired: { exp: 1 }, future: { iat: Math.floor(Date.now()/1000)+3600 },
  stale: { iat: Math.floor(Date.now()/1000)-10800 }, missingNonce: { nonce: undefined }, missingExpiry: { exp: undefined },
})) test(`rejects ${label}`, async () => { await assert.rejects(verifyGoogleIdentity(await token(changes), options, keys)); });
test('rejects forged signature and unsigned JWT', async () => {
  const other = await generateKeyPair('RS256');
  await assert.rejects(verifyGoogleIdentity(await token({}, other.privateKey), options, keys));
  const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims())).toString('base64url')}.`;
  await assert.rejects(verifyGoogleIdentity(unsigned, options, keys));
});
test('rejects invalid input before resolving keys', async () => {
  let called = false;
  for (const input of ['', 'x'.repeat(12001), null])
    await assert.rejects(verifyGoogleIdentity(input, options, () => { called = true; }));
  assert.equal(called, false);
});

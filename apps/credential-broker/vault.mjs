// Credential ciphertext stays in D1; encryption key is a separate Secrets Store binding.
const encoder = new TextEncoder();
const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decode = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
async function key(env) {
  const raw = decode(await env.VAULT_KEY.get());
  if (raw.length !== 32) throw new Error('vault unavailable');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function readVault(env, name) {
  const row = await env.DB.prepare('SELECT revision, payload FROM credential_vault WHERE name = ?').bind(name).first();
  if (!row) return null;
  const payload = JSON.parse(row.payload);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(payload.iv), additionalData: encoder.encode(name) }, await key(env), decode(payload.data));
  return { revision: row.revision, value: JSON.parse(new TextDecoder().decode(plain)) };
}
export async function writeVault(env, name, value, expectedRevision) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(name) }, await key(env), encoder.encode(JSON.stringify(value)));
  const payload = JSON.stringify({ iv: encode(iv), data: encode(data) });
  const query = expectedRevision === 0
    ? env.DB.prepare('INSERT OR IGNORE INTO credential_vault(name, revision, payload, updated_at) VALUES (?, 1, ?, ?)').bind(name, payload, new Date().toISOString())
    : env.DB.prepare('UPDATE credential_vault SET revision = revision + 1, payload = ?, updated_at = ? WHERE name = ? AND revision = ?').bind(payload, new Date().toISOString(), name, expectedRevision);
  const result = await query.run();
  if (result.meta?.changes !== 1) throw Object.assign(new Error('revision conflict'), { status: 409 });
  return expectedRevision + 1;
}

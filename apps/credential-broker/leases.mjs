const DURATION = 120000;
export async function lease(env, operation, owner) {
  if (typeof owner !== 'string' || !/^[a-zA-Z0-9-]{32,64}$/.test(owner)) throw new Error('invalid owner');
  const now = Date.now();
  let statement;
  if (operation === 'acquire') statement = env.DB.prepare("INSERT INTO credential_leases(name,owner,expires_at) VALUES ('oauth-runtime',?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE credential_leases.expires_at <= ?").bind(owner, now + DURATION, now);
  else if (operation === 'renew') statement = env.DB.prepare("UPDATE credential_leases SET expires_at=? WHERE name='oauth-runtime' AND owner=? AND expires_at>?").bind(now + DURATION, owner, now);
  else if (operation === 'release') statement = env.DB.prepare("DELETE FROM credential_leases WHERE name='oauth-runtime' AND owner=?").bind(owner);
  else throw new Error('invalid lease operation');
  const result = await statement.run();
  if (result.meta?.changes !== 1 && operation !== 'release') throw Object.assign(new Error('lease conflict'), { status: 409 });
  return { ok: true };
}

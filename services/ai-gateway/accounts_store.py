"""PostgreSQL-only account storage. No schema changes or background work at startup."""
import base64
from contextlib import contextmanager
import json
import os
import re
import uuid

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class StoreError(Exception):
    def __init__(self, status, code):
        self.status, self.code = status, code
        super().__init__(code)


class Keyring:
    def __init__(self, keys, active):
        try:
            self.keys = {int(k): AESGCM(base64.b64decode(v, validate=True)) for k, v in keys.items()}
            self.active = int(active)
            if not self.keys or any(not 1 <= k <= 32767 for k in self.keys) or self.active not in self.keys:
                raise ValueError()
            if any(len(base64.b64decode(v)) != 32 for v in keys.values()):
                raise ValueError()
        except Exception:
            raise ValueError('Invalid accounts encryption keyring') from None

    @staticmethod
    def aad(row):
        # Also bind owner and provider: moving ciphertext between tenants fails closed.
        return json.dumps([row['id'], row['platform'], row['subject'], row['provider']], separators=(',', ':')).encode()

    def seal(self, row, secret):
        nonce = os.urandom(12)
        return self.active, nonce + self.keys[self.active].encrypt(nonce, secret.encode(), self.aad(row))

    def open(self, row):
        try:
            value = bytes(row['secret_ct'])
            return self.keys[row['key_id']].decrypt(value[:12], value[12:], self.aad(row)).decode()
        except Exception:
            raise StoreError(503, 'credential_unavailable') from None


DDL = (
    """CREATE TABLE IF NOT EXISTS connections (
        id text PRIMARY KEY, platform text NOT NULL, subject char(64) NOT NULL,
        provider text NOT NULL CHECK (provider IN ('openai','claude')),
        auth_method text NOT NULL DEFAULT 'api-key' CHECK (auth_method='api-key'),
        state text NOT NULL CHECK (state IN ('authorizing','connected','expired','quota_exceeded','error','disconnected')),
        secret_ct bytea, key_id smallint NOT NULL,
        models jsonb NOT NULL DEFAULT '[]',
        created timestamptz NOT NULL DEFAULT clock_timestamp(),
        updated timestamptz NOT NULL DEFAULT clock_timestamp(), expires timestamptz)""",
    'CREATE INDEX IF NOT EXISTS connections_owner ON connections (platform,subject)',
    "CREATE UNIQUE INDEX IF NOT EXISTS connections_one_open ON connections(platform,subject,provider) WHERE state <> 'disconnected'",
)


class AccountsStore:
    def __init__(self, url, keyring, schema='accounts_v2'):
        if not re.fullmatch('[a-z][a-z0-9_]{0,62}', schema):
            raise ValueError('Invalid accounts schema')
        self.url, self.keyring, self.schema = url, keyring, schema

    @contextmanager
    def db(self):
        import psycopg
        from psycopg import sql
        from psycopg.rows import dict_row
        try:
            with psycopg.connect(self.url, connect_timeout=2, row_factory=dict_row) as db:
                db.execute("SET LOCAL statement_timeout = '2s'")
                db.execute("SET LOCAL lock_timeout = '1s'")
                db.execute(sql.SQL('SET LOCAL search_path TO {}').format(sql.Identifier(self.schema)))
                yield db
        except psycopg.errors.UniqueViolation:
            raise StoreError(409, 'disconnect_before_reconnecting') from None
        except psycopg.Error:
            # Never propagate a DSN, SQL parameters or provider credential into logs.
            raise StoreError(503, 'account_storage_unavailable') from None

    def migrate(self):
        from psycopg import sql
        with self.db() as db:
            db.execute('SELECT pg_advisory_xact_lock(71261101)')
            db.execute(sql.SQL('CREATE SCHEMA IF NOT EXISTS {}').format(sql.Identifier(self.schema)))
            for statement in DDL:
                db.execute(statement)

    def _expire(self, db, scope=None):
        suffix, params = (' AND platform=%s AND subject=%s', scope) if scope else ('', ())
        db.execute("UPDATE connections SET state='expired',secret_ct=NULL,models='[]',updated=clock_timestamp() "
                   "WHERE expires<=clock_timestamp() AND state NOT IN ('disconnected','expired')" + suffix, params)
        # A process terminated during validation must not leave a pending login forever.
        db.execute("UPDATE connections SET state='error',secret_ct=NULL,models='[]',updated=clock_timestamp() "
                   "WHERE state='authorizing' AND updated < clock_timestamp()-interval '30 seconds'" + suffix, params)

    def purge_expired(self):
        with self.db() as db:
            self._expire(db)

    def create(self, scope, provider, ttl=None):
        with self.db() as db:
            return db.execute("INSERT INTO connections (id,platform,subject,provider,state,key_id,expires) "
                              "VALUES (%s,%s,%s,%s,'authorizing',%s,clock_timestamp()+%s*interval '1 second') RETURNING *",
                              (uuid.uuid4().hex, *scope, provider, self.keyring.active, ttl)).fetchone()

    def get(self, id, scope):
        with self.db() as db:
            self._expire(db, scope)
            row = db.execute('SELECT * FROM connections WHERE id=%s AND platform=%s AND subject=%s', (id, *scope)).fetchone()
        if row is None:
            raise StoreError(404, 'connection_not_found')
        return row

    def list(self, scope):
        with self.db() as db:
            self._expire(db, scope)
            return db.execute("SELECT * FROM connections WHERE platform=%s AND subject=%s AND state<>'disconnected' ORDER BY created,id", scope).fetchall()

    def finish(self, id, scope, secret=None, models=()):
        with self.db() as db:
            self._expire(db, scope)
            row = db.execute('SELECT * FROM connections WHERE id=%s AND platform=%s AND subject=%s FOR UPDATE', (id, *scope)).fetchone()
            if not row or row['state'] != 'authorizing':
                raise StoreError(409, 'connection_unavailable')
            key_id, ciphertext = self.keyring.seal(row, secret) if secret else (self.keyring.active, None)
            return db.execute('UPDATE connections SET state=%s,secret_ct=%s,key_id=%s,models=%s,updated=clock_timestamp() WHERE id=%s RETURNING *',
                              ('connected' if secret else 'error', ciphertext, key_id, json.dumps(list(models)), id)).fetchone()

    def disconnect(self, id, scope):
        with self.db() as db:
            row = db.execute("UPDATE connections SET state='disconnected',secret_ct=NULL,models='[]',updated=clock_timestamp() "
                             'WHERE id=%s AND platform=%s AND subject=%s RETURNING id', (id, *scope)).fetchone()
        if row is None:
            raise StoreError(404, 'connection_not_found')

    def fail(self, id, scope, state):
        if state not in ('expired', 'quota_exceeded'):
            raise ValueError('Invalid provider failure state')
        with self.db() as db:
            db.execute("UPDATE connections SET state=%s,secret_ct=NULL,models='[]',updated=clock_timestamp() "
                       "WHERE id=%s AND platform=%s AND subject=%s AND state='connected'", (state, id, *scope))

    def secret(self, id, scope):
        row = self.get(id, scope)
        if row['state'] != 'connected':
            raise StoreError(409, 'connection_' + row['state'])
        return row, self.keyring.open(row)

    def rotate(self):
        # Explicit maintenance operation; row locks serialize with disconnect.
        # Caller retains all old key versions until this succeeds and PITR retention ends.
        with self.db() as db:
            rows = db.execute('SELECT * FROM connections WHERE secret_ct IS NOT NULL AND key_id<>%s FOR UPDATE', (self.keyring.active,)).fetchall()
            for row in rows:
                key_id, ciphertext = self.keyring.seal(row, self.keyring.open(row))
                db.execute('UPDATE connections SET key_id=%s,secret_ct=%s WHERE id=%s', (key_id, ciphertext, row['id']))
        return len(rows)

    def metadata(self):
        # Export is deliberately an explicit allowlist, never SELECT * / pg_dump.
        with self.db() as db:
            return db.execute('SELECT id,platform,subject,provider,state,created,updated,expires FROM connections ORDER BY id').fetchall()


def from_env(env):
    try:
        return AccountsStore(env['ACCOUNT_DATABASE_URL'], Keyring(json.loads(env['ACCOUNT_KEYRING']), env['ACCOUNT_ACTIVE_KEY_ID']))
    except (ValueError, KeyError):
        raise ValueError('Invalid accounts store configuration') from None


if __name__ == '__main__':
    import sys
    try:
        store = from_env(os.environ)
        if sys.argv[1:] == ['migrate']:
            store.migrate()
        elif sys.argv[1:] == ['expire']:
            store.purge_expired()
        elif sys.argv[1:] == ['rotate']:
            store.rotate()
        elif sys.argv[1:] == ['export-metadata']:
            print(json.dumps(store.metadata(), default=str))
            sys.exit(0)
        else:
            raise ValueError('Expected migrate, expire, rotate or export-metadata')
    except Exception:
        raise SystemExit('Accounts maintenance failed') from None
    print('Accounts maintenance complete')

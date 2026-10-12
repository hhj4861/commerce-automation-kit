"""Cipher tests locally; mandatory real PostgreSQL lifecycle/races in accounts-v2 CI."""
import base64
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import sys
import unittest
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from accounts_store import AccountsStore, Keyring, StoreError

KEYS = {'1': base64.b64encode(b'a'*32).decode(), '2': base64.b64encode(b'b'*32).decode()}
SCOPE = ('hanmadi', 'a'*64)
SECRET = 'sk-test-' + 'private-fixture-'*4


class CipherTest(unittest.TestCase):
    def test_roundtrip_nonce_and_rotation(self):
        ring = Keyring(KEYS, 1)
        row = dict(id='a'*32, platform=SCOPE[0], subject=SCOPE[1], provider='openai')
        row['key_id'], row['secret_ct'] = ring.seal(row, SECRET)
        self.assertNotIn(SECRET.encode(), row['secret_ct'])
        self.assertNotEqual(ring.seal(row, SECRET)[1], row['secret_ct'])
        self.assertEqual(Keyring(KEYS, 2).open(row), SECRET)
        row['key_id'], row['secret_ct'] = Keyring(KEYS, 2).seal(row, SECRET)
        self.assertEqual(row['key_id'], 2)
        self.assertEqual(Keyring({'2': KEYS['2']}, 2).open(row), SECRET)

    def test_ciphertext_bound_to_id_owner_provider_and_key(self):
        ring = Keyring(KEYS, 1)
        row = dict(id='a'*32, platform=SCOPE[0], subject=SCOPE[1], provider='openai')
        row['key_id'], row['secret_ct'] = ring.seal(row, SECRET)
        for field, value in [('id','b'*32), ('subject','b'*64), ('platform','festa'), ('provider','claude'), ('key_id',2), ('secret_ct',row['secret_ct'][:-1]+bytes([row['secret_ct'][-1]^1]))]:
            with self.subTest(field=field), self.assertRaises(StoreError):
                ring.open({**row, field: value})

    def test_invalid_keyrings_fail_without_echo(self):
        for keys, active in [({},1), ({'1':SECRET},1), ({'1':base64.b64encode(b'a'*16).decode()},1), (KEYS,3)]:
            with self.assertRaisesRegex(ValueError, '^Invalid accounts encryption keyring$'):
                Keyring(keys,active)


@unittest.skipUnless(os.environ.get('ACCOUNTS_TEST_DATABASE_URL'), 'real PostgreSQL required (mandatory in CI)')
class PostgresTest(unittest.TestCase):
    def setUp(self):
        self.schema = 'test_accounts_' + uuid.uuid4().hex
        self.store = AccountsStore(os.environ['ACCOUNTS_TEST_DATABASE_URL'], Keyring(KEYS,1), self.schema)
        self.store.migrate()
        self.addCleanup(self.drop)

    def drop(self):
        from psycopg import sql
        with self.store.db() as db:
            db.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(self.schema)))

    def connected(self, ttl=None):
        row = self.store.create(SCOPE,'openai',ttl)
        return self.store.finish(row['id'],SCOPE,SECRET,['gpt-test'])

    def test_restart_scopes_and_rotation(self):
        row = self.connected()
        recovered = AccountsStore(self.store.url,Keyring(KEYS,2),self.schema)
        self.assertEqual(recovered.secret(row['id'],SCOPE)[1],SECRET)
        for scope in [('festa', SCOPE[1]), ('hanmadi','b'*64)]:
            self.assertEqual(recovered.list(scope),[])
            for action in ('get','secret','disconnect'):
                with self.assertRaises(StoreError) as e:
                    getattr(recovered,action)(row['id'],scope)
                self.assertEqual(e.exception.status,404)
        self.assertEqual(recovered.rotate(),1)
        self.assertEqual(recovered.rotate(),0)
        recovered.keyring = Keyring({'2':KEYS['2']},2)
        self.assertEqual(recovered.secret(row['id'],SCOPE)[1],SECRET)
        exported = json.dumps(recovered.metadata(),default=str)
        self.assertNotIn(SECRET,exported)
        self.assertNotIn('secret_ct',exported)
        self.assertNotIn('key_id',exported)

    def test_simultaneous_creation_is_single_winner(self):
        def create(_):
            try:
                return self.store.create(SCOPE,'openai')['state']
            except StoreError as e:
                return e.status
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertCountEqual(list(pool.map(create,range(2))),['authorizing',409])
        self.assertEqual(len(self.store.list(SCOPE)),1)

    def test_revocation_wins_over_validation_and_failure_updates(self):
        row = self.store.create(SCOPE,'openai')
        self.store.disconnect(row['id'],SCOPE)
        with self.assertRaises(StoreError):
            self.store.finish(row['id'],SCOPE,SECRET,['gpt-test'])
        self.store.fail(row['id'],SCOPE,'expired')
        self.assertEqual(self.store.get(row['id'],SCOPE)['state'],'disconnected')
        self.assertIsNone(self.store.get(row['id'],SCOPE)['secret_ct'])
        self.connected() # Reconnection gets a new row, never resurrects the old one.

    def test_expiry_clears_key_and_does_not_allow_duplicate(self):
        row = self.connected(60)
        with self.store.db() as db:
            db.execute("UPDATE connections SET expires=clock_timestamp()-interval '1 second' WHERE id=%s",(row['id'],))
        with self.assertRaisesRegex(StoreError,'connection_expired'):
            self.store.secret(row['id'],SCOPE)
        self.assertIsNone(self.store.get(row['id'],SCOPE)['secret_ct'])
        with self.assertRaisesRegex(StoreError,'disconnect_before_reconnecting'):
            self.store.create(SCOPE,'openai')

    def test_interrupted_validation_becomes_error_and_can_be_disconnected(self):
        row = self.store.create(SCOPE,'openai')
        with self.store.db() as db:
            db.execute("UPDATE connections SET updated=clock_timestamp()-interval '31 seconds' WHERE id=%s",(row['id'],))
        self.store.purge_expired()
        self.assertEqual(self.store.get(row['id'],SCOPE)['state'],'error')
        self.assertIsNone(self.store.get(row['id'],SCOPE)['secret_ct'])
        with self.assertRaises(StoreError):
            self.store.finish(row['id'],SCOPE,SECRET,['gpt-test'])

    def test_driver_error_does_not_include_dsn(self):
        broken = AccountsStore(self.store.url,Keyring(KEYS,1),'missing_'+uuid.uuid4().hex)
        with self.assertRaisesRegex(StoreError,'^account_storage_unavailable$'):
            broken.list(SCOPE)


if __name__ == '__main__':
    unittest.main()

"""Run with an explicitly supplied disposable local PostgreSQL database in CI."""
import os
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch
from server import configured_store
from service import Failure
from pgstore import PostgresStore

INPUT = {"profile": "content", "category": "architecture", "brief": "bridge", "history": [],
         "runtime": {"provider": "codex", "model": "test"}}


class ConfigurationTest(unittest.TestCase):
    def test_cloud_run_refuses_ephemeral_sqlite(self):
        with self.assertRaisesRegex(ValueError, "requires PostgreSQL"):
            configured_store({"K_SERVICE": "discovery-stg", "DISCOVERY_DB": "/tmp/state"})

    def test_database_url_selects_postgres_without_connecting(self):
        self.assertIsInstance(configured_store({"DISCOVERY_DATABASE_URL": "synthetic"}), PostgresStore)


@unittest.skipUnless(os.environ.get("DISCOVERY_TEST_DATABASE_URL"), "disposable PostgreSQL not supplied")
class PostgresTest(unittest.TestCase):
    def setUp(self):
        self.schema = "test_" + uuid.uuid4().hex
        self.store = PostgresStore(os.environ["DISCOVERY_TEST_DATABASE_URL"], self.schema)
        self.store.migrate()

    def tearDown(self):
        from psycopg import sql
        with self.store.connection() as conn:
            conn.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(self.schema)))

    def race(self, fn):
        barrier = Barrier(10)
        def call(i):
            barrier.wait()
            try:
                return fn(i)
            except Failure as exc:
                return exc.code
        with ThreadPoolExecutor(max_workers=10) as pool:
            return list(pool.map(call, range(10)))

    def test_same_scope_only_one_begin(self):
        results = self.race(lambda i: self.store.begin("subject", "platform", str(i), INPUT))
        self.assertEqual(sum(isinstance(x, tuple) for x in results), 1)
        self.assertEqual(results.count("discovery_in_progress"), 9)

    def test_different_scopes_cannot_exceed_platform_budget(self):
        results = self.race(lambda i: self.store.begin(str(i), "platform", str(i), INPUT, per_day=3))
        self.assertEqual(sum(isinstance(x, tuple) for x in results), 3)
        self.assertEqual(results.count("skipped_by_budget"), 7)

    def test_same_idempotency_key_is_replayed(self):
        results = self.race(lambda i: self.store.begin("subject", "platform", "same", INPUT))
        self.assertEqual(len({x[0] for x in results}), 1)
        self.assertEqual(sum(x[1] for x in results), 1)

    def test_state_survives_new_store_instance(self):
        rid, _ = self.store.begin("subject", "platform", "same", INPUT)
        fresh = PostgresStore(self.store.url, self.schema)
        self.assertEqual(fresh.get("subject", rid)["input"], INPUT)

    def test_transaction_rolls_back_and_releases_lock(self):
        with self.assertRaises(RuntimeError):
            with self.store.transaction("subject") as db:
                db.execute("INSERT INTO active VALUES (?,?)", ("subject", "not-committed"))
                raise RuntimeError("rollback")
        self.assertTrue(self.store.begin("subject", "platform", "same", INPUT)[1])

    def test_expiration_commits_even_when_claim_is_rejected(self):
        rid, _ = self.store.begin("subject", "platform", "same", INPUT)
        with self.store.db() as db:
            db.execute("UPDATE requests SET expires=0 WHERE id=?", (rid,))
        with self.assertRaises(Failure):
            self.store.claim("subject", rid, "absent")
        self.assertEqual(self.store.get("subject", rid)["state"], "held")
        self.assertTrue(self.store.begin("subject", "platform", "next", INPUT)[1])

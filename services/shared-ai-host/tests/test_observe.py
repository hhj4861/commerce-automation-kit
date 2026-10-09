"""Unit tests for the PoC observation helpers; no network, no database."""
import io
import json
import sys
import unittest
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "poc"))
import observe  # noqa: E402

KEY = "sk-" + "a" * 40
TOKEN = "eyJ" + "b" * 20 + "." + "c" * 20 + "." + "d" * 20
URL = "postgresql://owner:p%40ss@ep-x-123.us-east-2.aws.neon.tech/neondb?sslmode=require&connect_timeout=15"
HASH = "0" * 64


class Response(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class Opener:
    def __init__(self, *payloads):
        self.payloads, self.requests = list(payloads), []

    def open(self, request, timeout):
        self.requests.append(request)
        return Response(json.dumps(self.payloads.pop(0)).encode())


class RedactionTest(unittest.TestCase):
    def test_records_never_contain_secrets(self):
        observe.register_secret("neon-api-key-value-123")
        text = f"key={KEY} token={TOKEN} db={URL} neon=neon-api-key-value-123"
        cleaned = observe.redact(text)
        for secret in (KEY, TOKEN, URL, "neon-api-key-value-123"):
            self.assertNotIn(secret, cleaned)
        line = observe.record({"step": "x", "body": {"key": KEY}, "note": URL})
        self.assertNotIn("body", json.loads(line))
        self.assertNotIn(URL, line)


    def test_api_errors_are_named_not_raised(self):
        def fail():
            raise urllib.error.URLError("timed out")

        self.assertEqual(observe.safe(fail), "error:URLError")
        self.assertEqual(observe.safe(lambda: "idle"), "idle")


class NeonTest(unittest.TestCase):
    def test_reads_the_primary_compute_state_and_usage(self):
        opener = Opener({"endpoints": [{"type": "read_only", "current_state": "active"},
                                       {"type": "read_write", "current_state": "idle"}]},
                        {"project": {"active_time_seconds": 120, "compute_time_seconds": 30, "name": "x"}})
        neon = observe.Neon("neon-api-key-value-123", "proj-1", opener=opener)
        self.assertEqual(neon.state(), "idle")
        self.assertEqual(neon.usage(), {"active_time_seconds": 120, "compute_time_seconds": 30})
        sent = opener.requests[0]
        self.assertEqual(sent.full_url, "https://console.neon.tech/api/v2/projects/proj-1/endpoints")
        self.assertEqual(sent.get_header("Authorization"), "Bearer neon-api-key-value-123")

    def test_wait_polls_only_the_control_plane_until_idle(self):
        states = iter(["active", "active", "idle"])
        neon = observe.Neon("k", "p", opener=None)
        neon.state = lambda: next(states)
        slept = []
        self.assertEqual(neon.wait_for("idle", timeout=600, interval=30, sleep=slept.append, clock=lambda: 30 * len(slept)), "idle")
        self.assertEqual(slept, [30, 30])


    def test_active_time_comes_from_the_state_changes(self):
        records = [{"step": "neon-watch-start", "at": 0}, {"step": "neon-state", "at": 0, "state": "idle"},
                   {"step": "neon-state", "at": 100, "state": "active"}, {"step": "neon-state", "at": 400, "state": "idle"},
                   {"step": "neon-state", "at": 1000, "state": "init"}, {"step": "neon-watch-end", "at": 1060}]
        self.assertEqual(observe.non_idle_seconds(records), 360.0)


class DatabaseTest(unittest.TestCase):
    def test_password_reaches_libpq_through_the_environment(self):
        env = observe.pg_env(URL)
        self.assertEqual(env, {"PGHOST": "ep-x-123.us-east-2.aws.neon.tech", "PGPORT": "5432", "PGUSER": "owner",
                               "PGPASSWORD": "p@ss", "PGDATABASE": "neondb", "PGSSLMODE": "require",
                               "PGCONNECT_TIMEOUT": "15"})
        with self.assertRaises(ValueError):
            observe.pg_env("https://example.test/db")

    def test_queries_accept_only_a_key_hash_and_a_number(self):
        sql = observe.sql_text("spend-count", HASH, since=1700000000.5)
        self.assertIn(f"api_key = '{HASH}'", sql)
        self.assertIn("to_timestamp(1700000000.5)", sql)
        for bad in ("' OR 1=1 --", "A" * 64, "0" * 63, None):
            with self.assertRaises(ValueError):
                observe.sql_text("key-state", bad)
        self.assertIn("information_schema.tables", observe.sql_text("tables"))

    def test_psql_gets_the_url_only_through_its_environment(self):
        seen = {}

        def run(argv, env, **kwargs):
            seen.update(argv=argv, env=env)
            return type("Done", (), {"stdout": "3|0.01\n"})()

        self.assertEqual(observe.psql("SELECT 1", URL, run=run), "3|0.01")
        self.assertNotIn("p@ss", " ".join(seen["argv"]))
        self.assertEqual(seen["env"]["PGPASSWORD"], "p@ss")


class MonitoringTest(unittest.TestCase):
    def test_sums_billable_instance_seconds_for_one_service(self):
        opener = Opener({"timeSeries": [{"points": [{"value": {"doubleValue": 12.5}}, {"value": {"doubleValue": 7.5}}]},
                                        {"points": [{"value": {"doubleValue": 5}}]}]})
        total = observe.billable_seconds("litellm-stg", "2026-10-10T00:00:00Z", "2026-10-11T00:00:00Z",
                                         "access-token", opener=opener)
        self.assertEqual(total, 25.0)
        url = opener.requests[0].full_url
        self.assertIn("run.googleapis.com%2Fcontainer%2Fbillable_instance_time", url)
        self.assertIn("litellm-stg", url)


if __name__ == "__main__":
    unittest.main()

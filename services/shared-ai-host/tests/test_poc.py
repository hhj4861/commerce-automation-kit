"""Unit tests for the staging PoC harness; no network, no gcloud."""
import io
import json
import os
import stat
import sys
import tempfile
import unittest
import urllib.error
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "poc"))
import poc  # noqa: E402

KEY = "sk-" + "a" * 40
TOKEN = "eyJ" + "b" * 20 + "." + "c" * 20 + "." + "d" * 20


class Response(io.BytesIO):
    def __init__(self, status, body=b"", lines=None):
        super().__init__(body)
        self.status, self.lines = status, lines

    def __iter__(self):
        return iter(self.lines if self.lines is not None else super().readlines())

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class Opener:
    def __init__(self, outcome):
        self.outcome, self.requests = outcome, []

    def open(self, request, timeout):
        self.requests.append(request)
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


class CallTest(unittest.TestCase):
    def test_cloud_run_and_litellm_credentials_travel_in_separate_headers(self):
        opener = Opener(Response(200, b'{"data": []}'))
        result = poc.call("https://edge.test/", "/llm/v1/models", TOKEN, KEY, opener=opener)
        sent = opener.requests[0]
        self.assertEqual(sent.full_url, "https://edge.test/llm/v1/models")
        self.assertEqual(sent.get_header("X-serverless-authorization"), "Bearer " + TOKEN)
        self.assertEqual(sent.get_header("Authorization"), "Bearer " + KEY)
        self.assertEqual((result["status"], result["body"]), (200, {"data": []}))

    def test_missing_credentials_are_omitted_not_sent_empty(self):
        opener = Opener(Response(403))
        poc.call("https://edge.test", "/llm/health/liveliness", "", "", opener=opener)
        self.assertIsNone(opener.requests[0].get_header("X-serverless-authorization"))
        self.assertIsNone(opener.requests[0].get_header("Authorization"))

    def test_errors_are_reported_and_records_stay_clean(self):
        denied = urllib.error.HTTPError("https://edge.test", 401, "denied", {}, io.BytesIO(b'{"error": "' + KEY.encode() + b'"}'))
        result = poc.call("https://edge.test", "/llm/v1/models", TOKEN, KEY, opener=Opener(denied))
        self.assertEqual(result["status"], 401)
        self.assertNotIn(KEY, poc.observe.record(result))
        failed = poc.call("https://edge.test", "/llm/v1/models", TOKEN, KEY, opener=Opener(urllib.error.URLError("timed out")))
        self.assertEqual((failed["status"], failed["error"]), (None, "URLError"))

    def test_stream_reports_when_events_arrived(self):
        lines = [b'data: {"n": 1}\n', b"\n", b'data: {"n": 2}\n', b"\n", b"data: [DONE]\n"]
        ticks = iter([0.0, 0.5, 1.0, 1.5])
        result = poc.stream("https://edge.test", "/llm/v1/chat/completions", TOKEN, KEY, {"stream": True},
                            opener=Opener(Response(200, lines=lines)), clock=lambda: next(ticks))
        self.assertEqual(result, {"path": "/llm/v1/chat/completions", "status": 200, "events": 2, "done": True,
                                  "first_ms": 500, "last_ms": 1000})


class SecretHandlingTest(unittest.TestCase):
    def test_id_token_is_refreshed_before_it_expires(self):
        now, fetched = [0.0], iter([TOKEN, TOKEN + "x"])
        token = poc.IdToken(fetch=lambda: next(fetched), clock=lambda: now[0])
        self.assertEqual((token(), token()), (TOKEN, TOKEN))
        now[0] = 46 * 60
        self.assertEqual(token(), TOKEN + "x")
        self.assertNotIn(TOKEN, poc.observe.redact("token " + TOKEN))

    def test_new_keys_go_to_a_private_file_and_only_their_hash_is_shown(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "key"
            poc.write_secret_file(path, KEY)
            self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)
            with self.assertRaises(FileExistsError):
                poc.write_secret_file(path, KEY)
        self.assertRegex(poc.key_hash(KEY), r"^[0-9a-f]{64}$")


class PayloadTest(unittest.TestCase):
    def test_one_second_of_silence_is_a_valid_wav(self):
        with wave.open(io.BytesIO(poc.silent_wav()), "rb") as audio:
            self.assertEqual((audio.getnframes(), audio.getframerate(), audio.getnchannels()), (16000, 16000, 1))

    def test_multipart_carries_fields_and_the_file(self):
        body, content_type = poc.multipart({"model": "hanmadi-stt"}, [("file", "a.wav", "audio/wav", b"RIFF")])
        boundary = content_type.split("boundary=")[1]
        self.assertTrue(content_type.startswith("multipart/form-data; boundary="))
        self.assertIn(b'name="model"\r\n\r\nhanmadi-stt\r\n', body)
        self.assertIn(b'filename="a.wav"\r\nContent-Type: audio/wav\r\n\r\nRIFF\r\n', body)
        self.assertTrue(body.endswith(f"--{boundary}--\r\n".encode()))


class GateTest(unittest.TestCase):
    def test_stats_use_nearest_rank_percentiles(self):
        records = [{"status": 200, "ms": ms} for ms in (1000, 2000, 3500, 4000)] + [{"status": None, "ms": 60000}]
        self.assertEqual(poc.stats(records), {"n": 5, "ok": 4, "p50_ms": 3500, "p95_ms": 60000,
                                              "max_ms": 60000, "over_3s_rate": 0.6})
        with self.assertRaises(ValueError):
            poc.percentile([], 95)

    def test_gate_criteria_follow_the_master_plan(self):
        verdicts = {name: passed for name, _, _, passed in poc.evaluate({
            "a_jev_p95_ms": 4800, "a_chat_p95_ms": 13000, "a_failures": 0, "a_chat_over_3s_rate": 0.4, "b_missing_spend": 0,
            "c_reset_missed": 0, "d_failures": 0, "e_failures": 1, "f_lost_spend": 0})}
        self.assertEqual(verdicts, {"a_jev_p95_ms": True, "a_chat_p95_ms": False, "a_failures": True, "a_chat_over_3s_rate": None,
                                    "b_missing_spend": True, "c_reset_missed": True, "d_failures": True,
                                    "e_failures": False, "f_lost_spend": True})
        self.assertIsNone(dict((n, p) for n, _, _, p in poc.evaluate({}))["a_jev_p95_ms"])


class MeasurementTest(unittest.TestCase):
    def test_warm_wait_touches_only_liveliness_until_the_measured_call(self):
        calls, states, clock = [], iter(["active", "active", "idle"]), [0.0]

        def fake_call(base, path, token, key, **kwargs):
            calls.append((path, bool(key)))
            return {"path": path, "status": 200, "ms": 5}

        result = poc.warm_trial("https://edge.test", lambda: TOKEN, KEY, neon_state=lambda: next(states),
                                idle_seconds=60, max_wait=900, ping_seconds=60, call_fn=fake_call,
                                sleep=lambda s: clock.__setitem__(0, clock[0] + s), clock=lambda: clock[0])
        self.assertEqual(calls, [("/llm/health/liveliness", False), ("/llm/health/liveliness", False),
                                 ("/llm/v1/chat/completions", True)])
        self.assertEqual((result["neon_before"], result["waited_s"], result["status"]), ("idle", 60, 200))

    def test_without_pings_the_wait_only_polls_neon(self):
        calls, clock = [], [0.0]
        poc.warm_trial("https://edge.test", lambda: TOKEN, KEY, neon_state=lambda: "idle", idle_seconds=90,
                       max_wait=900, ping_seconds=None,
                       call_fn=lambda base, path, token, key, **kw: calls.append(path) or {"path": path, "status": 200, "ms": 1},
                       sleep=lambda s: clock.__setitem__(0, clock[0] + s), clock=lambda: clock[0])
        self.assertEqual(calls, ["/llm/v1/chat/completions"])

    def test_paid_commands_need_explicit_confirmation(self):
        for argv in (["features", "--tts-voice", "v"], ["cold", "--path", "jev"]):
            with self.assertRaises(SystemExit):
                poc.main(argv)


if __name__ == "__main__":
    unittest.main()

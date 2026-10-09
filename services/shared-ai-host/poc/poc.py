"""Phase 2 staging PoC harness (stdlib only). Never prints keys, ID tokens or DB URLs.

Environment: STG_EDGE (staging edge URL); STG_KEY_FILE (a 0600 file holding a test key) or
STG_KEY (the master key, for new-key only); STG_ACCOUNT (personal gcloud account for the
Cloud Run ID token, refreshed before it expires); NEON_API_KEY and NEON_PROJECT_ID where a
measurement needs the Neon compute state. Output is redacted JSON lines.
"""
import argparse
import base64
import hashlib
import http.client
import io
import json
import math
import os
import secrets
import subprocess
import threading
import time
import urllib.error
import urllib.request
import wave
from pathlib import Path

import observe

CHAT_PATH = "/llm/v1/chat/completions"
JEV_PATH = "/llm/typesafe/v1/systemone"
NATIVE_PATH = "/llm/v1beta/models/hanmadi-chat:generateContent"
LIVELINESS = "/llm/health/liveliness"
CHAT = {"model": "hanmadi-chat", "max_tokens": 1, "messages": [{"role": "user", "content": "ping"}]}
# Honored only for keys whose metadata sets allow_client_mock_response (new-key does); otherwise
# LiteLLM drops the field and max_tokens keeps the provider call to one token.
MOCK = {"model": "hanmadi-chat", "mock_response": "pong", "max_tokens": 1, "messages": [{"role": "user", "content": "ping"}]}
LONG_STREAM = {"model": "hanmadi-chat", "max_tokens": 800, "stream": True,
               "messages": [{"role": "user", "content": "Write about 500 words on the history of tea."}]}
# Same shape as packages/litellm-client/jev.mjs builds.
JEV = {"model": "jev-1.13.0", "state": "A connectivity test for a staging gateway.",
       "questions": {"ok": {"type": "noul", "instructions": "Is this text a connectivity test?"}}}
NATIVE = {"contents": [{"role": "user", "parts": [{"text": "Reply with OK"}]}], "generationConfig": {"maxOutputTokens": 4}}
# Master plan Phase 2 gate; None is recorded but not judged (Festa shadow 3 s).
CRITERIA = {"a_jev_p95_ms": 5000, "a_chat_p95_ms": 12000, "a_failures": 0, "a_chat_over_3s_rate": None,
            "b_missing_spend": 0, "c_reset_missed": 0, "d_failures": 0, "e_failures": 0, "f_lost_spend": 0}
GCLOUD_SCOPE = ["--region=us-central1", "--project=replay-live-508202", "--quiet"]


def headers(token, key, content_type="application/json"):
    result = {"Content-Type": content_type}
    if token:
        result["X-Serverless-Authorization"] = "Bearer " + token
    if key:
        result["Authorization"] = "Bearer " + key
    return result


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def _request(base, path, token, key, body, method, content_type):
    data = body if body is None or isinstance(body, bytes) else json.dumps(body).encode()
    return urllib.request.Request(base.rstrip("/") + path, data=data, headers=headers(token, key, content_type),
                                  method=method or ("POST" if data is not None else "GET"))


def call(base, path, token, key, body=None, method=None, timeout=30, opener=None, content_type="application/json"):
    request = _request(base, path, token, key, body, method, content_type)
    start = time.monotonic()
    try:
        with (opener or urllib.request.build_opener(NoRedirect)).open(request, timeout=timeout) as response:
            raw, status = response.read(), response.status
    except urllib.error.HTTPError as error:
        with error:
            raw, status = error.read(), error.code
    except (urllib.error.URLError, TimeoutError, OSError, http.client.HTTPException) as error:
        return {"path": path, "status": None, "ms": round((time.monotonic() - start) * 1000),
                "error": type(error).__name__}
    result = {"path": path, "status": status, "ms": round((time.monotonic() - start) * 1000)}
    try:
        result["body"] = json.loads(raw)
    except ValueError:
        result["body"] = None
    return result


def stream(base, path, token, key, body, timeout=120, opener=None, clock=time.monotonic):
    """POST a streaming request and report when its SSE events arrived (flush check)."""
    request = _request(base, path, token, key, body, "POST", "application/json")
    start, first, last, events, done, status = clock(), None, None, 0, False, None
    try:
        with (opener or urllib.request.build_opener(NoRedirect)).open(request, timeout=timeout) as response:
            status = response.status
            for line in response:
                if line.startswith(b"data: [DONE]"):
                    done = True
                elif line.startswith(b"data:"):
                    now = clock()
                    first = now if first is None else first
                    last, events = now, events + 1
    except urllib.error.HTTPError as error:
        error.close()
        return {"path": path, "status": error.code, "events": events, "done": False}
    except (urllib.error.URLError, TimeoutError, OSError, http.client.HTTPException) as error:
        return {"path": path, "status": status, "events": events, "done": False, "error": type(error).__name__}
    ms = (lambda t: None if t is None else round((t - start) * 1000))
    return {"path": path, "status": status, "events": events, "done": done, "first_ms": ms(first), "last_ms": ms(last)}


def jwt_expiry(token):
    """The exp claim of a JWT, or None when the token cannot be read."""
    try:
        payload = token.split(".")[1]
        return float(json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))["exp"])
    except (IndexError, ValueError, KeyError, TypeError):
        return None


class IdToken:
    """Cloud Run ID token from the personal gcloud account, renewed 15 minutes before it expires.
    gcloud may hand back a cached token, so the expiry comes from the token itself, and wall-clock
    time keeps the check right across laptop sleep."""
    MARGIN = 15 * 60

    def __init__(self, fetch=None, clock=time.time):
        self.fetch, self.clock, self.value, self.expires = fetch or self._gcloud, clock, None, 0.0

    @staticmethod
    def _gcloud():
        argv = ["gcloud", "auth", "print-identity-token"]
        if os.environ.get("STG_ACCOUNT"):
            argv.append("--account=" + os.environ["STG_ACCOUNT"])
        return subprocess.run(argv, check=True, capture_output=True, text=True).stdout.strip()

    def __call__(self):
        if self.value is None or self.clock() >= self.expires - self.MARGIN:
            self.value = self.fetch()
            self.expires = jwt_expiry(self.value) or self.clock() + 3600
            observe.register_secret(self.value)
        return self.value


def key_hash(key):
    """LiteLLM stores and logs virtual keys as their sha256 hex digest."""
    return hashlib.sha256(key.encode()).hexdigest()


def write_secret_file(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as handle:
        handle.write(value)


def silent_wav(seconds=1, rate=16000):
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(b"\0\0" * rate * seconds)
    return buffer.getvalue()


def multipart(fields, files):
    boundary = "poc" + secrets.token_hex(12)
    parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
             for name, value in fields.items()]
    parts += [f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
              f"Content-Type: {content_type}\r\n\r\n".encode() + data + b"\r\n"
              for name, filename, content_type, data in files]
    return b"".join(parts) + f"--{boundary}--\r\n".encode(), "multipart/form-data; boundary=" + boundary


def percentile(values, p):
    ordered = sorted(values)
    if not ordered:
        raise ValueError("no samples")
    return ordered[max(0, math.ceil(p / 100 * len(ordered)) - 1)]


def stats(records):
    """Latency summary; a failed request counts at its elapsed time, never dropped."""
    times = [r["ms"] for r in records]
    return {"n": len(records), "ok": sum(r["status"] == 200 for r in records), "p50_ms": percentile(times, 50),
            "p95_ms": percentile(times, 95), "max_ms": max(times),
            "over_3s_rate": round(sum(t > 3000 or r["status"] != 200 for t, r in zip(times, records)) / len(records), 3)}


def evaluate(summary):
    return [(name, summary.get(name), limit,
             None if limit is None or name not in summary else summary[name] <= limit)
            for name, limit in CRITERIA.items()]


def warm_trial(base, token, key, neon_state, idle_seconds, max_wait, ping_seconds=None, poll_seconds=30,
               call_fn=call, sleep=time.sleep, clock=time.monotonic):
    """Wait until Neon has idled while LiteLLM stays up, then measure one keyed request.

    Optional liveliness pings (no key, no database) keep the instance warm; without them the
    instance lives only as long as Cloud Run's idle retention.
    """
    start = last_ping = clock()
    if ping_seconds:
        call_fn(base, LIVELINESS, token(), "")
    while True:
        state, waited = neon_state(), clock() - start
        if (waited >= idle_seconds and state == "idle") or waited >= max_wait:
            break
        sleep(poll_seconds)
        if ping_seconds and clock() - last_ping >= ping_seconds:
            call_fn(base, LIVELINESS, token(), "")
            last_ping = clock()
    return {"step": "warm-neon", "neon_before": state, "waited_s": round(waited),
            **call_fn(base, CHAT_PATH, token(), key, body=MOCK)}


def cold_sample(base, token, key, path, body, neon, wait_seconds=900, call_fn=call):
    """One cold-path sample: wait (control plane only) until Neon has idled, then call. The
    instance from the previous sample flushes on scale-down and wakes the database again."""
    start = time.time()
    state = neon.wait_for("idle", timeout=wait_seconds)
    return {"neon_before": state, "neon_waited_s": round(time.time() - start),
            **call_fn(base, path, token(), key, body=body, timeout=60)}


def idle_neon_shutdown(base, token, key, neon, n, call_fn=call, gcloud_fn=None):
    """(f) with a suspended database: deploy the next revision without traffic first (its startup
    connects to the database), send n calls to the serving revision, wait until Neon idles, then
    move traffic only. The old instance's SIGTERM flush is then the first thing to wake Neon."""
    gcloud_fn = gcloud_fn or gcloud
    started = time.time()
    deploy = gcloud_fn(["run", "services", "update", "litellm-stg", "--no-traffic",
                        f"--update-env-vars=POC_REV={int(started)}"])
    ok = sum(call_fn(base, CHAT_PATH, token(), key, body=MOCK)["status"] == 200 for _ in range(n))
    waited = neon.wait_for("idle", timeout=900)  # control plane only; LiteLLM gets no CPU meanwhile
    before = observe.safe(neon.state)
    switch = gcloud_fn(["run", "services", "update-traffic", "litellm-stg", "--to-latest"])
    return {"step": "shutdown", "mode": "idle-neon", "started": started, "sent": n, "ok": ok,
            "neon_waited": waited, "neon_before": before, "deploy": deploy, "switch": switch}


def gcloud(args, run=subprocess.run):
    done = run(["gcloud", *args, *GCLOUD_SCOPE], check=True, capture_output=True, text=True)
    lines = (done.stderr or "").strip().splitlines()
    return observe.redact(lines[-1] if lines else "")


def load_key():
    if os.environ.get("STG_KEY_FILE"):
        return Path(os.environ["STG_KEY_FILE"]).read_text().strip()
    return os.environ["STG_KEY"]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("smoke")
    sub.add_parser("probe")
    new_key = sub.add_parser("new-key")
    new_key.add_argument("--alias", required=True)
    new_key.add_argument("--out", required=True)
    cold = sub.add_parser("cold")
    cold.add_argument("--path", choices=["jev", "chat"], required=True)
    cold.add_argument("--samples", type=int, default=10)
    cold.add_argument("--gap-minutes", type=float, default=20)
    cold.add_argument("--initial-wait-minutes", type=float, default=0)
    cold.add_argument("--confirm-paid", action="store_true")
    burst = sub.add_parser("burst")
    burst.add_argument("--n", type=int, required=True)
    burst.add_argument("--every", type=float, default=0, help="seconds between calls")
    burst.add_argument("--real", action="store_true", help="max_tokens 1 provider calls instead of mock_response")
    features = sub.add_parser("features")
    features.add_argument("--tts-voice", required=True)
    features.add_argument("--confirm-paid", action="store_true")
    warm = sub.add_parser("warm-neon")
    warm.add_argument("--trials", type=int, default=10)
    warm.add_argument("--db-idle-minutes", type=float, default=7)
    warm.add_argument("--max-wait-minutes", type=float, default=12, help="stay under Cloud Run's 15-minute idle retention")
    warm.add_argument("--ping-seconds", type=float, default=0, help="liveliness pings; 0 (default) sends none")
    shutdown = sub.add_parser("shutdown")
    shutdown.add_argument("--mode", choices=["idle-neon", "stream"], required=True)
    shutdown.add_argument("--n", type=int, default=10)
    shutdown.add_argument("--confirm-paid", action="store_true")
    report = sub.add_parser("stats")
    report.add_argument("file")
    report.add_argument("--step", required=True)
    gate = sub.add_parser("evaluate")
    gate.add_argument("summary")
    args = parser.parse_args(argv)
    if args.command in ("features", "cold") or (args.command == "shutdown" and args.mode == "stream"):
        if not args.confirm_paid:
            parser.error(f"{args.command} makes paid provider calls; pass --confirm-paid after approval")
    if args.command == "stats":
        records = [json.loads(line) for line in Path(args.file).read_text().splitlines() if line.strip()]
        observe.emit({"step": "stats", "of": args.step, **stats([r for r in records if r.get("step") == args.step])})
        return
    if args.command == "evaluate":
        for name, measured, limit, passed in evaluate(json.loads(Path(args.summary).read_text())):
            observe.emit({"criterion": name, "measured": measured, "limit": limit, "passed": passed})
        return
    neon = observe.neon_from_env()
    if neon is None and (args.command in ("cold", "warm-neon") or getattr(args, "mode", None) == "idle-neon"):
        parser.error(f"{args.command} needs NEON_API_KEY and NEON_PROJECT_ID to confirm the compute idled")
    base, token = os.environ["STG_EDGE"], IdToken()
    key = "" if args.command == "probe" else load_key()  # the probe needs no LiteLLM key
    observe.register_secret(key)
    if args.command == "smoke":
        observe.emit({"step": "no-id-token", **call(base, "/llm/v1/models", "", key)})
        observe.emit({"step": "bad-key", **call(base, "/llm/v1/models", token(), "sk-invalid-poc-key")})
        observe.emit({"step": "models", **call(base, "/llm/v1/models", token(), key)})
        observe.emit({"step": "liveliness", **call(base, LIVELINESS, token(), "")})
        observe.emit({"step": "closed-admin", **call(base, "/llm/key/update", token(), key, body={})})
        mock = call(base, CHAT_PATH, token(), key, body=MOCK)
        choices = (mock.get("body") or {}).get("choices") or [{}]
        observe.emit({"step": "mock", "content": choices[0].get("message", {}).get("content"), **mock})
    elif args.command == "probe":
        for path, body in ((CHAT_PATH, CHAT), (JEV_PATH, JEV), (NATIVE_PATH, NATIVE)):
            data = json.dumps(body).encode()
            result = call(base, path, token(), "", body=data)
            seen = result.get("body") if isinstance(result.get("body"), dict) else {}
            observe.emit({"step": "probe", "sent_length": len(data), "seen": seen,
                          "ok": seen.get("content_length") == str(len(data)) and seen.get("path") == path[len("/llm"):],
                          **result})
    elif args.command == "new-key":
        result = call(base, "/llm/key/generate", token(), key, body={
            "key_alias": args.alias, "max_budget": 0.05, "budget_duration": "30d", "duration": "7d",
            "metadata": {"allow_client_mock_response": True}})
        created = (result.get("body") or {}).get("key") if result["status"] == 200 else None
        if created:
            observe.register_secret(created)
            write_secret_file(args.out, created)
        observe.emit({"step": "new-key", "alias": args.alias, "key_hash": created and key_hash(created), **result})
    elif args.command == "cold":
        path, body = (JEV_PATH, JEV) if args.path == "jev" else (CHAT_PATH, CHAT)
        time.sleep(args.initial_wait_minutes * 60)
        for sample in range(args.samples):
            if sample:
                time.sleep(args.gap_minutes * 60)
            observe.emit({"step": "cold-" + args.path, "sample": sample,
                          **cold_sample(base, token, key, path, body, neon)})
    elif args.command == "burst":
        started = time.time()
        for sent in range(args.n):
            if sent and args.every:
                time.sleep(args.every)
            observe.emit({"step": "burst", "started": started, **call(base, CHAT_PATH, token(), key,
                                                                         body=CHAT if args.real else MOCK)})
    elif args.command == "features":
        wav, content_type = multipart({"model": "hanmadi-stt"}, [("file", "silence.wav", "audio/wav", silent_wav())])
        cases = [("jev", JEV_PATH, JEV, "application/json"), ("gemini-native", NATIVE_PATH, NATIVE, "application/json"),
                 ("json-schema", CHAT_PATH, {"model": "hanmadi-chat", "max_tokens": 20,
                                             "messages": [{"role": "user", "content": "Return ok=true"}],
                                             "response_format": {"type": "json_schema", "json_schema": {"name": "r", "schema": {
                                                 "type": "object", "properties": {"ok": {"type": "boolean"}},
                                                 "required": ["ok"]}}}}, "application/json"),
                 ("tts", "/llm/v1/audio/speech", {"model": "hanmadi-tts", "voice": args.tts_voice, "input": "테스트",
                                                  "response_format": "mp3"}, "application/json"),
                 ("stt", "/llm/v1/audio/transcriptions", wav, content_type)]
        for name, path, body, ctype in cases:
            observe.emit({"step": "feature", "feature": name,
                          **call(base, path, token(), key, body=body, timeout=60, content_type=ctype)})
        observe.emit({"step": "feature", "feature": "stream", **stream(base, CHAT_PATH, token(), key, LONG_STREAM)})
    elif args.command == "warm-neon":
        observe.emit({"step": "warm-prime", **call(base, CHAT_PATH, token(), key, body=MOCK)})
        for trial in range(args.trials):
            observe.emit({"trial": trial, **warm_trial(base, token, key, lambda: observe.safe(neon.state),
                                                       args.db_idle_minutes * 60, args.max_wait_minutes * 60,
                                                       args.ping_seconds or None)})
    elif args.command == "shutdown":
        started = time.time()
        if args.mode == "idle-neon":
            observe.emit(idle_neon_shutdown(base, token, key, neon, args.n))
        else:
            gcloud(["run", "services", "update", "litellm-stg", "--no-traffic", f"--update-env-vars=POC_REV={int(started)}"])
            out = {}
            worker = threading.Thread(target=lambda: out.update(stream(base, CHAT_PATH, token(), key, LONG_STREAM)))
            worker.start()
            time.sleep(1)
            switched = gcloud(["run", "services", "update-traffic", "litellm-stg", "--to-latest"])
            worker.join()
            observe.emit({"step": "shutdown", "mode": args.mode, "started": started, "sent": 1, "switch": switched,
                          "stream": out})


if __name__ == "__main__":
    main()

"""Phase 2 observation helpers (stdlib only): Neon compute state and usage, the staging
database through psql, and Cloud Run billable instance time. Output is redacted JSON lines.

Environment: NEON_API_KEY and NEON_PROJECT_ID (Neon), STG_DATABASE_URL (psql),
STG_ACCOUNT (the personal gcloud account for Monitoring). Values are never printed.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

NEON_API = "https://console.neon.tech/api/v2"
MONITORING = "https://monitoring.googleapis.com/v3/projects/replay-live-508202/timeSeries"
PSQL = "/opt/homebrew/opt/libpq/bin/psql"
PATTERNS = [re.compile(p) for p in (r"sk-[A-Za-z0-9_-]{8,}",
                                    r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",
                                    r"postgres(?:ql)?://\S+")]
SECRET_VALUES = set()
KEY_HASH = re.compile(r"[0-9a-f]{64}")
QUERIES = {
    "spend-count": 'SELECT count(*), coalesce(sum(spend), 0) FROM "LiteLLM_SpendLogs" '
                   'WHERE api_key = {hash} AND "startTime" >= to_timestamp({since})',
    "key-state": 'SELECT spend, max_budget, budget_duration, budget_reset_at FROM "LiteLLM_VerificationToken" '
                 "WHERE token = {hash}",
    "expire-budget": 'UPDATE "LiteLLM_VerificationToken" SET spend = 0.01, '
                     "budget_reset_at = now() - interval '1 hour' WHERE token = {hash} RETURNING budget_reset_at",
    "tables": "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'",
}


def register_secret(value):
    if value:
        SECRET_VALUES.add(value)


def redact(text):
    for value in sorted(SECRET_VALUES, key=len, reverse=True):
        text = text.replace(value, "[redacted]")
    for pattern in PATTERNS:
        text = pattern.sub("[redacted]", text)
    return text


def record(entry):
    """One JSON line; response bodies are never recorded in full."""
    return redact(json.dumps({k: v for k, v in entry.items() if k != "body"}, ensure_ascii=False, sort_keys=True))


def emit(entry):
    print(record({"at": round(time.time(), 3), **entry}), flush=True)


def safe(fn):
    """Call fn; on a network or API error return the error name so long runs keep going."""
    try:
        return fn()
    except (OSError, ValueError, KeyError, StopIteration) as error:  # URLError is an OSError
        return "error:" + type(error).__name__


class Neon:
    """Read-only Neon control-plane calls. Neon does not document whether listing endpoints
    wakes an idle compute; 7-5 checks it (last_active must not move while polling)."""

    def __init__(self, api_key, project_id, opener=None):
        register_secret(api_key)
        self.api_key, self.project_id = api_key, project_id
        self.opener = opener or urllib.request.build_opener()

    def _get(self, path):
        request = urllib.request.Request(NEON_API + path, headers={
            "Authorization": "Bearer " + self.api_key, "Accept": "application/json"})
        with self.opener.open(request, timeout=30) as response:
            return json.loads(response.read())

    def endpoint(self):
        endpoints = self._get(f"/projects/{self.project_id}/endpoints")["endpoints"]
        return next(e for e in endpoints if e["type"] == "read_write")

    def state(self):
        return self.endpoint()["current_state"]

    def usage(self):
        project = self._get(f"/projects/{self.project_id}")["project"]
        return {k: project[k] for k in ("active_time_seconds", "compute_time_seconds") if k in project}

    def wait_for(self, wanted, timeout, interval=30, sleep=time.sleep, clock=time.monotonic):
        start = clock()
        while True:
            state = safe(self.state)
            if state == wanted or clock() - start >= timeout:
                return state
            sleep(interval)


def neon_from_env():
    if not (os.environ.get("NEON_API_KEY") and os.environ.get("NEON_PROJECT_ID")):
        return None
    return Neon(os.environ["NEON_API_KEY"], os.environ["NEON_PROJECT_ID"])


def non_idle_seconds(records, end=None):
    """Seconds the compute was not idle, from neon-watch lines (state changes with times).
    Time inside neon-gap lines (the watcher was not polling) is unknown, so it is left out
    here and reported by gap_seconds()."""
    changes = sorted((r["at"], r["state"]) for r in records if r.get("step") == "neon-state")
    gaps = [(r["from"], r["to"]) for r in records if r.get("step") == "neon-gap"]
    end = end if end is not None else max([r["at"] for r in records] or [0])
    total = 0.0
    for (at, state), (next_at, _) in zip(changes, changes[1:] + [(end, None)]):
        if state != "idle":
            unknown = sum(max(0.0, min(next_at, stop) - max(at, start)) for start, stop in gaps)
            total += max(0.0, next_at - at - unknown)
    return total


def gap_seconds(records):
    return float(sum(r["to"] - r["from"] for r in records if r.get("step") == "neon-gap"))


def watch(neon, hours, interval, emit_fn=emit, sleep=time.sleep, clock=time.time):
    """Log Neon state changes for `hours` of wall-clock time. A poll gap over three intervals
    (laptop asleep, process stopped) is logged as neon-gap and the state is logged again, so
    unknown time is never counted as a known state. Start and end lines are always written."""
    def usage():
        result = safe(neon.usage)
        return {"usage_error": result} if isinstance(result, str) else result

    emit_fn({"step": "neon-watch-start", **usage()})
    deadline, last, last_poll = clock() + hours * 3600, None, None
    while clock() < deadline:
        now = clock()
        if last_poll is not None and now - last_poll > 3 * interval:
            emit_fn({"step": "neon-gap", "from": last_poll, "to": now})
            last = None
        last_poll = now
        endpoint = safe(neon.endpoint)
        if isinstance(endpoint, str):
            emit_fn({"step": "neon-error", "error": endpoint})
        else:
            seen = (endpoint["current_state"], endpoint.get("last_active"))
            if seen != last:  # an unchanged last_active while idle shows polling does not wake it
                emit_fn({"step": "neon-state", "state": seen[0], "last_active": seen[1]})
                last = seen
        sleep(interval)
    emit_fn({"step": "neon-watch-end", **usage()})


def pg_env(url):
    """libpq settings for a postgres URL, so the password never reaches argv."""
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ("postgres", "postgresql") or not parts.hostname:
        raise ValueError("not a postgres URL")
    query = dict(urllib.parse.parse_qsl(parts.query))
    env = {"PGHOST": parts.hostname, "PGPORT": str(parts.port or 5432),
           "PGUSER": urllib.parse.unquote(parts.username or ""),
           "PGPASSWORD": urllib.parse.unquote(parts.password or ""),
           "PGDATABASE": parts.path.lstrip("/") or "postgres", "PGSSLMODE": query.get("sslmode", "require")}
    if "connect_timeout" in query:
        env["PGCONNECT_TIMEOUT"] = query["connect_timeout"]
    return env


def sql_text(name, key_hash=None, since=0.0):
    query = QUERIES[name]
    if "{hash}" in query and not KEY_HASH.fullmatch(key_hash or ""):
        raise ValueError("key hash must be 64 lowercase hex characters")
    return query.format(hash=f"'{key_hash}'", since=repr(float(since)))


def psql(sql, url, run=subprocess.run):
    register_secret(url)
    done = run([PSQL, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
               env={**os.environ, **pg_env(url)}, check=True, capture_output=True, text=True)
    return done.stdout.strip()


def billable_seconds(service, start, end, access_token, opener=None):
    """Billable instance seconds of one Cloud Run service over [start, end] (RFC 3339)."""
    register_secret(access_token)
    query = urllib.parse.urlencode({
        "filter": 'metric.type="run.googleapis.com/container/billable_instance_time" '
                  f'AND resource.labels.service_name="{service}"',
        "interval.startTime": start, "interval.endTime": end,
        "aggregation.alignmentPeriod": "3600s", "aggregation.perSeriesAligner": "ALIGN_SUM"})
    request = urllib.request.Request(MONITORING + "?" + query, headers={"Authorization": "Bearer " + access_token})
    with (opener or urllib.request.build_opener()).open(request, timeout=30) as response:
        series = json.loads(response.read()).get("timeSeries", [])
    return float(sum(point["value"].get("doubleValue", 0) for s in series for point in s["points"]))


def access_token():
    argv = ["gcloud", "auth", "print-access-token"]
    if os.environ.get("STG_ACCOUNT"):
        argv.append("--account=" + os.environ["STG_ACCOUNT"])
    return subprocess.run(argv, check=True, capture_output=True, text=True).stdout.strip()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("neon-state")
    watch = sub.add_parser("neon-watch", help="log Neon state changes; usage at start and end")
    watch.add_argument("--hours", type=float, required=True)
    watch.add_argument("--interval", type=float, default=60)
    active = sub.add_parser("neon-active", help="non-idle seconds in a neon-watch log")
    active.add_argument("file")
    wait = sub.add_parser("neon-wait-idle")
    wait.add_argument("--timeout-minutes", type=float, default=15)
    sql = sub.add_parser("sql")
    sql.add_argument("query", choices=sorted(QUERIES))
    sql.add_argument("--key-hash")
    sql.add_argument("--since", type=float, default=0.0)
    usage = sub.add_parser("run-usage")
    usage.add_argument("--start", required=True)
    usage.add_argument("--end", required=True)
    args = parser.parse_args(argv)
    if args.command == "sql":
        emit({"step": "sql", "query": args.query, "result": psql(sql_text(args.query, args.key_hash, args.since),
                                                                  os.environ["STG_DATABASE_URL"])})
        return
    if args.command == "neon-active":
        records = [json.loads(line) for line in open(args.file) if line.strip()]
        emit({"step": "neon-active", "file": os.path.basename(args.file), "active_seconds": non_idle_seconds(records),
              "unknown_seconds": gap_seconds(records)})
        return
    if args.command == "run-usage":
        token = access_token()
        for service in ("litellm-stg", "shared-ai-stg"):
            emit({"step": "run-usage", "service": service, "start": args.start, "end": args.end,
                  "billable_seconds": billable_seconds(service, args.start, args.end, token)})
        return
    neon = neon_from_env()
    if neon is None:
        sys.exit("NEON_API_KEY and NEON_PROJECT_ID are required")
    if args.command == "neon-state":
        emit({"step": "neon-state", "state": neon.state(), **neon.usage()})
    elif args.command == "neon-wait-idle":
        emit({"step": "neon-wait-idle", "state": neon.wait_for("idle", args.timeout_minutes * 60)})
    elif args.command == "neon-watch":
        watch(neon, args.hours, args.interval)


if __name__ == "__main__":
    main()

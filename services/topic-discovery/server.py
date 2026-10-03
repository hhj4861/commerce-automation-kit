"""Private backend/worker API. Never provision its keys in browser bundles."""
import hmac
import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from service import Discovery, Failure, Jev, NaverSearch, Store, canonical


def make_server(address, discovery, keys):
    if not keys or any(not re.fullmatch(r"[a-z][a-z0-9-]{1,40}", p) or not isinstance(k, str) or len(k) < 32 for p, k in keys.items()) or len(set(keys.values())) != len(keys):
        raise ValueError("Distinct platform keys of at least 32 characters required")
    slots = threading.BoundedSemaphore(8)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # Never log request bodies, credentials or research text.
        def send_json(self, status, data):
            raw = canonical(data).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
        def identity(self):
            if self.headers.get("Origin"):
                raise Failure("backend_only", 403)
            supplied = self.headers.get("Authorization", "")
            platform = next((p for p, key in keys.items() if hmac.compare_digest(supplied, "Bearer " + key)), None)
            subject = self.headers.get("X-Discovery-Subject", "")
            if not platform or not re.fullmatch("[a-f0-9]{64}", subject):
                raise Failure("authentication_required", 401)
            return platform, subject
        def body(self):
            try:
                size = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                raise Failure("invalid_body")
            if self.headers.get("Transfer-Encoding") or size <= 0 or size > 1048576:
                raise Failure("invalid_body_size", 413)
            if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                raise Failure("json_required", 415)
            raw = self.rfile.read(size)
            if len(raw) != size:
                raise Failure("incomplete_body")
            try:
                return json.loads(raw, parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
            except (ValueError, UnicodeError):
                raise Failure("invalid_json")
        def handle_request(self):
            self.connection.settimeout(15)
            if not slots.acquire(blocking=False):
                self.send_json(503, {"error": "busy"})
                return
            try:
                if self.command == "GET" and self.path == "/health":
                    self.send_json(200, {"status": "ready"})
                    return
                platform, subject = self.identity()
                scope = discovery.scope(platform, subject)
                if self.command == "POST" and self.path == "/v1/discover":
                    result = discovery.start(platform, subject, self.headers.get("Idempotency-Key"), self.body())
                else:
                    match = re.fullmatch(r"/v1/discover/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:/(claim|complete))?", self.path)
                    if not match:
                        raise Failure("not_found", 404)
                    rid, operation = match.groups()
                    if self.command == "GET" and operation is None:
                        result = discovery.store.get(scope, rid)
                    elif self.command == "POST" and operation == "claim":
                        value = self.body()
                        if not isinstance(value, dict) or set(value) != {"actionId"}:
                            raise Failure("invalid_claim")
                        result = discovery.store.claim(scope, rid, value["actionId"])
                    elif self.command == "POST" and operation == "complete":
                        result = discovery.complete(platform, subject, rid, self.body())
                    else:
                        raise Failure("method_not_allowed", 405)
                # Internal request fingerprints are not part of the client contract.
                result = {k: v for k, v in result.items() if k not in ("completionHash", "input")}
                self.send_json(200, result)
            except Failure as exc:
                self.send_json(exc.status, {"error": exc.code})
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception:
                self.send_json(503, {"error": "service_unavailable"})
            finally:
                slots.release()
        do_POST = handle_request
        do_GET = handle_request
    server = ThreadingHTTPServer(address, Handler)
    server.daemon_threads = False
    return server

if __name__ == "__main__":
    os.umask(0o077)
    if not all(os.environ.get(k) for k in ("DISCOVERY_DB", "DISCOVERY_PLATFORM_KEYS", "NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET", "JEV_BASE_URL", "JEV_API_KEY")):
        raise SystemExit("Discovery server configuration is incomplete")
    discovery = Discovery(Store(os.environ["DISCOVERY_DB"]), NaverSearch(os.environ["NAVER_CLIENT_ID"], os.environ["NAVER_CLIENT_SECRET"]), Jev(os.environ), per_day=int(os.environ.get("DISCOVERY_REQUESTS_PER_DAY", "30")))
    if not 1 <= discovery.per_day <= 1000:
        raise SystemExit("Invalid request budget")
    server = make_server((os.environ.get("DISCOVERY_BIND", "127.0.0.1"), int(os.environ.get("PORT", "4195"))), discovery, json.loads(os.environ["DISCOVERY_PLATFORM_KEYS"]))
    server.serve_forever()

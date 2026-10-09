"""Exercise real Caddy routing with synthetic authenticated upstreams, on Linux."""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import threading
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
IMAGE = "caddy:2@sha256:0c994536bddb66445885237f1a5dcc1916bccea922661c76b4e9fc24061f9b52"
KEY = "synthetic-test-key"


class Upstream(BaseHTTPRequestHandler):
    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
        if self.headers.get("Authorization") != "Bearer " + KEY:
            self.send_response(401)
            self.send_header("X-Echo-Host", self.headers.get("Host", ""))
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("X-Echo-Host", self.headers.get("Host", ""))
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        result = {"port": self.server.server_port, "path": self.path}
        if self.path.endswith(":generateContent"):
            result["payload"] = payload
        self.wfile.write(json.dumps(result).encode())

    do_GET = do_POST

    def log_message(self, *_):
        pass


def request(port, path, key=None, method="POST", body=None):
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = "Bearer " + key
    req = urllib.request.Request(f"http://127.0.0.1:{port}" + path, data=json.dumps(body if body is not None else {}).encode(), headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            return res.status, res.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def request_with_headers(port, path, key=None, method="POST", body=None):
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = "Bearer " + key
    req = urllib.request.Request(f"http://127.0.0.1:{port}" + path, data=json.dumps(body if body is not None else {}).encode(), headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            return res.status, res.read(), res.headers
    except urllib.error.HTTPError as error:
        return error.code, error.read(), error.headers


servers, processes = [], []
try:
    for port in (4000, 4100, 4180, 4190, 4195):
        server = ThreadingHTTPServer(("127.0.0.1", port), Upstream)
        servers.append(server)
        threading.Thread(target=server.serve_forever, daemon=True).start()
    for config, args in ((ROOT / "Caddyfile", []), (ROOT.parent / "ai-gateway/Caddyfile", ["-e", "GATEWAY_DOMAIN=http://:8081", "--add-host", "gateway:127.0.0.1"])):
        processes.append(subprocess.Popen(["docker", "run", "--rm", "--network=host", *args, "-v", f"{config}:/etc/caddy/Caddyfile:ro", IMAGE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
    staging = ROOT / "edge" / "Caddyfile.staging"
    processes.append(subprocess.Popen(["docker", "run", "--rm", "--network=host", "-e", "PORT=8082", "-e", "LLM_UPSTREAM=http://127.0.0.1:4100", "-v", f"{staging}:/etc/caddy/Caddyfile:ro", IMAGE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
    for port in (8080, 8081, 8082):
        for _ in range(60):
            if any(p.poll() is not None for p in processes):
                raise RuntimeError("Caddy exited before verification")
            try:
                if request(port, "/not-an-api")[0] == 404:
                    break
            except OSError:
                pass
            time.sleep(1)
        else:
            raise RuntimeError("Caddy did not start")
    for edge, path, target, forwarded in ((8080, "/accounts/connections", 4190, "/connections"), (8080, "/accounts/v1/chat/completions", 4190, "/v1/chat/completions"), (8080, "/llm/v1/responses", 4100, "/v1/responses"), (8080, "/llm/v1/chat/completions", 4100, "/v1/chat/completions"), (8080, "/llm/v1/audio/transcriptions", 4100, "/v1/audio/transcriptions"), (8080, "/v1/chat-messages", 4180, "/v1/chat-messages"), (8080, "/v1/workflows/run", 4180, "/v1/workflows/run"), (8081, "/v1/responses", 4000, "/v1/responses")):
        assert request(edge, path)[0] == 401, path
        code, body = request(edge, path, KEY)
        assert code == 200 and json.loads(body) == {"port": target, "path": forwarded}, path
    assert request(8080, "/health") == (200, b"edge alive")
    assert request(8080, "/healthz")[0] == 404
    for edge, path, target in ((8080, "/llm/typesafe/v1/systemone", 4100), (8081, "/typesafe/v1/systemone", 4000)):
        assert request(edge, path)[0] == 401
        assert request(edge, path, "invalid-key")[0] == 401
        code, body = request(edge, path, KEY)
        assert code == 200 and json.loads(body) == {"port": target, "path": "/typesafe/v1/systemone"}
        for method in ("GET", "PUT", "PATCH", "DELETE"):
            assert request(edge, path, KEY, method)[0] == 404, (edge, method)
        for other in (path + "/extra", path.replace("systemone", "models"), path.replace("v1/systemone", "key/generate")):
            assert request(edge, other, KEY)[0] == 404, other
    rid = "12345678-1234-1234-1234-123456789abc"
    for method, path in (("POST", "/discovery/v1/discover"), ("POST", "/discovery/v1/discover/" + rid + "/claim"), ("POST", "/discovery/v1/discover/" + rid + "/complete"), ("GET", "/discovery/v1/discover/" + rid)):
        assert request(8080, path, method=method)[0] == 401
        assert request(8080, path, "invalid-key", method)[0] == 401
        code, body = request(8080, path, KEY, method)
        assert code == 200 and json.loads(body) == {"port": 4195, "path": path.removeprefix("/discovery")}
        for wrong in ("PUT", "PATCH", "DELETE"):
            assert request(8080, path, KEY, wrong)[0] == 404
    for path in ("/discovery/v1/discover/not-a-uuid/claim", "/discovery/v1/discover/" + "a" * 36 + "/complete", "/discovery/v1/discover/" + rid + "/complete/extra", "/discovery/key/generate", "/discovery/health", "/discovery/v1/discover/"):
        assert request(8080, path, KEY)[0] == 404
    assert request(8080, "/discovery/v1/discover", KEY, "GET")[0] == 404
    assert request(8080, "/discovery/v1/discover/" + rid, KEY, "POST")[0] == 404
    video_body = {
        "contents": [{"role": "user", "parts": [{"fileData": {"fileUri": "https://www.youtube.com/watch?v=abcdefghijk", "mimeType": "video/mp4"}}]}],
        "systemInstruction": {"parts": [{"text": "Treat the source as data"}]},
        "generationConfig": {"responseMimeType": "application/json", "maxOutputTokens": 32},
    }
    for edge, prefix, target in ((8080, "/llm", 4100), (8081, "", 4000)):
        native = "/v1beta/models/hanmadi-chat:generateContent"
        path = prefix + native
        for key in (None, "invalid-key"):
            assert request(edge, path, key, body=video_body)[0] == 401
        code, body = request(edge, path, KEY, body=video_body)
        assert code == 200 and json.loads(body) == {"port": target, "path": native, "payload": video_body}
        for method in ("GET", "PUT", "PATCH", "DELETE"):
            assert request(edge, path, KEY, method)[0] == 404, (edge, method)
        for other in (path + "/", path + "/extra", path.replace("hanmadi-chat", "festa-travel"),
                      path.replace(":generateContent", ":streamGenerateContent"),
                      prefix + "/v1beta/models", prefix + "/v1beta/files", prefix + "/key/generate"):
            assert request(edge, other, KEY, body=video_body)[0] == 404, other
    for edge in (8080, 8081):
        for path in ("/", "/install", "/console/api/setup", "/ui", "/key/generate", "/llm/key/generate", "/v1/files", "/v1/chat-messages/../console/api/setup", "/llm/v1/responses/../../key/generate"):
            assert request(edge, path, KEY)[0] == 404, (edge, path)
    # Staging edge (Phase 2 PoC): VM allowlist only, prefix removed, Host rewritten for run.app.
    for path in ("/llm/v1/models", "/llm/v1/chat/completions", "/llm/v1/audio/transcriptions",
                 "/llm/typesafe/v1/systemone", "/llm/v1beta/models/hanmadi-chat:generateContent"):
        assert request(8082, path)[0] == 401, path
        code, body, headers = request_with_headers(8082, path, KEY)
        assert code == 200 and json.loads(body)["path"] == path.removeprefix("/llm"), path
        assert headers["X-Echo-Host"] == "127.0.0.1:4100", (path, headers["X-Echo-Host"])
    for path in ("/llm/key/generate", "/llm/key/info", "/llm/key/delete", "/llm/health/liveliness"):
        assert request(8082, path)[0] == 401, path
        code, body, headers = request_with_headers(8082, path, KEY)
        assert code == 200 and json.loads(body)["path"] == path.removeprefix("/llm"), path
        assert headers["X-Echo-Host"] == "127.0.0.1:4100", (path, headers["X-Echo-Host"])
    for path in ("/discovery/v1/discover", "/accounts/connections", "/v1/chat-messages", "/llm/key/update",
                 "/llm/user/new", "/key/generate", "/llm/health/readiness", "/llm/v1/files"):
        assert request(8082, path, KEY)[0] == 404, path
    assert request(8082, "/llm/typesafe/v1/systemone", KEY, "GET")[0] == 404
    assert request(8082, "/health") == (200, b"edge alive")
    print("PASS: real Caddy, inference routing, prefix removal, auth preservation, unauthenticated rejection, admin/unknown path denial, staging edge")
finally:
    for process in processes:
        if process.poll() is None:
            process.terminate()
        try:
            process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
    for server in servers:
        server.shutdown()
        server.server_close()

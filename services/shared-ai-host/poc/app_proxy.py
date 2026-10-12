"""Loopback-only IAM adapter for isolated app tests. No key issuance or provider retries."""
import argparse
import base64
import json
import re
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, build_opener, HTTPRedirectHandler, ProxyHandler

EDGE = re.compile(r"https://shared-ai-stg-[a-z0-9-]+\.a\.run\.app")
RID = r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"
POST = re.compile(r"(?:/llm/v1/(?:chat/completions|responses|embeddings|audio/speech|audio/transcriptions)|/llm/typesafe/v1/systemone|/llm/v1beta/models/hanmadi-chat:generateContent|/discovery/v1/discover(?:/" + RID + r"/(?:claim|complete))?)")
GET = re.compile(r"(?:/llm/v1/models|/discovery/v1/discover/" + RID + r")")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Identity:
    def __init__(self, account):
        self.account, self.value, self.expires = account, None, 0
        self.lock = threading.Lock()

    def __call__(self):
        with self.lock:
            if time.time() >= self.expires - 60:
                token = subprocess.run(["gcloud", "auth", "print-identity-token", "--account=" + self.account],
                                       capture_output=True, text=True, check=True, timeout=15).stdout.strip()
                if not re.fullmatch(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", token):
                    raise ValueError("invalid identity")
                part = token.split(".")[1]
                expiry = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))["exp"]
                if not isinstance(expiry, (int, float)) or expiry <= time.time() + 60:
                    raise ValueError("expired identity")
                self.value, self.expires = token, expiry
            return self.value


def make_server(edge, identity, port=0, opener=None):
    if not EDGE.fullmatch(edge):
        raise ValueError("Only the named staging edge is allowed")
    transport = opener or build_opener(ProxyHandler({}), NoRedirect())
    slots = threading.BoundedSemaphore(8)

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.0"

        def log_message(self, *args):
            pass

        def reject(self, status):
            self.send_response(status)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def handle_request(self):
            self.connection.settimeout(15)
            if self.headers.get("Host") not in (f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}") or self.headers.get("Origin"):
                return self.reject(403)
            pattern = POST if self.command == "POST" else GET
            if not pattern.fullmatch(self.path):
                return self.reject(404)
            if not self.headers.get("Authorization", "").startswith("Bearer "):
                return self.reject(401)
            if len(self.headers.get_all("Content-Length", [])) > 1 or self.headers.get("Transfer-Encoding"):
                return self.reject(400)
            try:
                size = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self.reject(400)
            if not 0 <= size <= 16 * 1024 * 1024 or (self.command == "GET" and size):
                return self.reject(413)
            if not slots.acquire(blocking=False):
                return self.reject(503)
            started = False
            response = None
            try:
                body = self.rfile.read(size) if self.command == "POST" else None
                if body is not None and len(body) != size:
                    return self.reject(400)
                headers = {name: self.headers[name] for name in ("Authorization", "Content-Type", "X-Discovery-Subject", "Idempotency-Key") if self.headers.get(name)}
                headers["X-Serverless-Authorization"] = "Bearer " + identity()
                request = Request(edge + self.path, data=body, method=self.command, headers=headers)
                try:
                    response = transport.open(request, timeout=120)
                except HTTPError as exc:
                    response = exc
                self.send_response(response.status)
                for name in ("Content-Type", "Content-Length", "Cache-Control"):
                    if response.headers.get(name):
                        self.send_header(name, response.headers[name])
                self.end_headers()
                started = True
                while chunk := response.read1(8192):
                    self.wfile.write(chunk)
                    self.wfile.flush()
            except Exception:
                if not started:
                    self.reject(502)
                # Never expose the request, token, key, upstream exception or body in logs.
            finally:
                if response:
                    response.close()
                self.close_connection = True
                slots.release()

        do_GET = handle_request
        do_POST = handle_request

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--edge", required=True)
    parser.add_argument("--account", default="guswhd1085@gmail.com")
    parser.add_argument("--port", type=int, default=4196)
    parser.add_argument("--duration", type=int, default=3600)
    parser.add_argument("--confirm-trial", action="store_true")
    parser.add_argument("--tls-cert", help="Local test certificate with localhost/127.0.0.1 SAN")
    parser.add_argument("--tls-key", help="Private key outside the repository and cloud-synced folders")
    args = parser.parse_args()
    if bool(args.tls_cert) != bool(args.tls_key):
        parser.error("Supply both --tls-cert and --tls-key")
    if not args.confirm_trial or not 1 <= args.duration <= 3600:
        parser.error("After observations finish, use --confirm-trial with a duration of 1..3600 seconds")
    server = make_server(args.edge, Identity(args.account), args.port)
    if args.tls_cert:
        import ssl
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.load_cert_chain(args.tls_cert, args.tls_key)
        server.socket = context.wrap_socket(server.socket, server_side=True)
    timer = threading.Timer(args.duration, server.shutdown)
    timer.daemon = True
    timer.start()
    print(f"App trial proxy on 127.0.0.1:{server.server_port}; no requests made", flush=True)
    try:
        server.serve_forever()
    finally:
        timer.cancel()
        server.server_close()


if __name__ == "__main__":
    main()

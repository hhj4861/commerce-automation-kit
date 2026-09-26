"""CI-only synthetic provider. No external network calls or real credentials."""
from http.server import BaseHTTPRequestHandler, HTTPServer
import json


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        response = {"id": "mock-1", "object": "chat.completion", "created": 1,
                    "model": request["model"], "choices": [{"index": 0, "finish_reason": "stop",
                    "message": {"role": "assistant", "content": "CI mock response"}}],
                    "usage": {"prompt_tokens": 10, "completion_tokens": 4, "total_tokens": 14}}
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream" if request.get("stream") else "application/json")
        self.end_headers()
        if request.get("stream"):
            for delta, finish in (({"role": "assistant", "content": "CI mock response"}, None), ({}, "stop")):
                chunk = {"id": "mock-1", "object": "chat.completion.chunk", "created": 1,
                         "model": request["model"], "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}
                self.wfile.write(("data: " + json.dumps(chunk) + "\n\n").encode())
            self.wfile.write(b"data: [DONE]\n\n")
        else:
            self.wfile.write(json.dumps(response).encode())

    def log_message(self, *_):
        pass


HTTPServer(("0.0.0.0", 8000), Handler).serve_forever()

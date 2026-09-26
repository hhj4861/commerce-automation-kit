"""Disposable CI only: version-pinned internal console bootstrap, public API E2E.

Never run against a live workspace. Uses synthetic users and provider responses.
No admin password, cookie, virtual key or response body is printed.
"""
import base64
from http.cookiejar import CookieJar
import json
import os
from pathlib import Path
import secrets
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import build_opener, HTTPCookieProcessor, Request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / "ai-gateway"))
from gateway import read_env

BASE = "http://localhost:4180"
CONSOLE = "/console/api"
jar = CookieJar()
client = build_opener(HTTPCookieProcessor(jar))
lock = json.loads((ROOT / "upstream.json").read_text())


def call(path, data=None, key=None):
    headers = {"Content-Type": "application/json"}
    for cookie in jar:
        if cookie.name == "csrf_token":
            headers["X-CSRF-Token"] = cookie.value
    if key:
        headers["Authorization"] = "Bearer " + key
    req = Request(BASE + path, headers=headers, data=json.dumps(data).encode() if data is not None else None)
    try:
        with client.open(req, timeout=180) as response:
            return json.load(response)
    except HTTPError as error:
        # Status/path only; provider errors can contain credentials or payloads.
        raise RuntimeError(f"{req.method} {path}: HTTP {error.code}") from None


def wait_ready():
    for attempt in range(120):
        try:
            status = call(CONSOLE + "/setup")
            if status["step"] != "not_started":
                raise RuntimeError("Refusing to change an initialized workspace")
            return
        except (URLError, ConnectionError, RuntimeError):
            if attempt == 119:
                raise
            time.sleep(5)


def main():
    if os.environ.get("DIFY_DISPOSABLE_CI") != "1" or os.environ.get("GITHUB_ACTIONS") != "true":
        raise RuntimeError("This destructive bootstrap test is restricted to disposable GitHub Actions")
    wait_ready()
    env = read_env(ROOT / ".upstream/dify/docker/.env")
    call(CONSOLE + "/init", {"password": env["INIT_PASSWORD"]})
    password = secrets.token_hex(16) + "Aa1"
    call(CONSOLE + "/setup", {"email": "dify-ci@example.com", "name": "CI admin", "password": password, "language": "ko-KR"})
    call(CONSOLE + "/login", {"email": "dify-ci@example.com", "password": base64.b64encode(password.encode()).decode()})
    print("Dify first-time setup and authenticated console PASS", flush=True)
    install = call(CONSOLE + "/workspaces/current/plugin/install/marketplace", {"plugin_unique_identifiers": [lock["plugin"]]})
    task_id = install.get("task_id")
    if task_id:
        for _ in range(120):
            task = call(CONSOLE + "/workspaces/current/plugin/tasks/" + task_id)["task"]
            status = task["status"]
            if status == "success":
                break
            if status == "failed":
                raise RuntimeError("Signed model plugin installation failed")
            time.sleep(5)
        else:
            raise RuntimeError("Signed model plugin installation timed out")
    print("Signed OpenAI-compatible plugin installed", flush=True)
    for app, template, alias in (("hanmadi", "hanmadi-tutor", "hanmadi-chat"), ("replay", "replay-planner", "replay-video-planner")):
        virtual_key = read_env(ROOT.parent / "ai-gateway" / ".runtime" / f"{app}.env")["LITELLM_API_KEY"]
        call(CONSOLE + "/workspaces/current/model-providers/" + lock["provider"] + "/models/credentials", {
            "model": alias, "model_type": "llm", "name": app,
            "credentials": {"api_key": virtual_key, "endpoint_url": "http://gateway:4000/v1", "mode": "chat",
                            "context_size": "4096", "max_tokens_to_sample": "2048", "stream_mode_auth": "use"}})
        imported = call(CONSOLE + "/apps/imports", {"mode": "yaml-content", "yaml_content": (ROOT / "apps" / f"{template}.yml").read_text()})
        if imported["status"] == "pending":
            imported = call(CONSOLE + "/apps/imports/" + imported["id"] + "/confirm", {})
        assert imported["status"] in ("completed", "completed-with-warnings"), "DSL import failed"
        app_id = imported["app_id"]
        call(CONSOLE + f"/apps/{app_id}/workflows/publish", {})
        key = call(CONSOLE + f"/apps/{app_id}/api-keys", {})["token"]
        if app == "hanmadi":
            payload = {"inputs": {"language": "태국어", "level": "입문", "scenario": "카페 주문"}, "query": "인사부터 연습할래요", "user": "ci-learner-one", "response_mode": "blocking"}
            result = call("/v1/chat-messages", payload, key)
            assert result["answer"] == "CI mock response", "Hanmadi did not reach mock provider through LiteLLM"
            conversation = result["conversation_id"]
            payload.update(conversation_id=conversation, query="한 번 더 연습할게요")
            assert call("/v1/chat-messages", payload, key)["conversation_id"] == conversation
            payload["user"] = "ci-learner-two"
            try:
                call("/v1/chat-messages", payload, key)
            except RuntimeError as error:
                assert "HTTP 404" in str(error), "Unexpected conversation denial"
            else:
                raise AssertionError("Another end-user reused the first user's conversation")
        else:
            result = call("/v1/workflows/run", {"inputs": {"brief": "직접 촬영한 머그컵 소개", "audience": "커피 애호가", "duration": "15초", "channel": "YouTube Shorts"}, "user": "ci-editor", "response_mode": "blocking"}, key)
            assert result["data"]["status"] == "succeeded", "Replay workflow failed"
            assert result["data"]["outputs"]["answer"] == "CI mock response"
        print(app + " DSL import, publish, app API -> Dify -> LiteLLM -> mock PASS", flush=True)
    print("Dify integration PASS; synthetic provider only, no real model quality claim", flush=True)


if __name__ == "__main__":
    main()

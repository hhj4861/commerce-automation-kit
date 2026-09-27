"""Actual proxy/DB/account isolation, synthetic provider and credentials, CI only."""
import json
import os
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from gateway import ROOT, ApiError, Client, private_write, provision_scope, read_env
from subscriptions import create, folder


if os.environ.get("GITHUB_ACTIONS") != "true":
    raise SystemExit("This fixture is restricted to the disposable GitHub Actions stack.")

if sys.argv[1:] == ["prepare"]:
    for account in ("alice", "bob"):
        create(account, "gpt-5.4")
    for account in ("alice", "bob"):
        directory = folder(ROOT, account)
        config = json.loads((directory / "config.json").read_text())
        config["model_list"] = [{"model_name": "codex-" + account, "litellm_params": {
            "model": "openai/gpt-4o-mini", "api_key": "ci-not-a-provider-key", "api_base": "http://mock:8000/v1",
        }}]
        private_write(directory / "config.json", json.dumps(config))
        private_write(directory / "auth/auth.json", json.dumps({"access_token": "ci-not-an-oauth-token", "expires_at": time.time() + 3600}))
    print("Prepared isolated subscription fixtures; no provider OAuth or live inference.")
else:
    base = "http://127.0.0.1:4100"
    for own, other in (("alice", "bob"), ("bob", "alice")):
        alias = "codex-" + own
        target = provision_scope(alias, [alias], 1, base)
        client = Client(base, read_env(target)["LITELLM_API_KEY"])
        listed = {m["id"] for m in client.call("/v1/models")["data"]}
        assert listed == {alias}, listed
        result = client.call("/v1/chat/completions", {"model": alias, "messages": [{"role": "user", "content": "CI account isolation"}]})
        assert result["choices"][0]["message"]["content"] == "CI mock response"
        for forbidden in ("codex-" + other, "hanmadi-chat"):
            try:
                client.call("/v1/chat/completions", {"model": forbidden, "messages": [{"role": "user", "content": "must be denied"}]})
                raise AssertionError("Cross-account access accepted")
            except ApiError as error:
                assert error.status in (401, 403), error.status
    client = Client(base, read_env(ROOT / ".runtime/hanmadi.env")["LITELLM_API_KEY"])
    try:
        client.call("/v1/chat/completions", {"model": "codex-alice", "messages": [{"role": "user", "content": "must be denied"}]})
        raise AssertionError("Shared app key accessed personal subscription")
    except ApiError as error:
        assert error.status in (401, 403), error.status
    print("PASS: real LiteLLM/DB, per-account workers, own model works, cross-account/shared-app access denied (synthetic upstream).")

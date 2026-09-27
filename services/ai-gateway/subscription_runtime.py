"""Runs inside ONE account's LiteLLM process. No tokens are emitted."""
import importlib.metadata
import fcntl
import json
import os
from pathlib import Path
import sys
import threading
import time


def auth_path():
    directory = Path(os.environ["CHATGPT_TOKEN_DIR"])
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory.chmod(0o700)
    return directory / "auth.json"


def cached_status():
    path = auth_path()
    if not path.exists():
        return {"state": "not_connected", "verified": False}
    data = json.loads(path.read_text())
    present = bool(data.get("access_token"))
    expires = data.get("expires_at")
    stale = isinstance(expires, (float, int)) and expires <= time.time() + 60
    return {"state": "refresh_needed" if present and stale else "cached" if present else "not_connected", "verified": False}


def noninteractive_auth():
    """Fail closed instead of starting a device-code login from an inference request.

    The pinned image's internal hook is covered by the image compatibility test.
    Explicit `login` uses the original LiteLLM device flow.
    """
    from litellm.llms.chatgpt.authenticator import Authenticator
    if not callable(getattr(Authenticator, "_login_device_code", None)):
        raise RuntimeError("Unsupported LiteLLM authentication interface")
    def require_reconnect(self):
        raise RuntimeError("ChatGPT account needs an explicit subscription login")
    Authenticator._login_device_code = require_reconnect
    original = Authenticator.get_access_token
    lock = threading.RLock()
    def serialized(self):
        with lock:
            return original(self)
    Authenticator.get_access_token = serialized


def probe():
    import litellm
    litellm.set_verbose = False
    litellm.turn_off_message_logging = True
    response = litellm.responses(model="chatgpt/" + os.environ["SUBSCRIPTION_MODEL"], input="Reply with only OK.", timeout=90, num_retries=0)
    data = response.model_dump()
    text = "".join(part.get("text", "") for item in data.get("output", []) for part in (item.get("content") or []) if part.get("type") == "output_text")
    if not text.strip():
        raise RuntimeError("No model response")
    return {"state": "connected", "verified": True, "model_response_received": True}


def main():
    os.umask(0o077)
    action = sys.argv[1]
    path = auth_path()
    session_lock = None
    try:
        if action != "status":
            session_lock = (path.parent / ".session.lock").open("a")
            fcntl.flock(session_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if action == "status":
            result = cached_status()
        elif action == "logout":
            path.unlink(missing_ok=True)
            result = {"state": "not_connected", "local_credentials_removed": True, "provider_grant_revoked": False}
        elif action == "login":
            from litellm.llms.chatgpt.authenticator import Authenticator
            # The library prints only its device verification URL/code here.
            Authenticator().get_access_token()
            noninteractive_auth()
            result = probe()
        elif action == "probe":
            noninteractive_auth()
            result = probe()
        elif action == "serve":
            noninteractive_auth()
            if cached_status()["state"] == "not_connected":
                raise RuntimeError("Login required before serving")
            sys.argv = ["litellm", *sys.argv[2:]]
            entry = next(e for e in importlib.metadata.entry_points(group="console_scripts") if e.name == "litellm")
            entry.load()()
            return
        else:
            raise ValueError("Unknown operation")
        print(json.dumps(result), flush=True)
    except Exception as error:
        # Upstream exception strings may contain headers or tokens.
        status = getattr(error, "status_code", None)
        status = status if isinstance(status, int) and 400 <= status <= 599 else None
        print(json.dumps({"state": "error", "verified": False, "error_type": type(error).__name__, "http_status": status, "message": "Account operation failed; check runtime, account access, quota, or reconnect."}), flush=True)
        raise SystemExit(1)
    finally:
        if path.exists():
            path.chmod(0o600)
        if session_lock is not None:
            session_lock.close()


if __name__ == "__main__":
    main()

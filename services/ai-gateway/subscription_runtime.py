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


def repair_subscription_bridge():
    """Pinned 1.102.1 bridge drops output when the terminal SSE snapshot is empty.

    Reuse the provider's own SSE recovery; apply only to ChatGPT streams in this
    private worker. No credentials, request routing, or upstream calls change.
    """
    from litellm.completion_extras.litellm_responses_transformation.handler import ResponsesToCompletionBridgeHandler as Bridge
    from litellm.llms.chatgpt.responses.transformation import ChatGPTResponsesAPIConfig
    original_sync = Bridge._collect_response_from_stream
    original_async = Bridge._collect_response_from_stream_async
    if getattr(original_sync, "_subscription_repair", False):
        return

    def restore(stream, events):
        response, error = ChatGPTResponsesAPIConfig()._extract_completed_response_from_sse(
            body_text="\n".join("data: " + json.dumps(e.model_dump() if hasattr(e, "model_dump") else e) for e in events)
        )
        if response is None or error:
            raise RuntimeError("Subscription stream did not complete")
        stream.completed_response.response = response

    def collect(self, stream):
        if getattr(stream, "custom_llm_provider", None) == "chatgpt":
            events = list(stream)
            restore(stream, events)
        return original_sync(self, stream)

    async def collect_async(self, stream):
        if getattr(stream, "custom_llm_provider", None) == "chatgpt":
            events = [event async for event in stream]
            restore(stream, events)
        return await original_async(self, stream)

    collect._subscription_repair = True
    Bridge._collect_response_from_stream = collect
    Bridge._collect_response_from_stream_async = collect_async


def response_text(response):
    def as_dict(value):
        return value.model_dump() if hasattr(value, "model_dump") else value
    completed_text = []
    if hasattr(response, "model_dump") or isinstance(response, dict):
        data = as_dict(response)
    else:
        # ChatGPT's backend always streams. The pinned SDK can return an
        # iterator even when stream was not requested. Require terminal success.
        data = None
        for item in response:
            event = as_dict(item)
            if event.get("type") == "response.completed":
                data = event["response"]
            elif event.get("type") == "response.output_text.done":
                completed_text.append(event.get("text", ""))
            elif event.get("type") in ("error", "response.failed", "response.incomplete"):
                raise RuntimeError("Subscription response did not complete")
        if data is None:
            raise RuntimeError("Subscription stream ended without completion")
    text = "".join(part.get("text", "") for item in (data.get("output") or []) for part in (item.get("content") or []) if part.get("type") == "output_text")
    # The subscription backend can omit output from its terminal event.
    # Completed text events are usable only after terminal success was received.
    text = text or "".join(completed_text)
    if not text.strip():
        raise RuntimeError("No model response")
    return text


def probe():
    import litellm
    litellm.set_verbose = False
    litellm.turn_off_message_logging = True
    response = litellm.responses(model="chatgpt/" + os.environ["SUBSCRIPTION_MODEL"], input=[{"role": "user", "content": [{"type": "input_text", "text": "Reply with only OK."}]}], timeout=90, num_retries=0)
    response_text(response)
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
            repair_subscription_bridge()
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

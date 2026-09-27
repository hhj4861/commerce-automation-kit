"""Standalone LiteLLM configuration/admin helper; Python standard library only."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import secrets
import shlex
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
APPS = {"hanmadi": ["hanmadi-chat", "hanmadi-stt", "hanmadi-tts"],
        "replay": ["replay-video-planner"]}


def private_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as stream:
        stream.write(data)
    path.chmod(0o600)


def read_env(path):
    values = {}
    for line in path.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        parts = shlex.split(value, comments=True)
        values[key.strip()] = " ".join(parts)
    return values


def init(root=ROOT):
    target = root / ".env"
    if target.exists():
        raise ValueError(".env already exists; refusing to replace the persistent salt or keys.")
    values = read_env(root / ".env.example")
    values.update(LITELLM_MASTER_KEY="sk-" + secrets.token_hex(32),
                  LITELLM_SALT_KEY="sk-" + secrets.token_hex(32),
                  POSTGRES_PASSWORD=secrets.token_hex(32))
    private_write(target, "".join(f"{k}={v}\n" for k, v in values.items()))


def render(root=ROOT):
    env = read_env(root / ".env")
    for key in ("LITELLM_MASTER_KEY", "LITELLM_SALT_KEY", "POSTGRES_PASSWORD"):
        if len(env.get(key, "")) < 32:
            raise ValueError(f"Missing/weak infrastructure setting: {key}")
    # Password is embedded into the Compose database URL: require URL-safe characters.
    if any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for c in env["POSTGRES_PASSWORD"]):
        raise ValueError("POSTGRES_PASSWORD must be URL-safe (letters/digits/-/_).")
    models = []
    for app, alias in (("HANMADI", "hanmadi-chat"), ("REPLAY", "replay-video-planner")):
        model = env.get(f"{app}_CHAT_MODEL", "")
        if not model:
            continue
        local = model.startswith(("ollama/", "ollama_chat/"))
        if not local and not env.get(f"{app}_CHAT_API_KEY"):
            raise ValueError(f"{app}_CHAT_API_KEY is required for this provider.")
        params = {"model": model}
        if not local:
            params["api_key"] = f"os.environ/{app}_CHAT_API_KEY"
        if env.get(f"{app}_CHAT_API_BASE"):
            url = urllib.parse.urlsplit(env[f"{app}_CHAT_API_BASE"])
            if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password or url.query or url.fragment:
                raise ValueError(f"Invalid {app}_CHAT_API_BASE")
            params["api_base"] = f"os.environ/{app}_CHAT_API_BASE"
        elif local:
            raise ValueError(f"{app}_CHAT_API_BASE is required for a separately hosted Ollama server.")
        models.append({"model_name": alias, "litellm_params": params})
    if env.get("ELEVENLABS_API_KEY"):
        for alias, model in (("hanmadi-stt", "scribe_v1"), ("hanmadi-tts", "eleven_v3")):
            models.append({"model_name": alias, "litellm_params": {
                "model": f"elevenlabs/{model}", "api_key": "os.environ/ELEVENLABS_API_KEY"}})
    config = {"model_list": models,
              "general_settings": {"master_key": "os.environ/LITELLM_MASTER_KEY", "store_prompts_in_spend_logs": False},
              "litellm_settings": {"set_verbose": False, "turn_off_message_logging": True,
                                   "num_retries": 0, "request_timeout": 30}}
    private_write(root / ".runtime/litellm.json", json.dumps(config, indent=2) + "\n")
    return [m["model_name"] for m in models]


class ApiError(Exception):
    def __init__(self, status):
        self.status = status
        super().__init__(f"Gateway HTTP {status}; response withheld to avoid logging secrets.")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Client:
    def __init__(self, base, key):
        url = urllib.parse.urlsplit(base)
        if url.scheme != "https" and not (url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1", "::1")):
            raise ValueError("Management URL requires HTTPS or loopback HTTP.")
        if not url.hostname or url.username or url.password or url.query or url.fragment or url.path not in ("", "/"):
            raise ValueError("Management URL must be a bare origin without credentials.")
        self.base, self.key = base.rstrip("/"), key

    def call(self, path, data=None):
        request = urllib.request.Request(self.base + path, data=None if data is None else json.dumps(data).encode(),
                                        headers={"Authorization": "Bearer " + self.key, "Content-Type": "application/json"})
        try:
            with urllib.request.build_opener(NoRedirect).open(request, timeout=45) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            raise ApiError(error.code) from None
        except urllib.error.URLError:
            raise ValueError("Gateway unreachable; check startup/SSH tunnel.") from None


def provision(app, budget, base, root=ROOT, client=None):
    if not math.isfinite(budget) or budget <= 0:
        raise ValueError("Choose an explicit positive 30-day USD budget.")
    env = read_env(root / ".env")
    client = client or Client(base, env["LITELLM_MASTER_KEY"])
    available = {m["id"] for m in client.call("/v1/models")["data"]}
    allowed = [m for m in APPS[app] if m in available]
    if not allowed:
        raise ValueError("No configured models for this app; refusing an empty/unrestricted key.")
    team_id = f"cak-{app}"
    team = {"team_id": team_id, "team_alias": app, "models": allowed,
            "max_budget": budget, "budget_duration": "30d", "rpm_limit": 30}
    try:
        current = client.call("/team/info?" + urllib.parse.urlencode({"team_id": team_id}))["team_info"]
        if set(current["models"]) != set(allowed) or current["max_budget"] != budget or current.get("budget_duration") != "30d" or current.get("rpm_limit") != 30:
            raise ValueError("Existing team policy differs; review it in the private admin UI before changing keys.")
    except ApiError as error:
        if error.status != 404:
            raise
        client.call("/team/new", team)
    target = root / f".runtime/{app}.env"
    pending = root / f".runtime/{app}.key-pending"
    if target.exists():
        # Fail visibly for revoked or wrong-server keys instead of silently replacing them.
        saved = read_env(target)
        key_hash = hashlib.sha256(saved["LITELLM_API_KEY"].encode()).hexdigest()
        info = client.call("/key/info?" + urllib.parse.urlencode({"key": key_hash}))["info"]
        if info["team_id"] != team_id or set(info["models"]) != set(allowed) or info["max_budget"] != budget:
            raise ValueError("Existing app key policy differs; inspect/revoke it before reissuing.")
        return target
    if pending.exists():
        raise ValueError("Previous key issuance was interrupted. Inspect/revoke the app's key in the admin UI before removing its pending marker.")
    private_write(pending, "Key issuance started; inspect admin UI before retry if interrupted.\n")
    response = client.call("/key/generate", {"team_id": team_id, "key_alias": f"{app}-server",
                                           "models": allowed, "max_budget": budget,
                                           "budget_duration": "30d", "rpm_limit": 30})
    values = {"LITELLM_BASE_URL": base.rstrip("/") + "/v1", "LITELLM_API_KEY": response["key"],
              "LITELLM_MODEL": "hanmadi-chat" if "hanmadi-chat" in allowed else "replay-video-planner" if "replay-video-planner" in allowed else ""}
    if app == "hanmadi":
        values.update(LITELLM_STT_MODEL="hanmadi-stt" if "hanmadi-stt" in allowed else "",
                      LITELLM_TTS_MODEL="hanmadi-tts" if "hanmadi-tts" in allowed else "",
                      LITELLM_TTS_VOICE="n2fbxG88jqAoaVPUy3IG")
    private_write(target, "".join(f"{k}={v}\n" for k, v in values.items()))
    pending.unlink()
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init")
    sub.add_parser("render")
    p = sub.add_parser("provision")
    p.add_argument("--app", choices=APPS, required=True)
    p.add_argument("--budget-usd", type=float, required=True)
    p.add_argument("--url", default="http://127.0.0.1:4100")
    args = parser.parse_args()
    try:
        if args.command == "init":
            init()
            print("Created private .env. Preserve the salt and database backups together.")
        elif args.command == "render":
            names = render()
            print("Configured models: " + (", ".join(names) or "none — provider setup pending"))
        else:
            target = provision(args.app, args.budget_usd, args.url)
            print(f"App credentials saved privately to {target}. Set its BASE_URL to your public HTTPS inference URL before deployment.")
    except (ValueError, ApiError, KeyError, OSError) as error:
        # Never print upstream response objects or credential values.
        parser.exit(1, f"{error if isinstance(error, (ValueError, ApiError)) else 'Local configuration/file operation failed.'}\n")


if __name__ == "__main__":
    main()

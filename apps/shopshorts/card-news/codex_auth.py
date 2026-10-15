#!/usr/bin/env python3
"""Card-news Codex login lifecycle in GitHub Actions (same method as wp-auto-blog).

restore: write the CARD_NEWS_CODEX_AUTH_JSON secret into a private temporary CODEX_HOME.
persist: if Codex refreshed the login during the run, write it back to that secret,
         then delete the temporary directory.
Never prints, logs or uploads the credential.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

REPOSITORY = "hhj4861/commerce-automation-kit"
SECRET = "CARD_NEWS_CODEX_AUTH_JSON"


def require_trusted_actions():
    """Only scheduled or manual runs of this repository's default branch may use the login."""
    if os.getenv("GITHUB_ACTIONS", "").lower() != "true":
        return
    try:
        event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
        repo = event.get("repository") or {}
        trusted = (os.environ.get("GITHUB_REPOSITORY") == REPOSITORY
                   and repo.get("full_name", REPOSITORY) == REPOSITORY
                   and os.environ.get("GITHUB_EVENT_NAME") in {"workflow_dispatch", "schedule"}
                   and os.environ.get("GITHUB_REF") == "refs/heads/" + repo.get("default_branch", "main"))
    except (KeyError, OSError, ValueError, TypeError, AttributeError):
        trusted = False
    if not trusted:
        raise RuntimeError("The card-news Codex login is restored only by scheduled or manual runs on the default branch")


def validate_auth(raw):
    try:
        data = json.loads(raw)
    except ValueError:
        raise ValueError("Codex login is not valid JSON; run `codex login` again") from None
    tokens = data.get("tokens") if isinstance(data, dict) else None
    if (not isinstance(data, dict) or data.get("auth_mode") != "chatgpt"
            or not isinstance(tokens, dict) or not tokens.get("refresh_token")):
        raise ValueError("A dedicated ChatGPT login (codex login) is required; API keys are not accepted")
    return raw


def save_secret(raw, attempts=3, pauses=(5, 15)):
    """Write the login to the repository secret; retry transient GitHub failures."""
    for attempt in range(attempts):
        try:
            subprocess.run(["gh", "secret", "set", SECRET, "--repo", os.environ["GITHUB_REPOSITORY"]],
                           input=raw, text=True, check=True, stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, timeout=60)
            return True
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
            if attempt + 1 < attempts:
                time.sleep(pauses[min(attempt, len(pauses) - 1)])
    return False


def paths():
    home = Path(os.environ["RUNNER_TEMP"]) / "card-news-codex"
    return home, home / "auth.json", home / ".restored-auth.sha256"


def restore():
    require_trusted_actions()
    if not os.environ.get("SECRET_WRITE_TOKEN", "").strip():
        raise RuntimeError("CARD_NEWS_SECRET_WRITE_TOKEN is required to save a refreshed login")
    raw = validate_auth(os.environ.get("CODEX_AUTH_JSON", ""))
    # Prove the token can write the secret before Codex may rotate the login: rewriting the
    # identical value is harmless, while discovering a bad token after a refresh loses the login.
    if not save_secret(raw):
        raise RuntimeError("CARD_NEWS_SECRET_WRITE_TOKEN cannot write repository secrets; "
                           "check its expiry and the Secrets: Read and write permission")
    home, auth, baseline = paths()
    home.mkdir(mode=0o700, exist_ok=False)
    auth.touch(mode=0o600)
    auth.write_text(raw, encoding="utf-8")
    baseline.touch(mode=0o600)
    baseline.write_text(hashlib.sha256(raw.encode("utf-8")).hexdigest(), encoding="utf-8")
    if os.environ.get("GITHUB_ENV"):
        with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as handle:
            handle.write(f"CARD_NEWS_CODEX_HOME={home}\n")
    print("Card-news Codex login restored")


def persist():
    home, auth, baseline = paths()
    try:
        if not auth.exists():
            print("No restored Codex login; nothing to save")
            return
        raw = validate_auth(auth.read_text(encoding="utf-8"))
        if not baseline.is_file():
            raise RuntimeError("Missing restored login baseline; refusing to overwrite the secret")
        if hashlib.sha256(raw.encode("utf-8")).hexdigest() == baseline.read_text(encoding="utf-8"):
            print("Codex login unchanged; secret update skipped")
            return
        require_trusted_actions()
        if not save_secret(raw):
            raise RuntimeError("Refreshed Codex login could not be saved; the next run may need a new login")
        print("Refreshed Codex login saved to the secret")
    finally:
        if home.exists():
            shutil.rmtree(home)


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["restore"]:
            restore()
        elif sys.argv[1:] == ["persist"]:
            persist()
        else:
            raise ValueError("Usage: codex_auth.py restore|persist")
    except Exception as exc:
        # Messages above never contain credential material; anything else is reduced to its type.
        print("::error::" + (str(exc) if isinstance(exc, (ValueError, RuntimeError)) else type(exc).__name__))
        sys.exit(1)

#!/usr/bin/env python3
"""Pinned upstream deployment wrapper; Python standard library only."""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / ".upstream" / "dify"
DOCKER = SOURCE / "docker"
LOCK = json.loads((ROOT / "upstream.json").read_text())


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def environment(template):
    values = {}
    for line in template.splitlines():
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key] = value
    for key in ("SECRET_KEY", "DB_PASSWORD", "REDIS_PASSWORD", "PLUGIN_DAEMON_KEY",
                "PLUGIN_DIFY_INNER_API_KEY", "DIFY_AGENT_SERVER_SECRET_KEY",
                "DIFY_AGENT_API_TOKEN", "DIFY_AGENT_LOCAL_SANDBOX_AUTH_TOKEN"):
        values[key] = secrets.token_urlsafe(32)
    values["INIT_PASSWORD"] = secrets.token_hex(12)
    values["CODE_EXECUTION_API_KEY"] = values["SANDBOX_API_KEY"] = secrets.token_urlsafe(32)
    values["WEAVIATE_API_KEY"] = values["WEAVIATE_AUTHENTICATION_APIKEY_ALLOWED_KEYS"] = secrets.token_urlsafe(32)
    values.update({
        "CONSOLE_WEB_URL": "http://localhost:4180",
        "CONSOLE_API_URL": "http://localhost:4180",
        "SERVICE_API_URL": "http://localhost:4180",
        "APP_WEB_URL": "http://localhost:4180",
        "APP_API_URL": "http://localhost:4180",
        "FILES_URL": "http://localhost:4180",
        "INTERNAL_FILES_URL": "http://api:5001",
        "CONSOLE_CORS_ALLOW_ORIGINS": "http://localhost:4180",
        "WEB_API_CORS_ALLOW_ORIGINS": "http://localhost:4180",
        "TRIGGER_URL": "http://localhost:4180",
        "ENDPOINT_URL_TEMPLATE": "http://localhost:4180/e/{hook_id}",
        "NEXT_PUBLIC_SOCKET_URL": "ws://localhost:4180",
        "NEXT_TELEMETRY_DISABLED": "1",
        "WEAVIATE_DISABLE_TELEMETRY": "true",
        "WEAVIATE_AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED": "false",
        "ENABLE_WEBSITE_JINAREADER": "false",
        "ENABLE_WEBSITE_FIRECRAWL": "false",
        "ENABLE_WEBSITE_WATERCRAWL": "false",
        "FORCE_VERIFYING_SIGNATURE": "true",
        "CELERY_WORKER_AMOUNT": "1",
    })
    return "\n".join(f"{key}={value}" for key, value in values.items()) + "\n"


def private_write(path, content):
    # Exclusive creation: never rotate keys under an existing database.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as file:
        file.write(content)


def verify_source():
    head = subprocess.check_output(["git", "-C", str(SOURCE), "rev-parse", "HEAD"], text=True).strip()
    if head != LOCK["commit"]:
        raise RuntimeError("Upstream commit differs from upstream.json; refusing to deploy")
    changes = subprocess.check_output(["git", "-C", str(SOURCE), "status", "--porcelain", "--untracked-files=no"], text=True)
    if changes:
        raise RuntimeError("Tracked upstream source was edited; review it before deployment")


def prepare():
    if not SOURCE.exists():
        SOURCE.parent.mkdir(parents=True, exist_ok=True)
        run("git", "clone", "--depth", "1", "--branch", LOCK["release"], LOCK["repository"], str(SOURCE))
    verify_source()
    env = DOCKER / ".env"
    if env.exists():
        print("Existing environment preserved (no secrets rotated).")
    else:
        private_write(env, environment((DOCKER / ".env.example").read_text()))
        print("Private environment created at services/dify/.upstream/dify/docker/.env")
    print("Dify source ready; containers and apps are not started by prepare.")


def compose(args):
    verify_source()
    if not (DOCKER / ".env").exists():
        raise RuntimeError("Run dify.py prepare first")
    run("docker", "compose", "--project-name", "cak-dify", "--project-directory", str(DOCKER),
        "--env-file", str(DOCKER / ".env"), "-f", str(DOCKER / "docker-compose.yaml"),
        "-f", str(ROOT / "compose.override.yaml"), *args)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["prepare", "compose"])
    parser.add_argument("args", nargs=argparse.REMAINDER)
    options = parser.parse_args()
    try:
        prepare() if options.command == "prepare" else compose(options.args)
    except (RuntimeError, subprocess.CalledProcessError, FileNotFoundError) as error:
        parser.exit(1, f"{error}\n")

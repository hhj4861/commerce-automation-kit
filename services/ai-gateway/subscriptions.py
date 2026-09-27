"""Private, per-account ChatGPT subscription connections for the shared gateway.

OAuth is performed by LiteLLM itself. This helper never imports existing browser,
Codex, Claude, or another application's credentials.
"""
import argparse
from contextlib import contextmanager
import fcntl
import json
import os
from pathlib import Path
import re
import secrets
import subprocess

from gateway import ROOT, private_write, read_env, provision_scope, render

POLICY_URL = "https://code.claude.com/docs/en/legal-and-compliance"


def account_id(value):
    if not re.fullmatch(r"[a-z][a-z0-9]{0,23}", value):
        raise ValueError("Account ID must be 1-24 lowercase letters/digits, starting with a letter.")
    return value


def model_id(value):
    if not re.fullmatch(r"(?:gpt|codex)-[a-zA-Z0-9.-]{1,80}", value):
        raise ValueError("Specify a ChatGPT model ID, without a provider prefix.")
    return value


def folder(root, account):
    return root / ".runtime/subscriptions" / account_id(account)


@contextmanager
def locked(root):
    path = root / ".runtime/subscriptions"
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (path / ".lock").open("a") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        yield


def accounts(root=ROOT):
    result = []
    for path in sorted((root / ".runtime/subscriptions").glob("*/account.json")):
        record = json.loads(path.read_text())
        if record.get("provider") != "chatgpt" or account_id(record["id"]) != path.parent.name:
            raise ValueError("Invalid subscription account configuration.")
        model_id(record["model"])
        result.append(record)
    return result


def get_account(account, root=ROOT):
    account_id(account)
    for record in accounts(root):
        if record["id"] == account:
            return record
    raise ValueError("Account is not configured; run create first.")


def routes(root=ROOT):
    return [{"model_name": "codex-" + a["id"], "litellm_params": {
        "model": "openai/codex-" + a["id"],
        "api_base": "http://codex-" + a["id"] + ":4000/v1",
        "api_key": "os.environ/CODEX_ACCOUNT_" + a["id"].upper() + "_KEY",
    }} for a in accounts(root)]


def write_configs(root=ROOT):
    image = re.search(r"image: (ghcr\.io/berriai/litellm@sha256:[a-f0-9]{64})", (root / "compose.yaml").read_text())
    if not image:
        raise ValueError("The gateway must use a pinned LiteLLM image.")
    services, env_lines = {}, []
    for record in accounts(root):
        name = record["id"]
        directory = folder(root, name)
        values = read_env(directory / "worker.env")
        key = values.get("LITELLM_MASTER_KEY", "")
        if not re.fullmatch(r"sk-[a-f0-9]{64}", key):
            raise ValueError("Invalid private worker credential.")
        env_lines.append(f"CODEX_ACCOUNT_{name.upper()}_KEY={key}\n")
        private_write(directory / "config.json", json.dumps({
            "model_list": [{"model_name": "codex-" + name, "model_info": {"mode": "responses"},
                            "litellm_params": {"model": "chatgpt/" + record["model"]}}],
            "general_settings": {"master_key": "os.environ/LITELLM_MASTER_KEY", "store_prompts_in_spend_logs": False},
            "litellm_settings": {"set_verbose": False, "turn_off_message_logging": True, "num_retries": 0, "request_timeout": 90},
        }, indent=2) + "\n")
        services["codex-" + name] = {
            "image": image.group(1), "entrypoint": ["python", "/app/subscription-runtime.py"],
            "command": ["serve", "--config", "/app/account-config.json", "--host", "0.0.0.0", "--port", "4000", "--num_workers", "1"],
            "env_file": [str(directory / "worker.env")],
            "environment": {"CHATGPT_TOKEN_DIR": "/account-auth", "CHATGPT_AUTH_FILE": "auth.json", "SUBSCRIPTION_MODEL": record["model"], "LITELLM_TELEMETRY": "False"},
            "volumes": [str(directory / "auth") + ":/account-auth", str(directory / "config.json") + ":/app/account-config.json:ro", str(root / "subscription_runtime.py") + ":/app/subscription-runtime.py:ro"],
            "restart": "unless-stopped",
            "healthcheck": {"test": ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:4000/health/liveliness', timeout=5)"], "interval": "15s", "timeout": "10s", "retries": 20},
        }
    private_write(root / ".runtime/subscriptions.env", "".join(env_lines))
    services["gateway"] = {"env_file": [str(root / ".env"), str(root / ".runtime/subscriptions.env")]}
    private_write(root / ".runtime/subscriptions.compose.json", json.dumps({"services": services}, indent=2) + "\n")
    render(root)


def create(account, model, provider="chatgpt", root=ROOT):
    if provider not in ("chatgpt", "codex"):
        raise ValueError("Claude subscription-token relay is unsupported. Use a Claude API key/cloud provider. " + POLICY_URL)
    account_id(account)
    model_id(model)
    # Validate the existing gateway before creating durable account state.
    render(root)
    with locked(root):
        directory = folder(root, account)
        if directory.exists():
            raise ValueError("Account already exists; credentials were not replaced.")
        (directory / "auth").mkdir(parents=True, mode=0o700)
        directory.chmod(0o700)
        private_write(directory / "worker.env", "LITELLM_MASTER_KEY=sk-" + secrets.token_hex(32) + "\n")
        private_write(directory / "account.json", json.dumps({"id": account, "provider": "chatgpt", "model": model}) + "\n")
        write_configs(root)


def compose(root=ROOT):
    return ["docker", "compose", "-f", str(root / "compose.yaml"), "-f", str(root / ".runtime/subscriptions.compose.json")]


def set_model(account, model, root=ROOT):
    model_id(model)
    with locked(root):
        record = get_account(account, root)
        record["model"] = model
        private_write(folder(root, account) / "account.json", json.dumps(record) + "\n")
        write_configs(root)


def runtime_command(action, account, root=ROOT, python=None):
    record = get_account(account, root)
    if python:
        directory = folder(root, account)
        # Do not inherit provider keys, API base overrides, or shared token paths.
        env = {k: v for k, v in os.environ.items() if k in ("PATH", "LANG", "SSL_CERT_FILE", "TMPDIR", "SYSTEMROOT")}
        env.update(read_env(directory / "worker.env"))
        env.update(CHATGPT_TOKEN_DIR=str(directory / "auth"), CHATGPT_AUTH_FILE="auth.json", SUBSCRIPTION_MODEL=record["model"], LITELLM_TELEMETRY="False", PYTHONNOUSERSITE="1")
        return [python, str(root / "subscription_runtime.py"), action], env
    return compose(root) + ["run", "--rm", "--no-deps", "-T", "codex-" + account, action], None


def run_action(action, account, root=ROOT, python=None, runner=subprocess.run):
    get_account(account, root)
    # A cached/refreshing worker must stop before a separate login/logout process.
    # Local mode is for isolated verification only; no local worker is started here.
    if not python and action in ("login", "logout", "probe"):
        runner(compose(root) + ["stop", "codex-" + account], check=True, cwd=root)
    command, env = runtime_command(action, account, root, python)
    runner(command, env=env, check=True, cwd=root)
    if not python and action in ("login", "probe"):
        runner(compose(root) + ["up", "-d", "--wait", "--wait-timeout", "180", "codex-" + account], check=True, cwd=root)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    p = sub.add_parser("create")
    p.add_argument("--account", required=True)
    p.add_argument("--model", required=True, help="Account-supported ChatGPT model ID, e.g. gpt-6-sol")
    p.add_argument("--provider", choices=("chatgpt", "codex", "claude"), default="chatgpt")
    p = sub.add_parser("set-model")
    p.add_argument("--account", required=True)
    p.add_argument("--model", required=True)
    for action in ("login", "status", "probe", "logout"):
        p = sub.add_parser(action)
        p.add_argument("--account", required=True)
        p.add_argument("--python", help="Isolated local verification using a Python with litellm installed")
    p = sub.add_parser("provision")
    p.add_argument("--account", required=True)
    p.add_argument("--budget-usd", type=float, required=True)
    p.add_argument("--url", default="http://127.0.0.1:4100")
    sub.add_parser("render")
    args = parser.parse_args()
    try:
        if args.action == "create":
            create(args.account, args.model, args.provider)
            print("Account configured; OAuth login and model probe are still required.")
        elif args.action == "render":
            with locked(ROOT):
                write_configs()
            print("Private Compose overlay and account routes rendered.")
        elif args.action == "set-model":
            set_model(args.account, args.model)
            print("Model configuration updated; run probe to verify access and restart the account worker.")
        elif args.action == "provision":
            get_account(args.account)
            target = provision_scope("codex-" + args.account, ["codex-" + args.account], args.budget_usd, args.url)
            print("Scoped gateway key saved privately to " + str(target))
        else:
            run_action(args.action, args.account, python=args.python)
    except ValueError as error:
        parser.exit(1, str(error) + "\n")
    except (OSError, KeyError, json.JSONDecodeError, subprocess.CalledProcessError):
        parser.exit(1, "Subscription operation failed; connection is not confirmed. Check configuration/runtime availability.\n")


if __name__ == "__main__":
    main()

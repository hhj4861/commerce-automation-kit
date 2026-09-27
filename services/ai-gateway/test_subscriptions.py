import contextlib
import fcntl
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest
from unittest.mock import Mock, patch

import gateway
import subscription_runtime as runtime
import subscriptions as subscriptions


class SubscriptionTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in (".env.example", "compose.yaml"):
            shutil.copyfile(Path(__file__).with_name(name), self.root / name)
        gateway.init(self.root)

    def create(self, account):
        subscriptions.create(account, "gpt-5.4", root=self.root)
        return subscriptions.folder(self.root, account)

    def test_accounts_have_disjoint_tokens_keys_models_and_no_public_ports(self):
        alice, bob = self.create("alice"), self.create("bob")
        self.assertNotEqual((alice / "worker.env").read_text(), (bob / "worker.env").read_text())
        overlay = json.loads((self.root / ".runtime/subscriptions.compose.json").read_text())
        for name, own, other in (("alice", alice, bob), ("bob", bob, alice)):
            service = overlay["services"]["codex-" + name]
            self.assertNotIn("ports", service)
            self.assertNotIn(str(other), json.dumps(service))
            self.assertIn(str(own / "auth") + ":/account-auth", service["volumes"])
            self.assertEqual((own / "worker.env").stat().st_mode & 0o777, 0o600)
        routes = json.loads((self.root / ".runtime/litellm.json").read_text())["model_list"]
        self.assertEqual({r["model_name"] for r in routes}, {"codex-alice", "codex-bob"})
        self.assertNotEqual(routes[0]["litellm_params"]["api_key"], routes[1]["litellm_params"]["api_key"])
        self.assertNotIn("chatgpt/", json.dumps(routes))
        self.assertNotIn("codex-alice", sum(gateway.APPS.values(), []))

    def test_secret_retention_and_repeat_create(self):
        alice = self.create("alice")
        original = (alice / "worker.env").read_bytes()
        with self.assertRaises(ValueError):
            self.create("alice")
        subscriptions.write_configs(self.root)
        self.assertEqual(original, (alice / "worker.env").read_bytes())
        self.assertNotIn(original.decode().split("=", 1)[1].strip(), (self.root / ".runtime/litellm.json").read_text())

    def test_model_change_preserves_credentials(self):
        alice = self.create("alice")
        key = (alice / "worker.env").read_bytes()
        (alice / "auth/auth.json").write_text('{"access_token":"test-private-token"}')
        auth = (alice / "auth/auth.json").read_bytes()
        subscriptions.set_model("alice", "gpt-6-sol", self.root)
        self.assertEqual(subscriptions.get_account("alice", self.root)["model"], "gpt-6-sol")
        self.assertEqual(key, (alice / "worker.env").read_bytes())
        self.assertEqual(auth, (alice / "auth/auth.json").read_bytes())

    def test_untrusted_account_model_and_claude_rejected_before_writing(self):
        for name in ("../alice", "Alice", "alice-bob", "", "alice/bob", "x" * 25):
            with self.assertRaises(ValueError):
                self.create(name)
        for model in ("anthropic/claude", "gpt-5.4\nKEY=evil", "../model", "chatgpt/gpt-5.4"):
            with self.assertRaises(ValueError):
                subscriptions.create("alice", model, root=self.root)
        with self.assertRaisesRegex(ValueError, "Claude"):
            subscriptions.create("alice", "gpt-5.4", "claude", self.root)
        self.assertEqual(subscriptions.accounts(self.root), [])

    def test_shared_process_cannot_use_subscription_tokens(self):
        with (self.root / ".env").open("a") as output:
            output.write("HANMADI_CHAT_MODEL=chatgpt/gpt-5.4\nHANMADI_CHAT_API_KEY=should-not-help\n")
        with self.assertRaisesRegex(ValueError, "isolated"):
            gateway.render(self.root)

    def test_local_environment_does_not_inherit_credentials_or_overrides(self):
        alice = self.create("alice")
        with patch.dict(os.environ, {"OPENAI_API_KEY": "secret", "CHATGPT_TOKEN_DIR": "/other", "CHATGPT_API_BASE": "https://evil.example", "PYTHONPATH": "/other"}):
            command, env = subscriptions.runtime_command("login", "alice", self.root, "/venv/python")
        self.assertEqual(command[-1], "login")
        self.assertEqual(env["CHATGPT_TOKEN_DIR"], str(alice / "auth"))
        for name in ("OPENAI_API_KEY", "CHATGPT_API_BASE", "PYTHONPATH"):
            self.assertNotIn(name, env)

    def test_stop_failure_never_deletes_tokens_or_reports_logout(self):
        self.create("alice")
        run = Mock(side_effect=subprocess.CalledProcessError(1, "docker"))
        with self.assertRaises(subprocess.CalledProcessError):
            subscriptions.run_action("logout", "alice", self.root, runner=run)
        self.assertEqual(run.call_count, 1)
        self.assertIn("stop", run.call_args.args[0])

    def test_failed_login_never_starts_worker(self):
        self.create("alice")
        run = Mock(side_effect=[None, subprocess.CalledProcessError(1, "login")])
        with self.assertRaises(subprocess.CalledProcessError):
            subscriptions.run_action("login", "alice", self.root, runner=run)
        self.assertEqual(run.call_count, 2)

    def test_cached_credentials_are_never_reported_as_live_verified(self):
        alice = self.create("alice")
        with patch.dict(os.environ, {"CHATGPT_TOKEN_DIR": str(alice / "auth")}):
            self.assertEqual(runtime.cached_status()["state"], "not_connected")
            path = alice / "auth/auth.json"
            path.write_text(json.dumps({"access_token": "private-access", "refresh_token": "private-refresh", "expires_at": time.time() + 600}))
            self.assertEqual(runtime.cached_status(), {"state": "cached", "verified": False})
            path.write_text(json.dumps({"access_token": "private-access", "expires_at": 0}))
            self.assertEqual(runtime.cached_status()["state"], "refresh_needed")
            output = io.StringIO()
            with patch("sys.argv", ["runtime", "logout"]), contextlib.redirect_stdout(output):
                runtime.main()
            self.assertFalse(path.exists())
            self.assertNotIn("private-", output.getvalue())
            self.assertFalse(json.loads(output.getvalue())["provider_grant_revoked"])

    def test_account_virtual_key_only_gets_own_model(self):
        self.create("alice")
        calls = []
        def request(path, payload=None):
            calls.append((path, payload))
            if path == "/v1/models":
                return {"data": [{"id": "codex-alice"}, {"id": "codex-bob"}, {"id": "hanmadi-chat"}]}
            if path.startswith("/team/info"):
                raise gateway.ApiError(404)
            if path == "/key/generate":
                return {"key": "sk-client-fixture"}
            return {}
        target = gateway.provision_scope("codex-alice", ["codex-alice"], 1, "http://localhost:4100", self.root, Mock(call=request))
        for _, payload in calls:
            if payload:
                self.assertEqual(payload["models"], ["codex-alice"])
                self.assertEqual(payload["team_id"], "cak-codex-alice")
        self.assertEqual(gateway.read_env(target)["LITELLM_MODEL"], "codex-alice")

    def test_active_worker_lock_prevents_local_logout_and_secret_logging(self):
        alice = self.create("alice")
        path = alice / "auth/auth.json"
        path.write_text('{"access_token":"private-test-token"}')
        with (alice / "auth/.session.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            output = io.StringIO()
            with patch.dict(os.environ, {"CHATGPT_TOKEN_DIR": str(alice / "auth")}), patch("sys.argv", ["runtime", "logout"]), contextlib.redirect_stdout(output), self.assertRaises(SystemExit):
                runtime.main()
            self.assertTrue(path.exists())
            self.assertNotIn("private-test-token", output.getvalue())
            self.assertEqual(json.loads(output.getvalue())["state"], "error")

    def test_subscription_stream_requires_terminal_success(self):
        completed = {"output": [{"type": "reasoning", "content": None}, {"type": "message", "content": [{"type": "output_text", "text": "OK"}]}]}
        stream = iter([{"type": "response.output_text.delta", "delta": "O"}, {"type": "response.completed", "response": completed}])
        self.assertEqual(runtime.response_text(stream), "OK")
        self.assertEqual(runtime.response_text(completed), "OK")
        self.assertEqual(runtime.response_text(iter([
            {"type": "response.output_text.done", "text": "OK"},
            {"type": "response.completed", "response": {"status": "completed", "output": []}},
        ])), "OK")
        with self.assertRaises(RuntimeError):
            runtime.response_text(iter([{"type": "response.output_text.done", "text": "partial"}]))
        for ending in ([], [{"type": "response.failed"}], [{"type": "response.incomplete"}], [{"type": "error"}]):
            with self.assertRaises(RuntimeError):
                runtime.response_text(iter([{"type": "response.output_text.delta", "delta": "partial"}, *ending]))


if __name__ == "__main__":
    unittest.main()

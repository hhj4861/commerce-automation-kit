import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import Mock

from gateway import APPS, ApiError, Client, init, read_env, render, provision


class GatewayTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copyfile(Path(__file__).with_name(".env.example"), self.root / ".env.example")
        init(self.root)

    def settings(self, **values):
        with (self.root / ".env").open("a") as output:
            output.write("".join(f"{k}={v}\n" for k, v in values.items()))

    def test_init_never_rotates_salt(self):
        original = (self.root / ".env").read_bytes()
        with self.assertRaises(ValueError):
            init(self.root)
        self.assertEqual(original, (self.root / ".env").read_bytes())
        self.assertEqual((self.root / ".env").stat().st_mode & 0o777, 0o600)

    def test_missing_provider_does_not_create_fake_model(self):
        self.assertEqual(render(self.root), [])
        self.settings(HANMADI_CHAT_MODEL="openai/example")
        with self.assertRaises(ValueError):
            render(self.root)

    def test_model_credentials_stay_out_of_rendered_config(self):
        self.settings(HANMADI_CHAT_MODEL="openai/example", HANMADI_CHAT_API_KEY="private-provider-value",
                      REPLAY_CHAT_MODEL="ollama_chat/example", REPLAY_CHAT_API_BASE="http://ollama:11434",
                      ELEVENLABS_API_KEY="private-eleven-value")
        self.assertEqual(set(render(self.root)), set(sum(APPS.values(), [])))
        content = (self.root / ".runtime/litellm.json").read_text()
        self.assertNotIn("private-provider-value", content)
        self.assertNotIn("private-eleven-value", content)
        self.assertFalse(json.loads(content)["general_settings"]["store_prompts_in_spend_logs"])

    def test_management_rejects_remote_http_and_credentials(self):
        for url in ("http://example.com", "https://user:pw@example.com", "https://example.com?secret=x", "https://example.com/path"):
            with self.assertRaises(ValueError):
                Client(url, "test")

    def test_no_empty_model_allowlist_or_implicit_budget(self):
        api = Mock()
        api.call.return_value = {"data": []}
        for budget in (0, -1, float("inf"), float("nan")):
            with self.assertRaises(ValueError):
                provision("hanmadi", budget, "http://localhost:4100", self.root, api)
        with self.assertRaises(ValueError):
            provision("hanmadi", 5, "http://localhost:4100", self.root, api)
        self.assertEqual(api.call.call_count, 1)

    def test_separate_team_allowlist_and_private_app_key(self):
        calls = []
        def call(path, body=None):
            calls.append((path, body))
            if path == "/v1/models":
                return {"data": [{"id": m} for m in sum(APPS.values(), [])]}
            if path.startswith("/team/info"):
                raise ApiError(404)
            if path == "/key/generate":
                return {"key": "sk-test-app"}
            return {}
        api = Mock(call=call)
        target = provision("hanmadi", 5, "http://localhost:4100", self.root, api)
        for _, payload in calls:
            if payload:
                self.assertEqual(payload["models"], APPS["hanmadi"])
                self.assertEqual(payload["team_id"], "cak-hanmadi")
                self.assertEqual(payload["max_budget"], 5)
        self.assertEqual(read_env(target)["LITELLM_API_KEY"], "sk-test-app")
        self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def test_ambiguous_key_creation_cannot_silently_issue_another(self):
        api = Mock()
        api.call.side_effect = [{"data": [{"id": "hanmadi-chat"}]}, ApiError(404), {}, ApiError(500)]
        with self.assertRaises(ApiError):
            provision("hanmadi", 5, "http://localhost:4100", self.root, api)
        self.assertTrue((self.root / ".runtime/hanmadi.key-pending").exists())
        api.call.side_effect = [{"data": [{"id": "hanmadi-chat"}]}, {"team_info": {"models": ["hanmadi-chat"], "max_budget": 5, "budget_duration": "30d", "rpm_limit": 30}}]
        with self.assertRaisesRegex(ValueError, "interrupted"):
            provision("hanmadi", 5, "http://localhost:4100", self.root, api)


if __name__ == "__main__":
    unittest.main()

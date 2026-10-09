"""Cloud Run LiteLLM config and image checks (no network, no Docker)."""
import json
import re
import sys
import unittest
from pathlib import Path
from unittest import mock

import gateway

ROOT = Path(__file__).resolve().parent
CLOUDRUN = ROOT / "cloudrun"
SETTINGS = json.loads((CLOUDRUN / "settings.json").read_text())


def leaves(value, path=""):
    if isinstance(value, dict):
        for key, item in value.items():
            yield from leaves(item, f"{path}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from leaves(item, f"{path}[{index}]")
    elif isinstance(value, str):
        yield path, value


class CloudRunConfigTest(unittest.TestCase):
    def test_credentials_are_env_references_only(self):
        for target in SETTINGS["targets"]:
            for path, value in leaves(gateway.render_cloudrun(SETTINGS, target)):
                if path.endswith((".api_key", ".api_base", ".master_key")):
                    self.assertTrue(value.startswith("os.environ/"), (target, path))
                self.assertNotRegex(value, r"sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,}", (target, path))

    def test_production_matches_the_vm_model_routes(self):
        config = gateway.render_cloudrun(SETTINGS, "production")
        self.assertEqual([(m["model_name"], m["litellm_params"]["model"]) for m in config["model_list"]], [
            ("hanmadi-chat", "gemini/gemini-flash-lite-latest"),
            ("replay-video-planner", "gemini/gemini-flash-lite-latest"),
            ("festa-travel", "gemini/gemini-3.5-flash-lite"),
            ("hanmadi-stt", "elevenlabs/scribe_v1"),
            ("hanmadi-tts", "elevenlabs/eleven_v3"),
        ])
        self.assertEqual(config["general_settings"], {"master_key": "os.environ/LITELLM_MASTER_KEY", "store_prompts_in_spend_logs": False})
        self.assertEqual(config["litellm_settings"], {"set_verbose": False, "turn_off_message_logging": True, "num_retries": 0, "request_timeout": 30})

    def test_staging_serves_only_the_poc_models(self):
        config = gateway.render_cloudrun(SETTINGS, "staging")
        self.assertEqual([m["model_name"] for m in config["model_list"]], ["hanmadi-chat", "hanmadi-stt", "hanmadi-tts"])

    def test_subscription_routes_are_never_added(self):
        fake = mock.Mock(routes=lambda root: [{"model_name": "codex-x", "litellm_params": {"model": "x"}}])
        with mock.patch.dict(sys.modules, {"subscriptions": fake}):
            config = gateway.render_cloudrun(SETTINGS, "production")
        self.assertNotIn("codex-x", [m["model_name"] for m in config["model_list"]])

    def test_committed_configs_are_current(self):
        for target in SETTINGS["targets"]:
            self.assertEqual((CLOUDRUN / f"{target}.json").read_text(), gateway.cloudrun_text(SETTINGS, target), target)

    def test_unknown_target_is_rejected(self):
        with self.assertRaises(ValueError):
            gateway.render_cloudrun(SETTINGS, "dev")


class CloudRunImageTest(unittest.TestCase):
    DOCKERFILE = (CLOUDRUN / "Dockerfile").read_text()

    def test_image_uses_the_vm_litellm_digest(self):
        digest = re.search(r"ghcr\.io/berriai/litellm@sha256:[0-9a-f]{64}", (ROOT / "compose.yaml").read_text()).group(0)
        self.assertIn(f"FROM {digest}", self.DOCKERFILE)

    def test_config_stays_outside_the_app_directory_and_listens_on_8080(self):
        self.assertIn("COPY ${TARGET}.json /etc/litellm/config.json", self.DOCKERFILE)
        self.assertNotRegex(self.DOCKERFILE, r"(?m)^COPY .* /app")
        self.assertIn('CMD ["--config", "/etc/litellm/config.json", "--host", "0.0.0.0", "--port", "8080"]', self.DOCKERFILE)


if __name__ == "__main__":
    unittest.main()

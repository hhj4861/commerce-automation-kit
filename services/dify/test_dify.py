import json
from pathlib import Path
import tempfile
import unittest
import yaml
from dify import environment, private_write, ROOT, LOCK


class ConfigurationTests(unittest.TestCase):
    def test_secrets_match_consumers_and_are_not_reused(self):
        def parse(text):
            return dict(line.split("=", 1) for line in text.splitlines())
        first, second = [parse(environment("DB_PASSWORD=difyai123456\nREDIS_PASSWORD=difyai123456\n")) for _ in range(2)]
        for key in ("SECRET_KEY", "DB_PASSWORD", "REDIS_PASSWORD", "PLUGIN_DAEMON_KEY", "INIT_PASSWORD", "SANDBOX_API_KEY"):
            self.assertNotEqual(first[key], second[key])
        self.assertEqual(first["SANDBOX_API_KEY"], first["CODE_EXECUTION_API_KEY"])
        self.assertEqual(first["WEAVIATE_API_KEY"], first["WEAVIATE_AUTHENTICATION_APIKEY_ALLOWED_KEYS"])
        self.assertEqual(first["FORCE_VERIFYING_SIGNATURE"], "true")
        self.assertLessEqual(len(first["INIT_PASSWORD"]), 30)

    def test_private_write_refuses_secret_rotation(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "env"
            private_write(file, "original")
            self.assertEqual(file.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                private_write(file, "replacement")
            self.assertEqual(file.read_text(), "original")

    def test_templates_have_resolvable_graphs_and_separate_models(self):
        for name, model, mode in (("hanmadi-tutor", "hanmadi-chat", "advanced-chat"),
                                  ("replay-planner", "replay-video-planner", "workflow")):
            app = yaml.safe_load((ROOT / "apps" / f"{name}.yml").read_text())
            self.assertEqual(app["app"]["mode"], mode)
            self.assertEqual(app["dependencies"][0]["value"]["marketplace_plugin_unique_identifier"], LOCK["plugin"])
            graph = app["workflow"]["graph"]
            ids = {node["id"] for node in graph["nodes"]}
            for edge in graph["edges"]:
                self.assertIn(edge["source"], ids)
                self.assertIn(edge["target"], ids)
            llms = [node["data"] for node in graph["nodes"] if node["data"]["type"] == "llm"]
            self.assertEqual(len(llms), 1)
            self.assertEqual(llms[0]["model"]["name"], model)
            self.assertEqual(llms[0]["model"]["provider"], LOCK["provider"])
            self.assertEqual(app["workflow"]["environment_variables"], [])
            self.assertNotIn("sk-", json.dumps(app))


if __name__ == "__main__":
    unittest.main()

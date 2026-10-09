"""Static checks for baked edge routing files; the live routing test is edge.py (CI, Docker)."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VM = (ROOT / "Caddyfile").read_text()
STAGING = (ROOT / "edge" / "Caddyfile.staging").read_text()


def matcher_paths(text, name):
    return re.search(rf"@{name} path ([^\n]+)", text).group(1).split()


class EdgeConfigTest(unittest.TestCase):
    def test_staging_llm_allowlist_equals_the_vm_allowlist(self):
        self.assertEqual(matcher_paths(STAGING, "llm"), matcher_paths(VM, "llm"))
        for path in ("path /llm/v1beta/models/hanmadi-chat:generateContent", "path /llm/typesafe/v1/systemone"):
            self.assertIn(path, STAGING)
            self.assertIn(path, VM)

    def test_every_upstream_is_the_service_url_with_its_own_host(self):
        upstreams = re.findall(r"reverse_proxy (\S+)", STAGING)
        self.assertEqual(set(upstreams), {"{$LLM_UPSTREAM}"})
        self.assertEqual(STAGING.count("header_up Host {upstream_hostport}"), len(upstreams))

    def test_listens_on_the_cloud_run_port(self):
        self.assertIn(":{$PORT:8080} {", STAGING)

    def test_staging_exposes_no_other_service(self):
        for absent in ("/discovery", "/accounts", "/v1/chat-messages", "/v1/workflows/run"):
            self.assertNotIn(absent, STAGING)

    def test_image_uses_the_reviewed_caddy_digest(self):
        digest = re.search(r"caddy@sha256:[0-9a-f]{64}", (ROOT / "main.tf").read_text()).group(0)
        dockerfile = (ROOT / "edge" / "Dockerfile").read_text()
        self.assertIn(f"FROM docker.io/library/{digest}", dockerfile)
        self.assertIn("COPY Caddyfile.${VARIANT} /etc/caddy/Caddyfile", dockerfile)


if __name__ == "__main__":
    unittest.main()

"""Static policy checks for the Phase 2 staging PoC resources (no credentials needed)."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TF = (ROOT / "staging.tf").read_text()
MAIN = (ROOT / "main.tf").read_text()


def block(text, header):
    start = text.index(header)
    depth = 0
    for end in range(text.index("{", start), len(text)):
        depth += {"{": 1, "}": -1}.get(text[end], 0)
        if depth == 0:
            return text[start:end + 1]
    raise AssertionError(f"unbalanced block: {header}")


def env_pairs(text):
    return dict(re.findall(r'name\s*=\s*"([A-Z_]+)"\s*\n\s*value\s*=\s*"([^"]*)"', text))


class LiteLLMStagingTest(unittest.TestCase):
    SERVICE = block(TF, 'resource "google_cloud_run_v2_service" "litellm_stg"')

    def test_reachable_only_through_the_vpc(self):
        self.assertRegex(self.SERVICE, r'ingress\s*=\s*"INGRESS_TRAFFIC_INTERNAL_ONLY"')
        self.assertRegex(self.SERVICE, r'invoker_iam_disabled\s*=\s*true')

    def test_one_request_billed_instance_that_scales_to_zero(self):
        for pattern in (r'min_instance_count\s*=\s*0', r'max_instance_count\s*=\s*1', r'max_instance_request_concurrency\s*=\s*20',
                        r'cpu_idle\s*=\s*true', r'startup_cpu_boost\s*=\s*true', r'timeout\s*=\s*"300s"'):
            self.assertRegex(self.SERVICE, pattern)

    def test_env_only_settings_are_set_on_the_service(self):
        self.assertEqual(env_pairs(self.SERVICE), {"STORE_MODEL_IN_DB": "False", "LITELLM_TELEMETRY": "False",
                                                   "DISABLE_SCHEMA_UPDATE": "true", "GRACEFUL_SHUTDOWN_TIMEOUT": "3"})

    def test_secrets_resolve_at_pinned_versions(self):
        self.assertRegex(self.SERVICE, r'version\s*=\s*var\.secret_versions\[env\.value\]')
        self.assertNotRegex(TF, r'(?i)"latest"')

    def test_startup_probe_and_pipeline_owned_image(self):
        self.assertRegex(self.SERVICE, r'path\s*=\s*"/health/liveliness"')
        self.assertIn("template[0].containers[0].image", self.SERVICE)


class MigrateJobTest(unittest.TestCase):
    JOB = block(TF, 'resource "google_cloud_run_v2_job" "litellm_stg_migrate"')

    def test_runs_migrations_then_exits_without_retry(self):
        self.assertIn('"--skip_server_startup"', self.JOB)
        self.assertNotIn("DISABLE_SCHEMA_UPDATE", self.JOB)
        self.assertRegex(self.JOB, r'max_retries\s*=\s*0')


class ProbeTest(unittest.TestCase):
    PROBE = block(TF, 'resource "google_cloud_run_v2_service" "probe_stg"')

    def test_reuses_the_edge_image_as_an_internal_responder(self):
        self.assertIn("var.staging_images.edge", self.PROBE)
        self.assertIn('"respond"', self.PROBE)
        self.assertRegex(self.PROBE, r'ingress\s*=\s*"INGRESS_TRAFFIC_INTERNAL_ONLY"')

    def test_reply_reports_framing_but_never_credentials(self):
        reply = re.search(r'probe_reply\s*=\s*"(.*)"\n', TF).group(1)
        self.assertIn("{http.request.header.Content-Length}", reply)
        for header in ("Authorization", "Cookie", "Serverless"):
            self.assertNotIn(header, reply)


class EdgeStagingTest(unittest.TestCase):
    EDGE = block(TF, 'resource "google_cloud_run_v2_service" "edge_stg"')

    def test_reaches_internal_services_through_the_vpc(self):
        self.assertRegex(self.EDGE, r'egress\s*=\s*"ALL_TRAFFIC"')
        self.assertIn("google_cloud_run_v2_service.litellm_stg.uri", self.EDGE)

    def test_is_private_to_the_operator(self):
        for public in ("allUsers", "allAuthenticatedUsers"):
            self.assertNotIn(public, TF)
        self.assertIn("var.staging_invoker", block(TF, 'resource "google_cloud_run_v2_service_iam_member" "edge_stg_invoker"'))


class WarmPingTest(unittest.TestCase):
    JOB = block(TF, 'resource "google_cloud_scheduler_job" "litellm_stg_warm"')

    def test_starts_paused_and_only_touches_liveliness(self):
        self.assertRegex(self.JOB, r'paused\s*=\s*true')
        self.assertEqual(len(re.findall(r'/health/liveliness"', self.JOB)), 2)
        self.assertIn("var.warm_ping_via_edge", self.JOB)
        self.assertIn("oidc_token", self.JOB)


class PinningTest(unittest.TestCase):
    def test_images_are_digest_pinned(self):
        self.assertIn("@sha256:[0-9a-f]{64}$", block(TF, 'variable "staging_images"'))

    def test_staging_secret_versions_are_numbers(self):
        default = block(MAIN, 'variable "secret_versions"')
        for name in ("litellm-stg-master-key", "litellm-stg-salt-key", "litellm-stg-database-url",
                     "hanmadi-chat-api-key", "elevenlabs-api-key", "typesafe-api-key"):
            self.assertRegex(default, rf'"{name}"\s*=\s*"[1-9][0-9]*"')

    def test_scheduler_api_and_neon_key_container(self):
        self.assertIn('"cloudscheduler.googleapis.com"', block(MAIN, 'resource "google_project_service" "api"'))
        self.assertIn('"neon-stg-api-key"', block(MAIN, "locals {"))


if __name__ == "__main__":
    unittest.main()

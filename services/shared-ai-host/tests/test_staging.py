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
        for pattern in (r'min_instance_count\s*=\s*var.staging_min_instances', r'max_instance_count\s*=\s*1', r'max_instance_request_concurrency\s*=\s*20',
                        r'cpu_idle\s*=\s*true', r'startup_cpu_boost\s*=\s*true', r'timeout\s*=\s*"300s"'):
            self.assertRegex(self.SERVICE, pattern)

    def test_env_only_settings_are_set_on_the_service(self):
        self.assertEqual(env_pairs(self.SERVICE), {"STORE_MODEL_IN_DB": "False", "LITELLM_TELEMETRY": "False",
                                                   "DISABLE_SCHEMA_UPDATE": "true", "GRACEFUL_SHUTDOWN_TIMEOUT": "3"})

    def test_secrets_resolve_at_pinned_versions(self):
        self.assertRegex(self.SERVICE, r'version\s*=\s*local\.platform_secret_versions\[env\.value\]')
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
        self.assertIn("google_cloud_run_v2_service.litellm_stg[0].uri", self.EDGE)

    def test_egress_uses_its_own_subnet_with_private_google_access(self):
        self.assertIn("google_compute_subnetwork.staging.name", self.EDGE)
        self.assertNotIn("google_compute_subnetwork.proxy", self.EDGE)
        subnet = block(TF, 'resource "google_compute_subnetwork" "staging"')
        self.assertRegex(subnet, r'ip_cidr_range\s*=\s*"10\.79\.0\.64/26"')
        self.assertRegex(subnet, r'private_ip_google_access\s*=\s*true')

    def test_is_private_to_the_operator(self):
        for public in ("allUsers", "allAuthenticatedUsers"):
            self.assertNotIn(public, TF)
        self.assertIn("var.staging_invoker", block(TF, 'resource "google_cloud_run_v2_service_iam_member" "edge_stg_invoker"'))
        self.assertNotIn("invoker_iam_disabled", self.EDGE)


class WarmPingTest(unittest.TestCase):
    JOB = block(TF, 'resource "google_cloud_scheduler_job" "litellm_stg_warm"')

    def test_starts_paused_and_only_touches_liveliness(self):
        self.assertRegex(self.JOB, r'paused\s*=\s*true')
        self.assertEqual(len(re.findall(r'/health/liveliness"', self.JOB)), 2)
        self.assertIn("var.warm_ping_via_edge", self.JOB)
        self.assertIn("oidc_token", self.JOB)

    def test_resume_and_pause_survive_a_later_apply(self):
        self.assertRegex(self.JOB, r'ignore_changes\s*=\s*\[paused\]')


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


class ServerlessStagingSwitchTest(unittest.TestCase):
    """The 2026-10-12 gate decision kept the VM: the stack is off by default, the code is the way back."""

    def test_switch_defaults_off(self):
        self.assertRegex(block(TF, 'variable "serverless_staging"'), r'default\s*=\s*false')

    def test_every_staging_resource_follows_the_switch(self):
        gated = []
        for kind, name in re.findall(r'^resource "([a-z0-9_]+)" "([a-z0-9_]+)"', TF, re.M):
            body = block(TF, f'resource "{kind}" "{name}"')
            if (kind, name) == ("google_compute_subnetwork", "staging"):
                # Free to keep; deleting it right after the services races Direct VPC address release.
                self.assertNotIn("serverless_staging", body)
                continue
            self.assertRegex(body, r'(count\s*=\s*var\.serverless_staging \? 1 : 0|for_each\s*=\s*var\.serverless_staging \?)', name)
            gated.append(name)
        self.assertEqual(len(gated), 10)

    def test_staging_secret_containers_follow_the_switch(self):
        # Every container in local.secrets is staging-only, including the provider key copies.
        managed = block(MAIN, 'resource "google_secret_manager_secret" "managed"')
        self.assertRegex(managed, r'for_each\s*=\s*var\.serverless_staging \? local\.secrets : toset\(\[\]\)')

    def test_outputs_are_null_when_off(self):
        for name in ("staging_edge_url", "staging_litellm_url", "staging_probe_url"):
            self.assertRegex(TF, rf'output "{name}" {{ value = one\(google_cloud_run_v2_service\.[a-z_]+\[\*\]\.uri\) }}')


if __name__ == "__main__":
    unittest.main()

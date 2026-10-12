"""Guard opt-in defaults and isolation; live cloud behavior still needs app E2E."""
import unittest
from pathlib import Path
from test_staging import block
ROOT = Path(__file__).resolve().parents[1]
TF = (ROOT / "platform-staging.tf").read_text()
STAGING = (ROOT / "staging.tf").read_text()


class PlatformPolicyTest(unittest.TestCase):
    def test_defaults_do_not_enable_services_or_warming(self):
        self.assertRegex(block(TF,'variable "platform_staging"'),r'default\s*=\s*null')
        self.assertRegex(block(TF,'variable "prepare_platform_staging"'),r'default\s*=\s*false')
        self.assertRegex(block(TF,'variable "staging_min_instances"'),r'default\s*=\s*0')
        self.assertIn('serve = optional(bool, false)', TF.replace('serve           ', 'serve '))

    def test_discovery_is_internal_and_durable_with_bounded_concurrency(self):
        service=block(TF,'resource "google_cloud_run_v2_service" "discovery_stg"')
        self.assertIn('INGRESS_TRAFFIC_INTERNAL_ONLY',service)
        self.assertRegex(service,r'max_instance_request_concurrency\s*=\s*8')
        self.assertRegex(service,r'max_instance_count\s*=\s*2')
        self.assertNotIn('DISCOVERY_DB"',TF)
        self.assertIn('DISCOVERY_DATABASE_URL',TF)
        self.assertIn('JEV_CLOUD_RUN_AUDIENCE',TF)
        self.assertNotIn('vpc_access',service)

    def test_migration_is_separate_and_no_public_invoker(self):
        job=block(TF,'resource "google_cloud_run_v2_job" "discovery_stg_migrate"')
        self.assertIn('services/topic-discovery/pgstore.py',job)
        self.assertRegex(job,r'max_retries\s*=\s*0')
        self.assertNotIn('allUsers',TF)
        self.assertNotIn('allAuthenticatedUsers',TF)
        self.assertIn('roles/run.invoker',TF)

    def test_models_and_secrets_are_explicit_opt_in(self):
        self.assertIn('var.platform_staging == null ? {}',STAGING)
        self.assertIn('FESTA_CHAT_API_KEY',STAGING)
        self.assertIn('REPLAY_CHAT_API_KEY',STAGING)
        self.assertIn('local.platform_secret_versions[env.value]',TF)
        self.assertNotIn('"latest"',TF)

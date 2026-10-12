import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
TF=(ROOT/'accounts-staging.tf').read_text()

class AccountsStagingTest(unittest.TestCase):
    def test_opt_in_pinned_and_internal(self):
        self.assertIn('default = null',TF)
        self.assertIn('default = false',TF)
        self.assertIn('accounts-staging@sha256:',TF)
        self.assertIn('ingress              = "INGRESS_TRAFFIC_INTERNAL_ONLY"',TF)
        self.assertIn('min_instance_count = 0',TF)
        self.assertIn('max_instance_count = 2',TF)
        self.assertNotIn('allUsers',TF)
        self.assertNotIn('roles/editor',TF)
        self.assertIn('version = var.accounts_staging.secret_versions[env.value]',TF)

    def test_stateless_image_excludes_vm_login_runtime(self):
        image=(ROOT.parent/'ai-gateway/Dockerfile.accounts-v2').read_text()
        self.assertNotIn('account_worker',image)
        self.assertNotIn('install-claude',image)
        self.assertNotIn('litellm',image)
        self.assertIn('USER 65532:65532',image)

    def test_expiry_is_explicit_and_invoker_is_scoped_to_job(self):
        self.assertIn('toset(["migrate", "expire"])',TF)
        self.assertIn('google_cloud_run_v2_job_iam_member',TF)
        self.assertIn('jobs/${google_cloud_run_v2_job.accounts_stg["expire"].name}:run',TF)
        self.assertIn('oauth_token',TF)
        self.assertNotIn('google_project_iam_member',TF)

    def test_accounts_routes_do_not_leak_into_old_variants(self):
        self.assertIn('ACCOUNTS_UPSTREAM',(ROOT/'edge/Caddyfile.accounts').read_text())
        for variant in ['staging','platforms']:
            self.assertNotIn('ACCOUNTS_UPSTREAM',(ROOT/'edge'/('Caddyfile.'+variant)).read_text())

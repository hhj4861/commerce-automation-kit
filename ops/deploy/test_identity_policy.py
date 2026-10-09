"""Static checks for the deployment identity Terraform root module."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "gcp-identity"
MAIN = (ROOT / "main.tf").read_text()
WORKFLOW = "hhj4861/commerce-automation-kit/.github/workflows/shared-ai-images.yml@refs/heads/main"


def block(text, header):
    start = text.index(header)
    depth = 0
    for end in range(text.index("{", start), len(text)):
        depth += {"{": 1, "}": -1}.get(text[end], 0)
        if depth == 0:
            return text[start:end + 1]
    raise AssertionError(f"unbalanced block: {header}")


class IdentityPolicy(unittest.TestCase):
    def test_state_lives_in_the_gcs_backend(self):
        backend = block(MAIN, 'backend "gcs"')
        self.assertRegex(backend, r'bucket\s*=\s*"replay-live-508202-tfstate"')
        self.assertRegex(backend, r'prefix\s*=\s*"gcp-identity"')

    def test_image_provider_trusts_only_the_reviewed_workflow_on_main(self):
        provider = block(MAIN, 'resource "google_iam_workload_identity_pool_provider" "images"')
        for clause in ("assertion.repository_id == '1310729493'", "assertion.repository_owner_id == '71001056'",
                       "assertion.repository == 'hhj4861/commerce-automation-kit'", "assertion.ref == 'refs/heads/main'",
                       f"assertion.workflow_ref == '{WORKFLOW}'", "assertion.runner_environment == 'github-hosted'",
                       "assertion.event_name == 'workflow_dispatch'"):
            self.assertIn(clause, provider)
        # Without repository_id, image tokens cannot match the deploy SA's principalSet binding.
        self.assertNotIn("attribute.repository_id", provider)

    def test_image_pool_is_dedicated_to_the_image_provider(self):
        # The subject binding is pool-wide: any other provider in the same pool that maps
        # google.subject could mint "repo:...:ref:refs/heads/main" and use the image SA.
        pool = block(MAIN, 'resource "google_iam_workload_identity_pool" "images"')
        self.assertRegex(pool, r'workload_identity_pool_id\s*=\s*"cak-images"')
        users = [header for header in re.findall(r'resource "google_iam_workload_identity_pool_provider" "\w+"', MAIN)
                 if "google_iam_workload_identity_pool.images." in block(MAIN, header)]
        self.assertEqual(users, ['resource "google_iam_workload_identity_pool_provider" "images"'])
        self.assertIn("google_iam_workload_identity_pool.images.name", block(MAIN, 'resource "google_service_account_iam_member" "images_federation"'))

    def test_image_builder_can_only_write_the_shared_ai_repository(self):
        binding = block(MAIN, 'resource "google_service_account_iam_member" "images_federation"')
        self.assertIn("/subject/repo:hhj4861/commerce-automation-kit:ref:refs/heads/main", binding)
        writer = block(MAIN, 'resource "google_artifact_registry_repository_iam_member" "images_writer"')
        self.assertRegex(writer, r'repository\s*=\s*"shared-ai"')
        self.assertRegex(writer, r'role\s*=\s*"roles/artifactregistry\.writer"')
        self.assertNotRegex(MAIN, r'resource "google_project_iam_member" "images')

    def test_token_exchange_apis_are_enabled(self):
        apis = block(MAIN, 'resource "google_project_service" "identity"')
        for api in ("iamcredentials.googleapis.com", "sts.googleapis.com"):
            self.assertIn(f'"{api}"', apis)

    def test_no_vm_deploy_identity_is_created(self):
        # The VM deploy path was never applied (2026-10-09) and the VM is being retired:
        # nothing here may grant SSH/IAP access to it, and nothing needs importing.
        for retired in ("roles/compute.osAdminLogin", "roles/iap.tunnelResourceAccessor", "cak-litellm-deploy",
                        "refs/heads/deploy/litellm"):
            self.assertNotIn(retired, MAIN)
        self.assertFalse((ROOT / "imports.tf").exists())


if __name__ == "__main__":
    unittest.main()

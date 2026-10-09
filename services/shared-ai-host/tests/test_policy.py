"""Static policy checks for the shared-ai Terraform module; runs without cloud credentials."""
import re
import unittest
from pathlib import Path

TF = (Path(__file__).resolve().parents[1] / "main.tf").read_text()


def block(header):
    """Return one block, from its header to the matching closing brace."""
    start = TF.index(header)
    depth = 0
    for end in range(TF.index("{", start), len(TF)):
        depth += {"{": 1, "}": -1}.get(TF[end], 0)
        if depth == 0:
            return TF[start:end + 1]
    raise AssertionError(f"unbalanced block: {header}")


class StatePolicy(unittest.TestCase):
    def test_state_lives_in_the_gcs_backend(self):
        backend = block('backend "gcs"')
        self.assertRegex(backend, r'bucket\s*=\s*"replay-live-508202-tfstate"')
        self.assertRegex(backend, r'prefix\s*=\s*"shared-ai-host"')


class ComputePolicy(unittest.TestCase):
    def test_machine_type_matches_the_running_vm(self):
        variable = block('variable "machine_type"')
        self.assertRegex(variable, r'default\s*=\s*"e2-small"')
        self.assertIn('contains(["e2-small", "e2-standard-2", "e2-standard-4"], var.machine_type)', variable)


class RegistryPolicy(unittest.TestCase):
    def test_registry_and_secret_apis_are_enabled(self):
        apis = block('resource "google_project_service" "api"')
        for api in ("artifactregistry.googleapis.com", "secretmanager.googleapis.com"):
            self.assertIn(f'"{api}"', apis)

    def test_images_are_immutable_and_recent_ones_survive_cleanup(self):
        repo = block('resource "google_artifact_registry_repository" "images"')
        self.assertRegex(repo, r'repository_id\s*=\s*"shared-ai"')
        self.assertRegex(repo, r'format\s*=\s*"DOCKER"')
        self.assertRegex(repo, r'immutable_tags\s*=\s*true')
        self.assertRegex(repo, r'cleanup_policy_dry_run\s*=\s*false')
        self.assertRegex(repo, r'action\s*=\s*"KEEP"\s*most_recent_versions\s*\{\s*keep_count\s*=\s*5\s*\}')
        older = re.search(r'older_than\s*=\s*"(\d+)s"', repo)
        self.assertIsNotNone(older)
        self.assertGreaterEqual(int(older.group(1)), 30 * 24 * 3600)


class SecretPolicy(unittest.TestCase):
    NAMES = ["litellm-stg-master-key", "litellm-stg-salt-key", "litellm-stg-database-url",
             "hanmadi-chat-api-key", "replay-chat-api-key", "festa-chat-api-key",
             "elevenlabs-api-key", "typesafe-api-key"]

    def test_secret_containers_are_declared_without_values(self):
        names = block("locals {")
        for name in self.NAMES:
            self.assertIn(f'"{name}"', names)
        self.assertRegex(block('resource "google_secret_manager_secret" "managed"'), r'for_each\s*=\s*local\.secrets')
        self.assertNotIn("google_secret_manager_secret_version", TF)

    def test_secret_versions_must_be_pinned_numbers(self):
        self.assertIn('can(regex("^[1-9][0-9]*$", v))', block('variable "secret_versions"'))
        self.assertNotRegex(TF, r'(?i)versions/latest|version\s*=\s*"latest"')


if __name__ == "__main__":
    unittest.main()

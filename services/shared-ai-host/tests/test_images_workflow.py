"""Security properties of the image build workflow (stdlib has no YAML parser; text checks)."""
import re
import unittest
from pathlib import Path

WORKFLOW = Path(__file__).resolve().parents[3] / ".github/workflows/shared-ai-images.yml"
WF = WORKFLOW.read_text()


class ImagesWorkflowTest(unittest.TestCase):
    def test_runs_only_by_manual_dispatch_on_main(self):
        self.assertRegex(WF, r"(?m)^on:\n  workflow_dispatch:")
        self.assertNotRegex(WF, r"(?m)^  (push|pull_request|pull_request_target|schedule|workflow_run):")
        self.assertIn("if: github.ref == 'refs/heads/main'", WF)

    def test_token_permissions_are_minimal(self):
        self.assertRegex(WF, r"(?m)^permissions:\n  contents: read\n  id-token: write\n(?!  )")

    def test_images_are_a_closed_list_pushed_by_commit(self):
        options = re.search(r"options: \[([^\]]+)\]", WF).group(1).split(", ")
        self.assertEqual(options, ["litellm-staging", "litellm-production", "edge-staging"])
        self.assertIn("REGISTRY: us-central1-docker.pkg.dev/replay-live-508202/shared-ai", WF)
        self.assertIn('ref="$REGISTRY/$IMAGE:$SHA"', WF)

    def test_inputs_reach_the_shell_only_through_env(self):
        bodies = re.findall(r"run: \|\n((?: {10}.*\n)+)", WF)
        self.assertTrue(bodies)
        for body in bodies:
            self.assertNotIn("${{", body)

    def test_existing_commit_tag_is_reported_instead_of_rebuilt(self):
        body = WF[WF.index('ref="$REGISTRY/$IMAGE:$SHA"'):]
        self.assertLess(body.index('gcloud artifacts docker images describe "$ref"'), body.index("docker build"))

    def test_no_repository_secrets_are_used(self):
        self.assertNotIn("secrets.", WF)


if __name__ == "__main__":
    unittest.main()

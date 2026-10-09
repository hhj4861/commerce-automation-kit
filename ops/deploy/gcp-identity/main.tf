terraform {
  required_version = ">= 1.5.0, < 2.0.0"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 7.0" }
  }
  backend "gcs" {
    bucket = "replay-live-508202-tfstate"
    prefix = "gcp-identity"
  }
}
provider "google" {
  project = "replay-live-508202"
  region  = "us-central1"
}
data "google_project" "personal" {
  project_id = "replay-live-508202"
}
# The earlier VM deploy identity (deploy/litellm -> IAP SSH) was never applied and the VM
# is being retired by the serverless migration, so it is not created here. Cloud Run
# deploy identities are added in that plan's Phase 5.
resource "google_project_service" "identity" {
  for_each           = toset(["iamcredentials.googleapis.com", "sts.googleapis.com"])
  project            = data.google_project.personal.project_id
  service            = each.value
  disable_on_destroy = false
}
resource "google_iam_workload_identity_pool" "github" {
  project                   = data.google_project.personal.project_id
  workload_identity_pool_id = "cak-deploy"
  display_name              = "CAK reviewed GitHub workflows"
  depends_on                = [google_project_service.identity]
}
# Image builds: this provider trusts only the reviewed image workflow, manually dispatched
# on main. repository_id is deliberately not mapped, so its tokens can never satisfy a
# repository-wide principalSet binding that a later deploy provider might add.
resource "google_iam_workload_identity_pool_provider" "images" {
  project                            = data.google_project.personal.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-images"
  attribute_mapping = {
    "google.subject" = "assertion.sub"
  }
  attribute_condition = "assertion.repository_id == '1310729493' && assertion.repository_owner_id == '71001056' && assertion.repository == 'hhj4861/commerce-automation-kit' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == 'hhj4861/commerce-automation-kit/.github/workflows/shared-ai-images.yml@refs/heads/main' && assertion.runner_environment == 'github-hosted' && assertion.event_name == 'workflow_dispatch'"
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
}
resource "google_service_account" "images" {
  project      = data.google_project.personal.project_id
  account_id   = "cak-shared-ai-images"
  display_name = "Shared AI image builds from main"
}
resource "google_service_account_iam_member" "images_federation" {
  service_account_id = google_service_account.images.name
  role               = "roles/iam.workloadIdentityUser"
  # GitHub's default subject for a job without an environment.
  member = "principal://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/subject/repo:hhj4861/commerce-automation-kit:ref:refs/heads/main"
}
resource "google_artifact_registry_repository_iam_member" "images_writer" {
  project    = data.google_project.personal.project_id
  location   = "us-central1"
  repository = "shared-ai"
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.images.email}"
}
output "images_provider_variable" { value = google_iam_workload_identity_pool_provider.images.name }
output "images_service_account_variable" { value = google_service_account.images.email }

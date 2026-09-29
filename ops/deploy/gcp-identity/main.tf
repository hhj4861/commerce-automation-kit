terraform {
  required_version = ">= 1.5.0, < 2.0.0"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 7.0" }
  }
}
provider "google" {
  project = "replay-live-508202"
  region  = "us-central1"
}
data "google_project" "personal" {
  project_id = "replay-live-508202"
}
resource "google_project_service" "identity" {
  for_each           = toset(["iamcredentials.googleapis.com", "sts.googleapis.com", "oslogin.googleapis.com"])
  project            = data.google_project.personal.project_id
  service            = each.value
  disable_on_destroy = false
}
resource "google_iam_workload_identity_pool" "github" {
  project                   = data.google_project.personal.project_id
  workload_identity_pool_id = "cak-deploy"
  display_name              = "CAK reviewed deployment branches"
  depends_on                = [google_project_service.identity]
}
resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = data.google_project.personal.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.repository_id" = "assertion.repository_id"
  }
  attribute_condition = "assertion.repository_id == '1310729493' && assertion.repository_owner_id == '71001056' && assertion.repository == 'hhj4861/commerce-automation-kit' && assertion.ref == 'refs/heads/deploy/litellm' && assertion.workflow_ref == 'hhj4861/commerce-automation-kit/.github/workflows/platform-deploy.yml@refs/heads/deploy/litellm' && assertion.runner_environment == 'github-hosted' && assertion.event_name in ['push', 'workflow_dispatch']"
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
}
resource "google_service_account" "deploy" {
  project      = data.google_project.personal.project_id
  account_id   = "cak-litellm-deploy"
  display_name = "LiteLLM branch deployment via IAP"
}
resource "google_service_account_iam_member" "federation" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository_id/1310729493"
}
resource "google_project_iam_member" "instance_lookup" {
  project = data.google_project.personal.project_id
  role    = "roles/compute.viewer"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}
resource "google_compute_instance_iam_member" "ssh" {
  project       = data.google_project.personal.project_id
  zone          = "us-central1-a"
  instance_name = "shared-ai"
  role          = "roles/compute.osAdminLogin"
  member        = "serviceAccount:${google_service_account.deploy.email}"
}
resource "google_project_iam_member" "iap" {
  project = data.google_project.personal.project_id
  role    = "roles/iap.tunnelResourceAccessor"
  member  = "serviceAccount:${google_service_account.deploy.email}"
  condition {
    title      = "shared-ai-ssh-only"
    expression = "destination.ip == '10.78.0.2' && destination.port == 22"
  }
}
output "github_provider_variable" { value = google_iam_workload_identity_pool_provider.github.name }
output "github_service_account_variable" { value = google_service_account.deploy.email }

terraform {
  required_version = ">= 1.5.0, < 2.0.0"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 7.0" }
  }
}

variable "project_id" {
  type = string
  validation {
    condition     = var.project_id == "replay-live-508202"
    error_message = "This deployment is scoped to the verified personal project replay-live-508202."
  }
}
variable "machine_type" {
  type    = string
  default = "e2-standard-2"
  validation {
    condition     = contains(["e2-standard-2", "e2-standard-4"], var.machine_type)
    error_message = "Choose the reviewed 2-vCPU/8-GiB or 4-vCPU/16-GiB configuration."
  }
}
locals {
  region = "us-central1"
  zone   = "us-central1-a"
  name   = "shared-ai"
  caddy  = "docker.io/library/caddy@sha256:0c994536bddb66445885237f1a5dcc1916bccea922661c76b4e9fc24061f9b52"
}
provider "google" {
  project = var.project_id
  region  = local.region
  zone    = local.zone
  # Supply a short-lived token from the explicitly selected personal gcloud
  # account via GOOGLE_OAUTH_ACCESS_TOKEN. Never write it into tfvars or state.
}
resource "google_project_service" "api" {
  for_each           = toset(["compute.googleapis.com", "run.googleapis.com", "iam.googleapis.com", "iap.googleapis.com"])
  service            = each.value
  disable_on_destroy = false
}
resource "google_compute_network" "ai" {
  name                    = local.name
  auto_create_subnetworks = false
  depends_on              = [google_project_service.api]
}
resource "google_compute_subnetwork" "ai" {
  name                     = local.name
  network                  = google_compute_network.ai.id
  ip_cidr_range            = "10.78.0.0/24"
  private_ip_google_access = true
}
resource "google_compute_firewall" "iap_ssh" {
  name          = "shared-ai-iap-ssh"
  network       = google_compute_network.ai.name
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["shared-ai-host"]
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}
resource "google_compute_firewall" "api" {
  name        = "shared-ai-private-api"
  network     = google_compute_network.ai.name
  source_tags = ["shared-ai-proxy"]
  target_tags = ["shared-ai-host"]
  allow {
    protocol = "tcp"
    ports    = ["8080"]
  }
}
resource "google_compute_disk" "data" {
  name  = "shared-ai-data"
  type  = "pd-balanced"
  size  = 80
  image = "projects/ubuntu-os-cloud/global/images/family/ubuntu-2404-lts-amd64"
  lifecycle { prevent_destroy = true }
  depends_on = [google_project_service.api]
}
resource "google_compute_resource_policy" "backup" {
  name       = "shared-ai-daily"
  depends_on = [google_project_service.api]
  snapshot_schedule_policy {
    schedule {
      daily_schedule {
        days_in_cycle = 1
        start_time    = "04:00"
      }
    }
    retention_policy {
      max_retention_days    = 7
      on_source_disk_delete = "KEEP_AUTO_SNAPSHOTS"
    }
    snapshot_properties { storage_locations = [local.region] }
  }
}
resource "google_compute_disk_resource_policy_attachment" "backup" {
  name = google_compute_resource_policy.backup.name
  disk = google_compute_disk.data.name
}
resource "google_compute_instance" "host" {
  name                = local.name
  machine_type        = var.machine_type
  deletion_protection = true
  tags                = ["shared-ai-host"]
  boot_disk {
    source      = google_compute_disk.data.id
    auto_delete = false
  }
  network_interface {
    subnetwork = google_compute_subnetwork.ai.id
    network_ip = "10.78.0.2"
    # Outbound package/model access; no public ingress firewall is created.
    access_config {}
  }
  # No attached VM service account or cloud API scopes.
  metadata                = { enable-oslogin = "TRUE", block-project-ssh-keys = "TRUE" }
  metadata_startup_script = file("${path.module}/startup.sh")
  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }
  depends_on = [google_compute_disk_resource_policy_attachment.backup]
}
resource "google_service_account" "proxy" {
  account_id   = "shared-ai-proxy"
  display_name = "Shared AI HTTPS proxy (no project roles)"
  depends_on   = [google_project_service.api]
}
resource "google_cloud_run_v2_service" "proxy" {
  name                = "shared-ai"
  location            = local.region
  deletion_protection = true
  ingress             = "INGRESS_TRAFFIC_ALL"
  template {
    service_account                  = google_service_account.proxy.email
    timeout                          = "300s"
    max_instance_request_concurrency = 40
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = google_compute_network.ai.name
        subnetwork = google_compute_subnetwork.ai.name
        tags       = ["shared-ai-proxy"]
      }
    }
    containers {
      image   = local.caddy
      command = ["caddy"]
      args    = ["reverse-proxy", "--from", "http://:8080", "--to", "http://${google_compute_instance.host.network_interface[0].network_ip}:8080"]
      ports { container_port = 8080 }
      resources {
        limits            = { cpu = "1", memory = "512Mi" }
        cpu_idle          = true
        startup_cpu_boost = false
      }
    }
  }
  depends_on = [google_compute_firewall.api]
}
resource "google_cloud_run_v2_service_iam_member" "public_api" {
  project  = var.project_id
  location = local.region
  name     = google_cloud_run_v2_service.proxy.name
  role     = "roles/run.invoker"
  member   = "allUsers"
  # Model/app keys remain required by LiteLLM/Dify behind the API-only edge.
}
output "api_url" { value = google_cloud_run_v2_service.proxy.uri }
output "instance" { value = google_compute_instance.host.name }
output "zone" { value = local.zone }

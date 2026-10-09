# Phase 2 staging PoC (docs/plans/20261009-serverless-p2-staging-poc.md). No production data
# or virtual keys: a test master/salt key, an empty Neon (Free) database and the production
# provider keys only. Remove this file and apply if the gate stops the serverless path.
variable "staging_images" {
  description = "Digests for the first create only; later swaps go through gcloud run deploy (image changes are ignored)."
  type = object({
    litellm = string
    edge    = string
  })
  default = {
    litellm = "us-central1-docker.pkg.dev/replay-live-508202/shared-ai/litellm-staging@sha256:2c3f70cdbc08cac6bbc639905b1840740b26288425b095e43c0075c95fc39fb6"
    edge    = "us-central1-docker.pkg.dev/replay-live-508202/shared-ai/edge-staging@sha256:3ab3ac02426f806b398da4e68dcf9e5775727d1318a09906dd9598099f0a46a0"
  }
  validation {
    condition     = alltrue([for v in values(var.staging_images) : can(regex("^us-central1-docker\\.pkg\\.dev/replay-live-508202/shared-ai/[a-z-]+@sha256:[0-9a-f]{64}$", v))])
    error_message = "Staging images must be pinned by digest from the shared-ai registry."
  }
}
variable "staging_invoker" {
  description = "The only principal allowed to call the staging edge."
  type        = string
  default     = "user:guswhd1085@gmail.com"
}
variable "warm_ping_via_edge" {
  description = "Send the warm ping through the staging edge if Cloud Scheduler cannot reach the internal service."
  type        = bool
  default     = false
}
locals {
  # Env name -> Secret Manager secret, resolved at pinned numeric versions.
  litellm_stg_secrets = {
    LITELLM_MASTER_KEY   = "litellm-stg-master-key"
    LITELLM_SALT_KEY     = "litellm-stg-salt-key"
    DATABASE_URL         = "litellm-stg-database-url"
    HANMADI_CHAT_API_KEY = "hanmadi-chat-api-key"
    ELEVENLABS_API_KEY   = "elevenlabs-api-key"
    TYPESAFE_API_KEY     = "typesafe-api-key"
  }
  # Framing probe reply: how the second hop received a request. Never echoes credentials.
  probe_reply = "{\"method\":\"{http.request.method}\",\"path\":\"{http.request.uri}\",\"host\":\"{http.request.hostport}\",\"content_length\":\"{http.request.header.Content-Length}\"}"
}
resource "google_service_account" "litellm_stg" {
  account_id   = "shared-ai-litellm-stg"
  display_name = "Shared AI LiteLLM staging runtime (PoC)"
  depends_on   = [google_project_service.api]
}
resource "google_secret_manager_secret_iam_member" "litellm_stg" {
  for_each  = toset(values(local.litellm_stg_secrets))
  secret_id = google_secret_manager_secret.managed[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.litellm_stg.email}"
}
resource "google_cloud_run_v2_service" "litellm_stg" {
  name                 = "litellm-stg"
  location             = local.region
  deletion_protection  = false
  ingress              = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  invoker_iam_disabled = true
  template {
    service_account                  = google_service_account.litellm_stg.email
    timeout                          = "300s"
    max_instance_request_concurrency = 20
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      image = var.staging_images.litellm
      ports {
        container_port = 8080
      }
      resources {
        limits            = { cpu = "1", memory = "1Gi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      env {
        name  = "STORE_MODEL_IN_DB"
        value = "False"
      }
      env {
        name  = "LITELLM_TELEMETRY"
        value = "False"
      }
      env {
        name  = "DISABLE_SCHEMA_UPDATE"
        value = "true"
      }
      env {
        name  = "GRACEFUL_SHUTDOWN_TIMEOUT"
        value = "3"
      }
      dynamic "env" {
        for_each = local.litellm_stg_secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.managed[env.value].secret_id
              version = var.secret_versions[env.value]
            }
          }
        }
      }
      startup_probe {
        period_seconds    = 5
        timeout_seconds   = 3
        failure_threshold = 24
        http_get {
          path = "/health/liveliness"
        }
      }
    }
  }
  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_secret_manager_secret_iam_member.litellm_stg]
}
resource "google_cloud_run_v2_job" "litellm_stg_migrate" {
  name                = "litellm-stg-migrate"
  location            = local.region
  deletion_protection = false
  template {
    template {
      service_account = google_service_account.litellm_stg.email
      timeout         = "600s"
      max_retries     = 0
      containers {
        image = var.staging_images.litellm
        # Applies the Prisma migrations during setup, then exits (LiteLLM 1.102.1 CLI).
        # TODO(D1): flag behavior and log text are confirmed by the 7-5a run (table count).
        args = ["--config", "/etc/litellm/config.json", "--skip_server_startup"]
        resources {
          limits = { cpu = "1", memory = "1Gi" }
        }
        env {
          name  = "STORE_MODEL_IN_DB"
          value = "False"
        }
        env {
          name  = "LITELLM_TELEMETRY"
          value = "False"
        }
        dynamic "env" {
          for_each = local.litellm_stg_secrets
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = google_secret_manager_secret.managed[env.value].secret_id
                version = var.secret_versions[env.value]
              }
            }
          }
        }
      }
    }
  }
  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_secret_manager_secret_iam_member.litellm_stg]
}
# The staging edge image run as `caddy respond`: during the smoke, the edge's LLM_UPSTREAM
# points here briefly so the reply shows the Host and Content-Length the second hop received.
resource "google_cloud_run_v2_service" "probe_stg" {
  name                 = "shared-ai-probe-stg"
  location             = local.region
  deletion_protection  = false
  ingress              = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  invoker_iam_disabled = true
  template {
    service_account = google_service_account.proxy.email
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      image   = var.staging_images.edge
      command = ["caddy"]
      args    = ["respond", "--listen", ":8080", "--header", "Content-Type: application/json", "--body", local.probe_reply]
      ports {
        container_port = 8080
      }
      resources {
        limits   = { cpu = "1", memory = "512Mi" }
        cpu_idle = true
      }
    }
  }
  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
}
# The staging edge gets its own subnet: its Direct VPC egress addresses never compete with the
# production edge on shared-ai-proxy, and the VM firewall (source: the proxy subnet) does not
# trust it.
resource "google_compute_subnetwork" "staging" {
  name                     = "shared-ai-staging"
  network                  = google_compute_network.ai.id
  ip_cidr_range            = "10.79.0.64/26"
  private_ip_google_access = true
}
resource "google_cloud_run_v2_service" "edge_stg" {
  name                = "shared-ai-stg"
  location            = local.region
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"
  template {
    service_account                  = google_service_account.proxy.email
    timeout                          = "300s"
    max_instance_request_concurrency = 40
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    # All egress enters the VPC (Private Google Access on the subnet), so internal-only
    # services accept the edge's requests.
    vpc_access {
      egress = "ALL_TRAFFIC"
      network_interfaces {
        network    = google_compute_network.ai.name
        subnetwork = google_compute_subnetwork.staging.name
      }
    }
    containers {
      image = var.staging_images.edge
      ports {
        container_port = 8080
      }
      resources {
        limits            = { cpu = "1", memory = "512Mi" }
        cpu_idle          = true
        startup_cpu_boost = false
      }
      env {
        name  = "LLM_UPSTREAM"
        value = google_cloud_run_v2_service.litellm_stg.uri
      }
    }
  }
  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
}
resource "google_cloud_run_v2_service_iam_member" "edge_stg_invoker" {
  location = local.region
  name     = google_cloud_run_v2_service.edge_stg.name
  role     = "roles/run.invoker"
  member   = var.staging_invoker
}
resource "google_service_account" "scheduler_stg" {
  account_id   = "shared-ai-scheduler-stg"
  display_name = "Shared AI staging warm ping (PoC)"
  depends_on   = [google_project_service.api]
}
resource "google_cloud_run_v2_service_iam_member" "edge_stg_scheduler" {
  location = local.region
  name     = google_cloud_run_v2_service.edge_stg.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler_stg.email}"
}
# Paused until the g2 window. The liveliness route never queries the database.
resource "google_cloud_scheduler_job" "litellm_stg_warm" {
  name             = "litellm-stg-warm"
  region           = local.region
  schedule         = "*/5 * * * *"
  time_zone        = "Etc/UTC"
  paused           = true
  attempt_deadline = "60s"
  http_target {
    http_method = "GET"
    uri         = var.warm_ping_via_edge ? "${google_cloud_run_v2_service.edge_stg.uri}/llm/health/liveliness" : "${google_cloud_run_v2_service.litellm_stg.uri}/health/liveliness"
    oidc_token {
      service_account_email = google_service_account.scheduler_stg.email
      audience              = var.warm_ping_via_edge ? google_cloud_run_v2_service.edge_stg.uri : google_cloud_run_v2_service.litellm_stg.uri
    }
  }
  lifecycle {
    # Created paused; resume and pause during the PoC are runtime state, so a later apply
    # (for example warm_ping_via_edge=true) must not pause the job again.
    ignore_changes = [paused]
  }
  depends_on = [google_project_service.api, google_cloud_run_v2_service_iam_member.edge_stg_scheduler]
}
output "staging_edge_url" { value = google_cloud_run_v2_service.edge_stg.uri }
output "staging_litellm_url" { value = google_cloud_run_v2_service.litellm_stg.uri }
output "staging_probe_url" { value = google_cloud_run_v2_service.probe_stg.uri }

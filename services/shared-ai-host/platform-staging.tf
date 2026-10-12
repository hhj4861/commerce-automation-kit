# Opt-in app compatibility environment. Defaults preserve the Phase 2 PoC.
variable "staging_min_instances" {
  description = "0 preserves the cold experiment; 1 is an explicitly selected warm app trial, not a performance pass."
  type        = number
  default     = 0
  validation {
    condition     = contains([0, 1], var.staging_min_instances)
    error_message = "Choose zero or one staging instance."
  }
}
variable "prepare_platform_staging" {
  description = "Create only empty discovery secret containers before injecting values out of band."
  type        = bool
  default     = false
}
variable "platform_staging" {
  description = "Enable only after g1/g2, secret injection and schema migration. No production data or keys."
  type = object({
    discovery_image = string
    edge_url        = string
    secret_versions = map(string)
    serve           = optional(bool, false)
  })
  default = null
  validation {
    condition = var.platform_staging == null ? true : (
      can(regex("^us-central1-docker\\.pkg\\.dev/replay-live-508202/shared-ai/discovery-staging@sha256:[0-9a-f]{64}$", var.platform_staging.discovery_image)) &&
      can(regex("^https://shared-ai-stg-[a-z0-9-]+\\.a\\.run\\.app$", var.platform_staging.edge_url)) &&
      alltrue([for v in values(var.platform_staging.secret_versions) : can(regex("^[1-9][0-9]*$", v))]) &&
      alltrue([for k in ["discovery-stg-database-url", "discovery-stg-platform-keys", "discovery-stg-naver-id", "discovery-stg-naver-secret", "discovery-stg-jev-key", "festa-chat-api-key", "replay-chat-api-key"] : contains(keys(var.platform_staging.secret_versions), k)])
    )
    error_message = "Pin the discovery image, staging edge URL and all seven secret versions explicitly."
  }
}
locals {
  platform_secret_versions = merge(var.secret_versions, var.platform_staging == null ? {} : var.platform_staging.secret_versions)
  discovery_stg_secrets = {
    DISCOVERY_DATABASE_URL  = "discovery-stg-database-url"
    DISCOVERY_PLATFORM_KEYS = "discovery-stg-platform-keys"
    NAVER_CLIENT_ID         = "discovery-stg-naver-id"
    NAVER_CLIENT_SECRET     = "discovery-stg-naver-secret"
    JEV_API_KEY             = "discovery-stg-jev-key"
  }
  discovery_stg_env = {
    JEV_BASE_URL               = var.platform_staging == null ? "" : "${var.platform_staging.edge_url}/llm"
    JEV_CLOUD_RUN_AUDIENCE     = var.platform_staging == null ? "" : var.platform_staging.edge_url
    DISCOVERY_REQUESTS_PER_DAY = "3"
  }
}
resource "google_secret_manager_secret" "discovery_stg" {
  for_each  = var.prepare_platform_staging || var.platform_staging != null ? toset(values(local.discovery_stg_secrets)) : toset([])
  secret_id = each.value
  replication {
    auto {}
  }
  depends_on = [google_project_service.api]
}
resource "google_service_account" "discovery_stg" {
  count        = var.platform_staging == null ? 0 : 1
  account_id   = "shared-ai-discovery-stg"
  display_name = "Isolated discovery staging runtime"
}
resource "google_secret_manager_secret_iam_member" "discovery_stg" {
  for_each  = var.platform_staging == null ? toset([]) : toset(values(local.discovery_stg_secrets))
  secret_id = google_secret_manager_secret.discovery_stg[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.discovery_stg[0].email}"
}
resource "google_cloud_run_v2_service_iam_member" "discovery_stg_jev" {
  count    = var.platform_staging == null ? 0 : 1
  location = local.region
  name     = google_cloud_run_v2_service.edge_stg.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.discovery_stg[0].email}"
}
resource "google_cloud_run_v2_job" "discovery_stg_migrate" {
  count               = var.platform_staging == null ? 0 : 1
  name                = "discovery-stg-migrate"
  location            = local.region
  deletion_protection = false
  template {
    template {
      service_account = google_service_account.discovery_stg[0].email
      timeout         = "120s"
      max_retries     = 0
      containers {
        image   = var.platform_staging.discovery_image
        command = ["python3", "services/topic-discovery/pgstore.py"]
        args    = ["migrate"]
        resources { limits = { cpu = "1", memory = "512Mi" } }
        env {
          name = "DISCOVERY_DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.discovery_stg["discovery-stg-database-url"].secret_id
              version = local.platform_secret_versions["discovery-stg-database-url"]
            }
          }
        }
      }
    }
  }
  depends_on = [google_secret_manager_secret_iam_member.discovery_stg]
}
resource "google_cloud_run_v2_service" "discovery_stg" {
  count                = try(var.platform_staging.serve, false) ? 1 : 0
  name                 = "discovery-stg"
  location             = local.region
  deletion_protection  = false
  ingress              = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  invoker_iam_disabled = true
  template {
    service_account                  = google_service_account.discovery_stg[0].email
    timeout                          = "300s"
    max_instance_request_concurrency = 8
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
    containers {
      image = var.platform_staging.discovery_image
      ports { container_port = 8080 }
      resources {
        limits            = { cpu = "1", memory = "512Mi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      dynamic "env" {
        for_each = local.discovery_stg_secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.discovery_stg[env.value].secret_id
              version = local.platform_secret_versions[env.value]
            }
          }
        }
      }
      dynamic "env" {
        for_each = local.discovery_stg_env
        content {
          name  = env.key
          value = env.value
        }
      }
      startup_probe {
        period_seconds    = 5
        timeout_seconds   = 3
        failure_threshold = 12
        http_get { path = "/health" }
      }
    }
  }
  # No VPC egress/NAT is needed: search uses HTTPS and JEV uses the IAM-private edge
  # with this runtime's metadata identity. Incoming edge traffic still uses its VPC.
  depends_on = [google_secret_manager_secret_iam_member.discovery_stg]
}

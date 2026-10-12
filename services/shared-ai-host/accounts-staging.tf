# Optional accounts v2 staging; production VM account_service.py is not switched.
variable "prepare_accounts_staging" {
  type    = bool
  default = false
}
variable "accounts_staging" {
  type = object({
    image           = string
    secret_versions = map(string)
    models          = map(list(string))
    active_key_id   = number
    serve           = optional(bool, false)
  })
  default = null
  validation {
    condition = var.accounts_staging == null ? true : (
      can(regex("^us-central1-docker\\.pkg\\.dev/replay-live-508202/shared-ai/accounts-staging@sha256:[0-9a-f]{64}$", var.accounts_staging.image)) &&
      alltrue([for k in ["accounts-stg-database-url", "accounts-stg-platform-keys", "accounts-stg-keyring"] : contains(keys(var.accounts_staging.secret_versions), k)]) &&
      alltrue([for v in values(var.accounts_staging.secret_versions) : can(regex("^[1-9][0-9]*$", v))]) &&
      toset(keys(var.accounts_staging.models)) == toset(["openai", "claude"]) &&
      alltrue([for models in values(var.accounts_staging.models) : length(models) > 0 && length(models) <= 30 && alltrue([for m in models : can(regex("^[a-zA-Z0-9.-]{1,100}$", m))])]) &&
      var.accounts_staging.active_key_id >= 1 && var.accounts_staging.active_key_id <= 32767 && floor(var.accounts_staging.active_key_id) == var.accounts_staging.active_key_id
    )
    error_message = "Pin accounts staging image, three secret versions, encryption key ID and both model allowlists."
  }
}
locals {
  accounts_stg_secrets = {
    ACCOUNT_DATABASE_URL  = "accounts-stg-database-url"
    ACCOUNT_PLATFORM_KEYS = "accounts-stg-platform-keys"
    ACCOUNT_KEYRING       = "accounts-stg-keyring"
  }
  accounts_stg_env = var.accounts_staging == null ? {} : {
    ACCOUNT_ACTIVE_KEY_ID = tostring(var.accounts_staging.active_key_id)
    ACCOUNT_MODELS        = jsonencode(var.accounts_staging.models)
  }
}
resource "google_secret_manager_secret" "accounts_stg" {
  for_each  = var.prepare_accounts_staging || var.accounts_staging != null ? toset(values(local.accounts_stg_secrets)) : toset([])
  secret_id = each.value
  replication {
    auto {}
  }
  depends_on = [google_project_service.api]
}
resource "google_service_account" "accounts_stg" {
  count        = var.accounts_staging == null ? 0 : 1
  account_id   = "shared-ai-accounts-stg"
  display_name = "Isolated API-key accounts staging"
}
resource "google_secret_manager_secret_iam_member" "accounts_stg" {
  for_each  = var.accounts_staging == null ? toset([]) : toset(values(local.accounts_stg_secrets))
  secret_id = google_secret_manager_secret.accounts_stg[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.accounts_stg[0].email}"
}
resource "google_cloud_run_v2_job" "accounts_stg" {
  for_each            = var.accounts_staging == null ? toset([]) : toset(["migrate", "expire"])
  name                = "accounts-stg-${each.key}"
  location            = local.region
  deletion_protection = false
  template {
    template {
      service_account = google_service_account.accounts_stg[0].email
      timeout         = "120s"
      max_retries     = 0
      containers {
        image   = var.accounts_staging.image
        command = ["python", "accounts_store.py"]
        args    = [each.key]
        resources { limits = { cpu = "1", memory = "512Mi" } }
        dynamic "env" {
          for_each = local.accounts_stg_secrets
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = google_secret_manager_secret.accounts_stg[env.value].secret_id
                version = var.accounts_staging.secret_versions[env.value]
              }
            }
          }
        }
        dynamic "env" {
          for_each = local.accounts_stg_env
          content {
            name  = env.key
            value = env.value
          }
        }
      }
    }
  }
  depends_on = [google_secret_manager_secret_iam_member.accounts_stg]
}
resource "google_cloud_run_v2_service" "accounts_stg" {
  count                = try(var.accounts_staging.serve, false) ? 1 : 0
  name                 = "accounts-stg"
  location             = local.region
  deletion_protection  = false
  ingress              = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  invoker_iam_disabled = true # Internal edge forwards the application's Authorization key.
  template {
    service_account                  = google_service_account.accounts_stg[0].email
    timeout                          = "30s"
    max_instance_request_concurrency = 8
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
    containers {
      image = var.accounts_staging.image
      ports { container_port = 8080 }
      resources {
        limits            = { cpu = "1", memory = "512Mi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      dynamic "env" {
        for_each = local.accounts_stg_secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.accounts_stg[env.value].secret_id
              version = var.accounts_staging.secret_versions[env.value]
            }
          }
        }
      }
      dynamic "env" {
        for_each = local.accounts_stg_env
        content {
          name  = env.key
          value = env.value
        }
      }
      startup_probe {
        period_seconds    = 3
        timeout_seconds   = 2
        failure_threshold = 10
        http_get { path = "/health" }
      }
    }
  }
  depends_on = [google_secret_manager_secret_iam_member.accounts_stg]
}
resource "google_cloud_run_v2_job_iam_member" "accounts_stg_expiry" {
  count    = try(var.accounts_staging.serve, false) ? 1 : 0
  location = local.region
  name     = google_cloud_run_v2_job.accounts_stg["expire"].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler_stg.email}"
}
resource "google_cloud_scheduler_job" "accounts_stg_expiry" {
  count     = try(var.accounts_staging.serve, false) ? 1 : 0
  name      = "accounts-stg-expire"
  region    = local.region
  schedule  = "0 3 * * *"
  time_zone = "Etc/UTC"
  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/projects/${var.project_id}/locations/${local.region}/jobs/${google_cloud_run_v2_job.accounts_stg["expire"].name}:run"
    oauth_token { service_account_email = google_service_account.scheduler_stg.email }
  }
  depends_on = [google_cloud_run_v2_job_iam_member.accounts_stg_expiry]
}

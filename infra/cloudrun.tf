data "google_project" "project" {}

locals {
  api_image = "${var.region}-docker.pkg.dev/${var.project_id}/eval-images/eval-api:latest"
  web_image = "${var.region}-docker.pkg.dev/${var.project_id}/eval-images/eval-web:latest"

  # Deterministic Cloud Run URLs (service-PROJECT_NUMBER.REGION.run.app) so the
  # API can reference the web URL without a dependency cycle between services.
  api_url = "https://eval-api-${data.google_project.project.number}.${var.region}.run.app"
  web_url = "https://eval-web-${data.google_project.project.number}.${var.region}.run.app"
}

# API Cloud Run service
resource "google_cloud_run_v2_service" "api" {
  count    = var.deploy_services ? 1 : 0
  name     = "eval-api"
  location = var.region

  template {
    service_account = google_service_account.cloudrun.email

    scaling {
      min_instance_count = var.api_min_instances
      max_instance_count = 3
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "ALL_TRAFFIC"
    }

    containers {
      image = local.api_image

      ports {
        container_port = 3001
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "REDIS_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.redis_url.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "SESSION_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.session_secret.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "PSEUDONYM_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.pseudonym_secret.secret_id
            version = "latest"
          }
        }
      }

      # Gemini access — exactly one mode is active (see var.gemini_mode).
      dynamic "env" {
        for_each = var.gemini_mode == "api_key" ? [1] : []
        content {
          name = "GEMINI_API_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.gemini_api_key.secret_id
              version = "latest"
            }
          }
        }
      }

      dynamic "env" {
        for_each = var.gemini_mode == "vertex" ? [1] : []
        content {
          name  = "GEMINI_USE_VERTEX"
          value = "true"
        }
      }

      dynamic "env" {
        for_each = var.gemini_mode == "vertex" ? [1] : []
        content {
          name  = "GOOGLE_CLOUD_PROJECT"
          value = var.project_id
        }
      }

      dynamic "env" {
        for_each = var.gemini_mode == "vertex" ? [1] : []
        content {
          name  = "GOOGLE_CLOUD_LOCATION"
          value = var.vertex_location
        }
      }

      env {
        name  = "GEMINI_MODEL"
        value = var.gemini_model
      }

      env {
        name  = "API_PORT"
        value = "3001"
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "WORKER_CONCURRENCY"
        value = "5"
      }

      env {
        name  = "AUTO_IMPORT_DAILY"
        value = var.auto_import_daily ? "true" : "false"
      }

      dynamic "env" {
        for_each = var.bigquery_project != "" ? [1] : []
        content {
          name  = "BIGQUERY_PROJECT"
          value = var.bigquery_project
        }
      }

      env {
        name  = "APP_URL"
        value = local.web_url
      }

      env {
        name  = "CORS_ORIGIN"
        value = local.web_url
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository.docker,
  ]
}

# Web Cloud Run service
resource "google_cloud_run_v2_service" "web" {
  count    = var.deploy_services ? 1 : 0
  name     = "eval-web"
  location = var.region

  template {
    service_account = google_service_account.cloudrun.email

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      image = local.web_image

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "256Mi"
        }
      }

      # The API URL is baked into the web build via the BACKEND_URL build arg
      # (see cloudbuild.yaml); this runtime env only documents the wiring.
      env {
        name  = "BACKEND_URL"
        value = local.api_url
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository.docker,
  ]
}

# Allow unauthenticated access (public web app)
resource "google_cloud_run_v2_service_iam_member" "api_public" {
  count    = var.deploy_services ? 1 : 0
  name     = google_cloud_run_v2_service.api[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "web_public" {
  count    = var.deploy_services ? 1 : 0
  name     = google_cloud_run_v2_service.web[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

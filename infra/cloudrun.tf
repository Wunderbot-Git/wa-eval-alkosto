locals {
  api_image = "${var.region}-docker.pkg.dev/${var.project_id}/eval-images/eval-api:latest"
  web_image = "${var.region}-docker.pkg.dev/${var.project_id}/eval-images/eval-web:latest"
}

# API Cloud Run service
resource "google_cloud_run_v2_service" "api" {
  count    = var.deploy_services ? 1 : 0
  name     = "eval-api"
  location = var.region

  template {
    service_account = google_service_account.cloudrun.email

    scaling {
      min_instance_count = 0
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
        name = "GEMINI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gemini_api_key.secret_id
            version = "latest"
          }
        }
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

      env {
        name  = "NEXT_PUBLIC_API_URL"
        value = var.deploy_services ? google_cloud_run_v2_service.api[0].uri : ""
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

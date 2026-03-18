# Service account for Cloud Run
resource "google_service_account" "cloudrun" {
  account_id   = "eval-cloudrun"
  display_name = "Eval System Cloud Run"
}

# Cloud SQL Client
resource "google_project_iam_member" "cloudrun_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloudrun.email}"
}

# Secret Manager accessor
resource "google_project_iam_member" "cloudrun_secrets" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.cloudrun.email}"
}

# Allow secret access per secret
locals {
  secrets = [
    google_secret_manager_secret.database_url.id,
    google_secret_manager_secret.redis_url.id,
    google_secret_manager_secret.session_secret.id,
    google_secret_manager_secret.gemini_api_key.id,
  ]
}

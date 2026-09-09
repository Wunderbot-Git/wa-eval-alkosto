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

# Vertex AI user (only needed when judges call Gemini via Vertex AI)
resource "google_project_iam_member" "cloudrun_vertex" {
  count   = var.gemini_mode == "vertex" ? 1 : 0
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.cloudrun.email}"
}

# Allow secret access per secret
locals {
  secrets = [
    google_secret_manager_secret.database_url.id,
    google_secret_manager_secret.redis_url.id,
    google_secret_manager_secret.session_secret.id,
    google_secret_manager_secret.pseudonym_secret.id,
    google_secret_manager_secret.gemini_api_key.id,
  ]
}

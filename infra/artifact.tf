# Artifact Registry for Docker images
resource "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = "eval-images"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]
}

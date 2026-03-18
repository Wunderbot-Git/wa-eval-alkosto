output "api_url" {
  description = "API Cloud Run service URL"
  value       = google_cloud_run_v2_service.api.uri
}

output "web_url" {
  description = "Web Cloud Run service URL"
  value       = google_cloud_run_v2_service.web.uri
}

output "postgres_private_ip" {
  description = "Cloud SQL private IP"
  value       = google_sql_database_instance.postgres.private_ip_address
}

output "redis_host" {
  description = "Memorystore Redis host"
  value       = google_redis_instance.redis.host
}

output "artifact_registry" {
  description = "Artifact Registry repository"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/eval-images"
}

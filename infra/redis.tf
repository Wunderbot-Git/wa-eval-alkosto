# Memorystore Redis 7
resource "google_redis_instance" "redis" {
  name           = "eval-redis"
  tier           = "BASIC"
  memory_size_gb = 1
  region         = var.region
  redis_version  = "REDIS_7_0"

  authorized_network = google_compute_network.vpc.id

  depends_on = [google_project_service.apis]
}

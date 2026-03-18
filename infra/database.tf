# Cloud SQL PostgreSQL 16
resource "google_sql_database_instance" "postgres" {
  name             = "eval-postgres"
  database_version = "POSTGRES_16"
  region           = var.region

  settings {
    tier              = "db-f1-micro"
    availability_type = "ZONAL"

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
    }

    backup_configuration {
      enabled    = true
      start_time = "03:00"
    }
  }

  deletion_protection = false
  depends_on          = [google_service_networking_connection.private_vpc]
}

resource "google_sql_database" "eval_db" {
  name     = "eval_prod"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "eval_user" {
  name     = "eval"
  instance = google_sql_database_instance.postgres.name
  password = var.db_password
}

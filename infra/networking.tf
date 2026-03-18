# VPC for private connectivity
resource "google_compute_network" "vpc" {
  name                    = "eval-vpc"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.apis]
}

resource "google_compute_subnetwork" "subnet" {
  name          = "eval-subnet"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = google_compute_network.vpc.id
}

# Serverless VPC connector for Cloud Run → Cloud SQL / Redis
resource "google_vpc_access_connector" "connector" {
  name          = "eval-vpc-connector"
  region        = var.region
  ip_cidr_range = "10.8.0.0/28"
  network       = google_compute_network.vpc.name
  depends_on    = [google_project_service.apis]
}

# Allow private services access (Cloud SQL)
resource "google_compute_global_address" "private_ip" {
  name          = "eval-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip.name]
}

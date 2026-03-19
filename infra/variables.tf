variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "wa-eval-alkosto"
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP zone"
  type        = string
  default     = "us-central1-a"
}

variable "db_password" {
  description = "PostgreSQL password for eval user"
  type        = string
  sensitive   = true
}

variable "session_secret" {
  description = "Secret for session signing"
  type        = string
  sensitive   = true
}

variable "gemini_api_key" {
  description = "Gemini API key (optional, leave empty for fake judges)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "deploy_services" {
  description = "Set to true after Docker images are pushed to deploy Cloud Run services"
  type        = bool
  default     = false
}

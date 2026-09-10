variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "autogestion-alkosto"
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

variable "pseudonym_secret" {
  description = "Stable HMAC secret for pseudonymous user identifiers in the review workspace. Never rotate between imports of the same dataset."
  type        = string
  sensitive   = true
}

variable "gemini_mode" {
  description = "How judges reach Gemini: 'vertex' (Vertex AI via service account, no key), 'api_key' (Gemini API key from Secret Manager), or 'fake' (deterministic fake judges)"
  type        = string
  default     = "fake"
  validation {
    condition     = contains(["vertex", "api_key", "fake"], var.gemini_mode)
    error_message = "gemini_mode must be one of: vertex, api_key, fake"
  }
}

variable "gemini_model" {
  description = "Gemini model name used by the judges"
  type        = string
  default     = "gemini-2.5-flash"
}

variable "vertex_location" {
  description = "Vertex AI location for Gemini calls ('global' or a region like us-central1). Only used when gemini_mode = vertex."
  type        = string
  default     = "global"
}

variable "gemini_api_key" {
  description = "Gemini API key (only used when gemini_mode = api_key)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "deploy_services" {
  description = "Set to true after Docker images are pushed to deploy Cloud Run services"
  type        = bool
  default     = false
}

variable "api_min_instances" {
  description = "Minimum API instances. Must be >= 1 for scheduled jobs (daily BigQuery auto-import) to fire; 0 lets the service scale to zero."
  type        = number
  default     = 0
}

variable "auto_import_daily" {
  description = "Import yesterday's conversations from BigQuery every day at 06:00 Colombia time (requires api_min_instances >= 1 and BigQuery access for the service account)"
  type        = bool
  default     = false
}

variable "auto_evaluate_daily" {
  description = "After the daily import, evaluate the conversations with enough dialogue to judge (requires api_min_instances >= 1 and Gemini access; two model calls per conversation)"
  type        = bool
  default     = false
}

variable "auto_evaluate_limit" {
  description = "Maximum conversations evaluated in one automatic run, so an unusually large import cannot become an unexpected model bill"
  type        = number
  default     = 200
}

variable "bigquery_project" {
  description = "Billing project for workspace BigQuery imports (empty = GOOGLE_CLOUD_PROJECT)"
  type        = string
  default     = ""
}

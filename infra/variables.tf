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

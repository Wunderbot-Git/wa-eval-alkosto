export interface EnvConfig {
  DATABASE_URL: string
  REDIS_URL: string
  API_PORT: number
  APP_URL: string
  SESSION_SECRET: string
  SESSION_MAX_AGE_HOURS: number
  WORKER_CONCURRENCY: number
  GEMINI_API_KEY?: string
  GEMINI_USE_VERTEX: boolean
  GOOGLE_CLOUD_PROJECT?: string
  GOOGLE_CLOUD_LOCATION?: string
  GEMINI_MODEL: string
  CORS_ORIGIN: string
}

const required = (key: string): string => {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

const optional = (key: string, fallback: string): string => {
  return process.env[key] || fallback
}

export function loadEnv(): EnvConfig {
  return {
    DATABASE_URL: required('DATABASE_URL'),
    REDIS_URL: required('REDIS_URL'),
    API_PORT: parseInt(optional('API_PORT', '3001'), 10),
    APP_URL: optional('APP_URL', 'http://localhost:3000'),
    SESSION_SECRET: required('SESSION_SECRET'),
    SESSION_MAX_AGE_HOURS: parseInt(optional('SESSION_MAX_AGE_HOURS', '24'), 10),
    WORKER_CONCURRENCY: parseInt(optional('WORKER_CONCURRENCY', '5'), 10),
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || undefined,
    GEMINI_USE_VERTEX: process.env.GEMINI_USE_VERTEX === 'true',
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT || undefined,
    GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION || undefined,
    GEMINI_MODEL: optional('GEMINI_MODEL', 'gemini-2.0-flash'),
    CORS_ORIGIN: optional('CORS_ORIGIN', 'http://localhost:3000'),
  }
}

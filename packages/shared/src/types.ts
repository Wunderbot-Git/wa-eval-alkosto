import type { Role } from './enums'

export interface HealthResponse {
  status: 'ok'
  timestamp: string
}

export interface UserSession {
  id: string
  email: string
  role: Role
}

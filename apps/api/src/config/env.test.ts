import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadEnv } from './env'

describe('loadEnv', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      SESSION_SECRET: 'test-secret',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('loads valid config with defaults', () => {
    const config = loadEnv()
    expect(config.DATABASE_URL).toBe('postgresql://test:test@localhost:5432/test')
    expect(config.API_PORT).toBe(3001)
    expect(config.SESSION_MAX_AGE_HOURS).toBe(24)
  })

  it('throws on missing DATABASE_URL', () => {
    delete process.env.DATABASE_URL
    expect(() => loadEnv()).toThrow('Missing required environment variable: DATABASE_URL')
  })

  it('throws on missing SESSION_SECRET', () => {
    delete process.env.SESSION_SECRET
    expect(() => loadEnv()).toThrow('Missing required environment variable: SESSION_SECRET')
  })

  it('uses custom port when set', () => {
    process.env.API_PORT = '4000'
    const config = loadEnv()
    expect(config.API_PORT).toBe(4000)
  })
})

import { describe, it, expect } from 'vitest'
import { validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { LoginDto } from './login.dto'

describe('LoginDto', () => {
  it('should pass with valid email and password', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'user@alkosto.com',
      password: 'password123',
    })
    const errors = await validate(dto)
    expect(errors).toHaveLength(0)
  })

  it('should fail with invalid email', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'not-an-email',
      password: 'password123',
    })
    const errors = await validate(dto)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].property).toBe('email')
  })

  it('should fail with empty email', async () => {
    const dto = plainToInstance(LoginDto, {
      email: '',
      password: 'password123',
    })
    const errors = await validate(dto)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('should fail with empty password', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'user@alkosto.com',
      password: '',
    })
    const errors = await validate(dto)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('should fail with missing fields', async () => {
    const dto = plainToInstance(LoginDto, {})
    const errors = await validate(dto)
    expect(errors.length).toBeGreaterThanOrEqual(2)
  })
})

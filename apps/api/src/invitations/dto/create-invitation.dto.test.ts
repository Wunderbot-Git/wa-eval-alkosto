import { describe, it, expect } from 'vitest'
import { validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { CreateInvitationDto } from './create-invitation.dto'

describe('CreateInvitationDto', () => {
  it('should pass with valid email and role', async () => {
    const dto = plainToInstance(CreateInvitationDto, {
      email: 'user@alkosto.com',
      role: 'ADMIN',
    })
    const errors = await validate(dto)
    expect(errors).toHaveLength(0)
  })

  it('should fail with invalid email', async () => {
    const dto = plainToInstance(CreateInvitationDto, {
      email: 'invalid',
      role: 'ADMIN',
    })
    const errors = await validate(dto)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('should fail with invalid role', async () => {
    const dto = plainToInstance(CreateInvitationDto, {
      email: 'user@alkosto.com',
      role: 'INVALID_ROLE',
    })
    const errors = await validate(dto)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('should pass with all valid roles', async () => {
    for (const role of ['ADMIN', 'INTERNAL_ALKOSTO', 'YALO_READER']) {
      const dto = plainToInstance(CreateInvitationDto, {
        email: 'user@alkosto.com',
        role,
      })
      const errors = await validate(dto)
      expect(errors).toHaveLength(0)
    }
  })
})

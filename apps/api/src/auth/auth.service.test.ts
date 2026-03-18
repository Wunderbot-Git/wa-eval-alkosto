import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthService } from './auth.service'
import { UnauthorizedException } from '@nestjs/common'

function makePrismaStub() {
  return {
    user: {
      findUnique: vi.fn(),
    },
    session: {
      create: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  }
}

describe('AuthService', () => {
  let service: AuthService
  let prisma: ReturnType<typeof makePrismaStub>

  beforeEach(() => {
    prisma = makePrismaStub()
    service = new AuthService(prisma as any)
  })

  describe('hashPassword / verifyPassword', () => {
    it('should produce salt:hash format', () => {
      const hashed = service.hashPassword('test123')
      expect(hashed).toContain(':')
      const [salt, hash] = hashed.split(':')
      expect(salt).toHaveLength(32) // 16 bytes hex
      expect(hash).toHaveLength(128) // 64 bytes hex
    })

    it('should verify a correct password', () => {
      const hashed = service.hashPassword('mypassword')
      expect(service.verifyPassword('mypassword', hashed)).toBe(true)
    })

    it('should reject a wrong password', () => {
      const hashed = service.hashPassword('mypassword')
      expect(service.verifyPassword('wrongpassword', hashed)).toBe(false)
    })

    it('should reject malformed stored hash', () => {
      expect(service.verifyPassword('test', 'nocolon')).toBe(false)
    })
  })

  describe('login', () => {
    const fakeUser = {
      id: 'user-1',
      email: 'admin@test.com',
      role: 'ADMIN',
      isActive: true,
      passwordHash: '', // will be set in test
    }

    it('should create a session and return session ID + user info', async () => {
      const pw = 'secret123'
      const user = { ...fakeUser, passwordHash: service.hashPassword(pw) }
      prisma.user.findUnique.mockResolvedValue(user)
      prisma.session.create.mockResolvedValue({ id: 'sess-1', userId: user.id, expiresAt: new Date() })

      const result = await service.login('admin@test.com', pw)
      expect(result.sessionId).toBe('sess-1')
      expect(result.user).toEqual({ id: 'user-1', email: 'admin@test.com', role: 'ADMIN' })
      expect(prisma.session.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'user-1' }),
      })
    })

    it('should throw if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null)
      await expect(service.login('nope@test.com', 'pw')).rejects.toThrow(UnauthorizedException)
    })

    it('should throw if user is inactive', async () => {
      const user = { ...fakeUser, isActive: false, passwordHash: service.hashPassword('pw') }
      prisma.user.findUnique.mockResolvedValue(user)
      await expect(service.login('admin@test.com', 'pw')).rejects.toThrow(UnauthorizedException)
    })

    it('should throw if password is wrong', async () => {
      const user = { ...fakeUser, passwordHash: service.hashPassword('correct') }
      prisma.user.findUnique.mockResolvedValue(user)
      await expect(service.login('admin@test.com', 'wrong')).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('validateSession', () => {
    it('should return user when session is valid', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'sess-1',
        expiresAt: new Date(Date.now() + 60000),
        user: { id: 'u1', email: 'a@b.com', role: 'ADMIN', isActive: true },
      })
      const result = await service.validateSession('sess-1')
      expect(result).toEqual({ id: 'u1', email: 'a@b.com', role: 'ADMIN' })
    })

    it('should return null when session not found', async () => {
      prisma.session.findUnique.mockResolvedValue(null)
      const result = await service.validateSession('nonexistent')
      expect(result).toBeNull()
    })

    it('should return null and delete expired session', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'sess-1',
        expiresAt: new Date(Date.now() - 60000),
        user: { id: 'u1', email: 'a@b.com', role: 'ADMIN', isActive: true },
      })
      prisma.session.delete.mockResolvedValue({})
      const result = await service.validateSession('sess-1')
      expect(result).toBeNull()
      expect(prisma.session.delete).toHaveBeenCalledWith({ where: { id: 'sess-1' } })
    })

    it('should return null when user is inactive', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'sess-1',
        expiresAt: new Date(Date.now() + 60000),
        user: { id: 'u1', email: 'a@b.com', role: 'ADMIN', isActive: false },
      })
      const result = await service.validateSession('sess-1')
      expect(result).toBeNull()
    })
  })

  describe('logout', () => {
    it('should delete the session', async () => {
      prisma.session.delete.mockResolvedValue({})
      await service.logout('sess-1')
      expect(prisma.session.delete).toHaveBeenCalledWith({ where: { id: 'sess-1' } })
    })

    it('should not throw if session already deleted', async () => {
      prisma.session.delete.mockRejectedValue(new Error('not found'))
      await expect(service.logout('sess-1')).resolves.toBeUndefined()
    })
  })
})

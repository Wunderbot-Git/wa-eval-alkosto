import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InvitationService } from './invitation.service'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'

function makePrismaStub() {
  return {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    inviteToken: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  }
}

function makeAuthServiceStub() {
  return {
    hashPassword: vi.fn().mockReturnValue('salt:hash'),
  }
}

describe('InvitationService', () => {
  let service: InvitationService
  let prisma: ReturnType<typeof makePrismaStub>
  let authService: ReturnType<typeof makeAuthServiceStub>

  beforeEach(() => {
    prisma = makePrismaStub()
    authService = makeAuthServiceStub()
    service = new InvitationService(prisma as any, authService as any)
  })

  describe('createInvite', () => {
    it('should create an invite and return invite link', async () => {
      prisma.user.findUnique.mockResolvedValue(null)
      prisma.inviteToken.findFirst.mockResolvedValue(null)
      prisma.inviteToken.create.mockResolvedValue({
        id: 'inv-1',
        email: 'new@test.com',
        role: 'INTERNAL_ALKOSTO',
        token: 'abc123',
        expiresAt: new Date('2026-04-01'),
        createdBy: 'user-1',
        createdAt: new Date(),
      })

      const result = await service.createInvite('new@test.com', 'INTERNAL_ALKOSTO' as any, 'user-1')

      expect(result.email).toBe('new@test.com')
      expect(result.role).toBe('INTERNAL_ALKOSTO')
      expect(result.inviteLink).toContain('/activate?token=')
      expect(prisma.inviteToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'new@test.com',
          role: 'INTERNAL_ALKOSTO',
          createdBy: 'user-1',
        }),
      })
    })

    it('should throw ConflictException if user already exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'existing@test.com' })

      await expect(
        service.createInvite('existing@test.com', 'ADMIN' as any, 'user-1'),
      ).rejects.toThrow(ConflictException)
    })

    it('should throw ConflictException if pending invite exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null)
      prisma.inviteToken.findFirst.mockResolvedValue({ id: 'inv-1' })

      await expect(
        service.createInvite('new@test.com', 'ADMIN' as any, 'user-1'),
      ).rejects.toThrow(ConflictException)
    })
  })

  describe('getInviteByToken', () => {
    it('should return invite info for valid token', async () => {
      prisma.inviteToken.findUnique.mockResolvedValue({
        email: 'new@test.com',
        role: 'INTERNAL_ALKOSTO',
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null,
      })

      const result = await service.getInviteByToken('valid-token')
      expect(result.email).toBe('new@test.com')
      expect(result.role).toBe('INTERNAL_ALKOSTO')
    })

    it('should throw NotFoundException if token not found', async () => {
      prisma.inviteToken.findUnique.mockResolvedValue(null)

      await expect(service.getInviteByToken('bad-token')).rejects.toThrow(NotFoundException)
    })

    it('should throw BadRequestException if token already used', async () => {
      prisma.inviteToken.findUnique.mockResolvedValue({
        email: 'new@test.com',
        role: 'INTERNAL_ALKOSTO',
        expiresAt: new Date(Date.now() + 60000),
        usedAt: new Date(),
      })

      await expect(service.getInviteByToken('used-token')).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException if token expired', async () => {
      prisma.inviteToken.findUnique.mockResolvedValue({
        email: 'new@test.com',
        role: 'INTERNAL_ALKOSTO',
        expiresAt: new Date(Date.now() - 60000),
        usedAt: null,
      })

      await expect(service.getInviteByToken('expired-token')).rejects.toThrow(BadRequestException)
    })
  })

  describe('activateInvite', () => {
    const validInvite = {
      id: 'inv-1',
      email: 'new@test.com',
      role: 'INTERNAL_ALKOSTO',
      token: 'valid-token',
      expiresAt: new Date(Date.now() + 60000),
      usedAt: null,
      createdBy: 'user-1',
    }

    it('should create user and mark token as used', async () => {
      prisma.inviteToken.findUnique.mockResolvedValue(validInvite)
      prisma.user.findUnique.mockResolvedValue(null)
      prisma.user.create.mockResolvedValue({
        id: 'new-user-1',
        email: 'new@test.com',
        role: 'INTERNAL_ALKOSTO',
      })
      prisma.inviteToken.update.mockResolvedValue({})

      const result = await service.activateInvite('valid-token', 'password123')

      expect(result.email).toBe('new@test.com')
      expect(result.role).toBe('INTERNAL_ALKOSTO')
      expect(authService.hashPassword).toHaveBeenCalledWith('password123')
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'new@test.com',
          passwordHash: 'salt:hash',
          role: 'INTERNAL_ALKOSTO',
          isActive: true,
        }),
      })
      expect(prisma.inviteToken.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { usedAt: expect.any(Date) },
      })
    })

    it('should throw NotFoundException if token not found', async () => {
      prisma.inviteToken.findUnique.mockResolvedValue(null)

      await expect(service.activateInvite('bad', 'password123')).rejects.toThrow(NotFoundException)
    })

    it('should throw BadRequestException if token already used', async () => {
      prisma.inviteToken.findUnique.mockResolvedValue({ ...validInvite, usedAt: new Date() })

      await expect(service.activateInvite('used', 'password123')).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException if token expired', async () => {
      prisma.inviteToken.findUnique.mockResolvedValue({
        ...validInvite,
        expiresAt: new Date(Date.now() - 60000),
      })

      await expect(service.activateInvite('expired', 'password123')).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException if password too short', async () => {
      prisma.inviteToken.findUnique.mockResolvedValue(validInvite)

      await expect(service.activateInvite('valid-token', 'short')).rejects.toThrow(BadRequestException)
    })

    it('should throw ConflictException if user already exists at activation time', async () => {
      prisma.inviteToken.findUnique.mockResolvedValue(validInvite)
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' })

      await expect(service.activateInvite('valid-token', 'password123')).rejects.toThrow(ConflictException)
    })
  })
})

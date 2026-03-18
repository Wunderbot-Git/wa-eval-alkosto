import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuthService } from '../auth/auth.service'
import { randomBytes } from 'crypto'
import { Role } from '@eval/shared'

@Injectable()
export class InvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async createInvite(email: string, role: Role, createdBy: string) {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      throw new ConflictException('Ya existe un usuario con este correo')
    }

    // Check if there's already a pending invite for this email
    const existingInvite = await this.prisma.inviteToken.findFirst({
      where: {
        email,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    })
    if (existingInvite) {
      throw new ConflictException('Ya existe una invitación pendiente para este correo')
    }

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours

    const invite = await this.prisma.inviteToken.create({
      data: {
        email,
        role,
        token,
        expiresAt,
        createdBy,
      },
    })

    const baseUrl = process.env.APP_URL || 'http://localhost:3000'
    const inviteLink = `${baseUrl}/activate?token=${token}`

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      token: invite.token,
      expiresAt: invite.expiresAt,
      inviteLink,
    }
  }

  async getInviteByToken(token: string) {
    const invite = await this.prisma.inviteToken.findUnique({ where: { token } })
    if (!invite) {
      throw new NotFoundException('Invitación no encontrada')
    }
    if (invite.usedAt) {
      throw new BadRequestException('Esta invitación ya fue utilizada')
    }
    if (invite.expiresAt < new Date()) {
      throw new BadRequestException('Esta invitación ha expirado')
    }

    return {
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
    }
  }

  async activateInvite(token: string, password: string) {
    const invite = await this.prisma.inviteToken.findUnique({ where: { token } })
    if (!invite) {
      throw new NotFoundException('Invitación no encontrada')
    }
    if (invite.usedAt) {
      throw new BadRequestException('Esta invitación ya fue utilizada')
    }
    if (invite.expiresAt < new Date()) {
      throw new BadRequestException('Esta invitación ha expirado')
    }

    if (password.length < 8) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres')
    }

    // Check if user already exists (edge case: created between invite and activation)
    const existingUser = await this.prisma.user.findUnique({ where: { email: invite.email } })
    if (existingUser) {
      throw new ConflictException('Ya existe un usuario con este correo')
    }

    const passwordHash = this.authService.hashPassword(password)

    const user = await this.prisma.user.create({
      data: {
        email: invite.email,
        passwordHash,
        role: invite.role as any,
        isActive: true,
      },
    })

    await this.prisma.inviteToken.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    })

    return {
      id: user.id,
      email: user.email,
      role: user.role,
    }
  }
}

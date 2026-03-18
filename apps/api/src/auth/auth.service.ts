import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private get sessionMaxAgeMs(): number {
    const hours = parseInt(process.env.SESSION_MAX_AGE_HOURS || '24', 10)
    return hours * 60 * 60 * 1000
  }

  hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex')
    const hash = scryptSync(password, salt, 64).toString('hex')
    return `${salt}:${hash}`
  }

  verifyPassword(password: string, stored: string): boolean {
    const [salt, hash] = stored.split(':')
    if (!salt || !hash) return false
    const hashBuffer = Buffer.from(hash, 'hex')
    const suppliedBuffer = scryptSync(password, salt, 64)
    return timingSafeEqual(hashBuffer, suppliedBuffer)
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas')
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Cuenta desactivada')
    }
    if (!this.verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Credenciales inválidas')
    }

    const expiresAt = new Date(Date.now() + this.sessionMaxAgeMs)
    const session = await this.prisma.session.create({
      data: { userId: user.id, expiresAt },
    })

    return {
      sessionId: session.id,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    }
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.delete({ where: { id: sessionId } }).catch(() => {
      // Session may already be deleted, that's fine
    })
  }

  async validateSession(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    })
    if (!session) return null
    if (session.expiresAt < new Date()) {
      await this.prisma.session.delete({ where: { id: sessionId } }).catch(() => {})
      return null
    }
    if (!session.user.isActive) return null

    return {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
    }
  }
}

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuthService } from '../auth/auth.service'
import { randomBytes } from 'crypto'
import { Role } from '@eval/shared'

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async listUsers() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return users
  }

  async deactivateUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } })
    if (!user) {
      throw new NotFoundException('Usuario no encontrado')
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
      },
    })

    // Delete all active sessions for the deactivated user
    await this.prisma.session.deleteMany({ where: { userId: id } })

    return updated
  }

  async changeRole(id: string, role: Role) {
    const user = await this.prisma.user.findUnique({ where: { id } })
    if (!user) {
      throw new NotFoundException('Usuario no encontrado')
    }

    if (!Object.values(Role).includes(role)) {
      throw new BadRequestException('Rol inválido')
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { role: role as any },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
      },
    })

    return updated
  }

  async resetPassword(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } })
    if (!user) {
      throw new NotFoundException('Usuario no encontrado')
    }

    const tempPassword = randomBytes(12).toString('hex')
    const passwordHash = this.authService.hashPassword(tempPassword)

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    })

    // Delete all active sessions so user must re-login
    await this.prisma.session.deleteMany({ where: { userId: id } })

    return { tempPassword }
  }
}

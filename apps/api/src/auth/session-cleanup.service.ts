import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class SessionCleanupService {
  private readonly logger = new Logger(SessionCleanupService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Delete all sessions that have expired.
   * Runs daily at 2 AM to avoid peak hours.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupExpiredSessions() {
    const now = new Date()

    const result = await this.prisma.session.deleteMany({
      where: {
        expiresAt: { lte: now },
      },
    })

    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} expired sessions`)
    } else {
      this.logger.log('No expired sessions to clean up')
    }

    return { deleted: result.count }
  }
}

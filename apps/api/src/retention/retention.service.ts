import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Set expiration to createdAt + 3 months for a run
   */
  async setExpiration(runId: string) {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      select: { createdAt: true },
    })
    if (!run) return

    const expiresAt = new Date(run.createdAt)
    expiresAt.setMonth(expiresAt.getMonth() + 3)

    await this.prisma.run.update({
      where: { id: runId },
      data: { expiresAt },
    })

    return { runId, expiresAt }
  }

  /**
   * Clean up expired runs and all related data.
   * Cascading deletes handle: conversations, messages, evaluations,
   * findings, patterns, snapshots, share records, export jobs.
   */
  async cleanupExpired() {
    const now = new Date()

    const expiredRuns = await this.prisma.run.findMany({
      where: {
        expiresAt: { not: null, lte: now },
      },
      select: { id: true, name: true },
    })

    if (expiredRuns.length === 0) {
      this.logger.log('No expired runs to clean up')
      return { deleted: 0 }
    }

    const runIds = expiredRuns.map((r) => r.id)

    // Delete in order to respect foreign keys that may not cascade
    // Share records for conversations in these runs
    await this.prisma.shareRecord.deleteMany({
      where: { runId: { in: runIds } },
    })

    // Share records for conversations
    const convIds = await this.prisma.conversation.findMany({
      where: { runId: { in: runIds } },
      select: { id: true },
    })
    const conversationIds = convIds.map((c) => c.id)

    if (conversationIds.length > 0) {
      await this.prisma.shareRecord.deleteMany({
        where: { conversationId: { in: conversationIds } },
      })
    }

    // Export jobs
    await this.prisma.exportJob.deleteMany({
      where: { runId: { in: runIds } },
    })

    // Delete runs (cascades to conversations -> messages, evaluations -> findings/patterns, snapshots)
    await this.prisma.run.deleteMany({
      where: { id: { in: runIds } },
    })

    this.logger.log(`Cleaned up ${expiredRuns.length} expired runs: ${expiredRuns.map((r) => r.name).join(', ')}`)

    return { deleted: expiredRuns.length, runIds }
  }

  /**
   * Cron job: run cleanup daily at midnight
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    this.logger.log('Running daily retention cleanup')
    await this.cleanupExpired()
  }

  /**
   * Get retention stats for admin dashboard
   */
  async getStats() {
    const now = new Date()
    const thirtyDaysFromNow = new Date(now)
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

    const [totalRuns, expiringSoon, expired] = await Promise.all([
      this.prisma.run.count(),
      this.prisma.run.count({
        where: {
          expiresAt: {
            not: null,
            gt: now,
            lte: thirtyDaysFromNow,
          },
        },
      }),
      this.prisma.run.count({
        where: {
          expiresAt: {
            not: null,
            lte: now,
          },
        },
      }),
    ])

    const runsExpiringSoon = await this.prisma.run.findMany({
      where: {
        expiresAt: {
          not: null,
          gt: now,
          lte: thirtyDaysFromNow,
        },
      },
      select: {
        id: true,
        name: true,
        expiresAt: true,
        totalConversations: true,
      },
      orderBy: { expiresAt: 'asc' },
      take: 20,
    })

    return {
      totalRuns,
      expiringSoonCount: expiringSoon,
      expiredCount: expired,
      runsExpiringSoon,
    }
  }
}

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { EvaluationQueueService } from '../queue/evaluation-queue.service'
import { resolveGeminiMode } from '../judges/gemini/gemini-client.service'

@Injectable()
export class PipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluationQueue: EvaluationQueueService,
  ) {}

  async launchRun(runId: string) {
    if (process.env.NODE_ENV !== 'test' && resolveGeminiMode() === 'fake' && process.env.EVALUATION_MODE !== 'demo') {
      throw new BadRequestException('El evaluador anterior requiere Gemini (API key o Vertex AI); no se generan evaluaciones ficticias.')
    }
    const run = await this.prisma.run.findUnique({ where: { id: runId } })
    if (!run) {
      throw new NotFoundException('Run not found')
    }
    if (run.status !== 'PENDING') {
      throw new BadRequestException('Run is not in PENDING status')
    }

    // Update run status to PROCESSING
    await this.prisma.run.update({
      where: { id: runId },
      data: { status: 'PROCESSING' },
    })

    // Get all PENDING conversations for this run
    const conversations = await this.prisma.conversation.findMany({
      where: { runId, status: 'PENDING' },
      select: { id: true },
    })

    const conversationIds = conversations.map((c) => c.id)

    if (conversationIds.length > 0) {
      await this.evaluationQueue.addBatchJobs(conversationIds, runId)
    }

    return {
      runId,
      status: 'PROCESSING',
      queuedConversations: conversationIds.length,
    }
  }

  async cancelRun(runId: string) {
    const run = await this.prisma.run.findUnique({ where: { id: runId } })
    if (!run) {
      throw new NotFoundException('Run not found')
    }
    if (run.status !== 'PROCESSING' && run.status !== 'PENDING') {
      throw new BadRequestException('Run can only be cancelled when PROCESSING or PENDING')
    }

    // Mark remaining PENDING conversations as NOT_EVALUABLE
    const result = await this.prisma.conversation.updateMany({
      where: { runId, status: 'PENDING' },
      data: {
        status: 'NOT_EVALUABLE',
        notEvaluableReason: 'Run cancelled',
      },
    })

    // Update run status to CANCELLED
    await this.prisma.run.update({
      where: { id: runId },
      data: { status: 'CANCELLED' },
    })

    return {
      runId,
      status: 'CANCELLED',
      cancelledConversations: result.count,
    }
  }

  async getRunStatus(runId: string) {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      select: {
        status: true,
        totalConversations: true,
        evaluatedCount: true,
        notEvaluableCount: true,
        failedCount: true,
      },
    })
    if (!run) {
      throw new NotFoundException('Run not found')
    }
    return run
  }
}

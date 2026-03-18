import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Optional } from '@nestjs/common'
import { Worker, Job } from 'bullmq'
import { PrismaService } from '../prisma/prisma.service'
import { CatalogService } from '../catalog/catalog.service'
import { IntegrityEvaluationService } from '../evaluation/integrity-evaluation.service'
import { QualityEvaluationService } from '../evaluation/quality-evaluation.service'
import { PatternEvaluationService } from '../evaluation/pattern-evaluation.service'
import { ConsolidatorService } from '../evaluation/consolidator.service'
import { RetentionService } from '../retention/retention.service'
import { loadEnv } from '../config/env'

export interface EvaluationJobData {
  conversationId: string
  runId: string
}

@Injectable()
export class EvaluationWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker | null = null
  private readonly logger = new Logger(EvaluationWorker.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogService: CatalogService,
    private readonly integrityEvaluation: IntegrityEvaluationService,
    private readonly qualityEvaluation: QualityEvaluationService,
    private readonly patternEvaluation: PatternEvaluationService,
    private readonly consolidator: ConsolidatorService,
    @Optional() private readonly retentionService?: RetentionService,
  ) {}

  onModuleInit() {
    const env = loadEnv()
    const url = new URL(env.REDIS_URL)
    const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '5', 10)

    this.worker = new Worker(
      'evaluation',
      async (job: Job<EvaluationJobData>) => {
        await this.processJob(job.data)
      },
      {
        connection: {
          host: url.hostname,
          port: parseInt(url.port || '6379', 10),
        },
        concurrency,
      },
    )

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`)
    })
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close()
    }
  }

  async processJob(data: EvaluationJobData) {
    const { conversationId, runId } = data

    // 1. Load conversation with messages
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { orderIndex: 'asc' } } },
    })

    if (!conversation) {
      this.logger.warn(`Conversation ${conversationId} not found`)
      return
    }

    // Update status to EVALUATING
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { status: 'EVALUATING' },
    })

    try {
      // 2. Resolve catalog by conversation date
      const convDate = new Date(conversation.conversationDate)
      const catalogDate = new Date(convDate.getFullYear(), convDate.getMonth(), convDate.getDate())
      const catalog = await this.catalogService.findByDate(catalogDate)

      if (!catalog) {
        // 3. No catalog -> mark NOT_EVALUABLE
        const dateStr = catalogDate.toISOString().split('T')[0]
        await this.prisma.conversation.update({
          where: { id: conversationId },
          data: {
            status: 'NOT_EVALUABLE',
            notEvaluableReason: `No catalog for date ${dateStr}`,
          },
        })
        await this.updateRunCounts(runId)
        return
      }

      // 4. Load catalog products for integrity judge
      const catalogProducts = await this.prisma.catalogProduct.findMany({
        where: { catalogId: catalog.id },
      })

      // 5. Create evaluation record (will be updated by consolidator)
      const evaluation = await this.prisma.evaluation.create({
        data: {
          conversationId,
          module: 'CONSOLIDATOR',
        },
      })

      // 6. Run IntegrityEvaluationService
      const integrityResult = await this.integrityEvaluation.evaluate(
        evaluation.id,
        conversation.messages as any,
        catalogProducts as any,
      )

      // 7. Run QualityEvaluationService
      const qualityResult = await this.qualityEvaluation.evaluate(
        conversation.messages as any,
      )

      // 8. Run PatternEvaluationService
      const patternResult = await this.patternEvaluation.evaluate(
        evaluation.id,
        conversation.messages as any,
      )

      // 9. Run ConsolidatorService (updates Evaluation + creates Snapshot)
      await this.consolidator.consolidate({
        conversationId,
        evaluationId: evaluation.id,
        integrity: integrityResult,
        quality: qualityResult,
        patterns: patternResult,
      })

      // Mark conversation as EVALUATED
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { status: 'EVALUATED' },
      })
    } catch (error) {
      this.logger.error(`Error processing conversation ${conversationId}: ${error}`)
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { status: 'FAILED' },
      })
    }

    // 10. Update run aggregate counts and check completion
    await this.updateRunCounts(runId)
  }

  private async updateRunCounts(runId: string) {
    const counts = await this.prisma.conversation.groupBy({
      by: ['status'],
      where: { runId },
      _count: { status: true },
    })

    const evaluated = counts.find((c) => c.status === 'EVALUATED')?._count.status ?? 0
    const notEvaluable = counts.find((c) => c.status === 'NOT_EVALUABLE')?._count.status ?? 0
    const failed = counts.find((c) => c.status === 'FAILED')?._count.status ?? 0
    const pending = counts.find((c) => c.status === 'PENDING')?._count.status ?? 0
    const evaluating = counts.find((c) => c.status === 'EVALUATING')?._count.status ?? 0

    const isComplete = pending === 0 && evaluating === 0

    // Calculate aggregate score from evaluated conversations
    let aggregateScore: number | null = null
    if (evaluated > 0) {
      const scoreResult = await this.prisma.evaluation.aggregate({
        where: {
          conversation: { runId },
          score: { not: null },
        },
        _avg: { score: true },
      })
      aggregateScore = scoreResult._avg.score ?? null
    }

    const status = isComplete
      ? failed > 0
        ? 'COMPLETED_WITH_ERRORS'
        : 'COMPLETED'
      : 'PROCESSING'

    await this.prisma.run.update({
      where: { id: runId },
      data: {
        evaluatedCount: evaluated,
        notEvaluableCount: notEvaluable,
        failedCount: failed,
        aggregateScore,
        status: status as any,
      },
    })

    // Set expiration when run completes
    if (isComplete && this.retentionService) {
      try {
        await this.retentionService.setExpiration(runId)
      } catch (err) {
        this.logger.error(`Failed to set expiration for run ${runId}: ${err}`)
      }
    }
  }
}

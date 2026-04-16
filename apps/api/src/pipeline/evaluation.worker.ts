import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Optional } from '@nestjs/common'
import { Worker, Job } from 'bullmq'
import { PrismaService } from '../prisma/prisma.service'
import { CatalogService } from '../catalog/catalog.service'
import { IntegrityEvaluationService } from '../evaluation/integrity-evaluation.service'
import { QualityEvaluationService } from '../evaluation/quality-evaluation.service'
import { PatternEvaluationService } from '../evaluation/pattern-evaluation.service'
import { ConsolidatorService } from '../evaluation/consolidator.service'
import { ExtractionService } from '../evaluation/extraction.service'
import { RecommendationEvaluationService } from '../evaluation/recommendation-evaluation.service'
import { RetentionService } from '../retention/retention.service'
import { loadEnv } from '../config/env'
import type { ProductSpecSheet, CatalogProductLike } from '../judges/judge.interfaces'

export interface EvaluationJobData {
  conversationId: string
  runId: string
}

const MAX_CANDIDATE_ALTERNATIVES = 10

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
    private readonly extractionService: ExtractionService,
    private readonly recommendationEvaluation: RecommendationEvaluationService,
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
        lockDuration: 120000,
        stalledInterval: 60000,
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
      // 2. Resolve catalog by conversation date (UTC to match @db.Date storage)
      const convDate = new Date(conversation.conversationDate)
      const catalogDate = new Date(Date.UTC(convDate.getUTCFullYear(), convDate.getUTCMonth(), convDate.getUTCDate()))
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

      // 4. Load catalog products for integrity judge — project only the fields
      // the judge prompt documents (externalId, title, prices, category, brand).
      // Do NOT return `rawData` — it's the full Alkosto source dump (~2-3KB per
      // product) and would 5-10x the integrity prompt tokens if it leaked.
      const catalogProducts = await this.prisma.catalogProduct.findMany({
        where: { catalogId: catalog.id },
        select: {
          externalId: true,
          title: true,
          listPrice: true,
          salePrice: true,
          category: true,
          brand: true,
        },
      })

      // 5. Create evaluation record (will be updated by consolidator).
      // Delete any prior evaluation for this conversation (e.g. from a failed
      // retry) so findings/patterns don't duplicate on re-attempt.
      await this.prisma.evaluation.deleteMany({ where: { conversationId } })
      const evaluation = await this.prisma.evaluation.create({
        data: {
          conversationId,
          module: 'CONSOLIDATOR',
        },
      })

      // 6. Extraction pre-pass — produces { mentionedExternalIds, statedNeeds }
      // from the transcript + slim catalog index. Cheap LLM call; result feeds
      // both the upgraded integrity judge and the new recommendation judge.
      const extraction = await this.extractionService.extract(
        conversation.messages as any,
        catalogProducts,
      )

      // 7. Enrich: fetch full rawData for the products the agent/customer
      // actually mentioned, then derive a small candidate-alternatives slice
      // (same category, comparable price) for the recommendation judge.
      const mentionedSpecs = await this.buildMentionedSpecs(
        catalog.id,
        extraction.mentionedExternalIds,
      )
      const candidateAlternatives = this.pickCandidateAlternatives(
        catalogProducts,
        mentionedSpecs,
        extraction.statedNeeds.budget_max,
      )

      // 8. Run the four content judges in parallel. None depend on each other;
      // only the consolidator (step 9) reads their outputs.
      const [integrityResult, qualityResult, patternResult, recommendationResult] =
        await Promise.all([
          this.integrityEvaluation.evaluate(
            evaluation.id,
            conversation.messages as any,
            catalogProducts,
            mentionedSpecs,
          ),
          this.qualityEvaluation.evaluate(conversation.messages as any),
          this.patternEvaluation.evaluate(
            evaluation.id,
            conversation.messages as any,
          ),
          this.recommendationEvaluation.evaluate(
            evaluation.id,
            conversation.messages as any,
            extraction.statedNeeds,
            mentionedSpecs,
            candidateAlternatives,
          ),
        ])

      // 9. Run ConsolidatorService (updates Evaluation + creates Snapshot)
      await this.consolidator.consolidate({
        conversationId,
        evaluationId: evaluation.id,
        integrity: integrityResult,
        quality: qualityResult,
        patterns: patternResult,
        recommendation: recommendationResult,
        statedNeeds: extraction.statedNeeds,
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

  /**
   * Pull full CatalogProduct rows for the mentioned external ids and project
   * them to ProductSpecSheet — preserving the structured rawData fields the
   * judges actually need (Tarjeta Grafica, Memoria RAM, etc.) while stripping
   * NaN / null / object junk that would just inflate the prompt.
   */
  private async buildMentionedSpecs(
    catalogId: string,
    externalIds: string[],
  ): Promise<ProductSpecSheet[]> {
    if (externalIds.length === 0) return []
    const rows = await this.catalogService.findProductsByExternalIds(catalogId, externalIds)
    return rows.map((p) => {
      const raw = (p.rawData ?? {}) as Record<string, unknown>
      const specs: Record<string, string | number | boolean | null> = {}
      for (const [k, v] of Object.entries(raw)) {
        if (v === null || v === undefined) continue
        if (typeof v === 'number') {
          if (Number.isFinite(v)) specs[k] = v
          continue
        }
        if (typeof v === 'string') {
          const trimmed = v.trim()
          if (trimmed.length === 0) continue
          if (trimmed.toLowerCase() === 'nan') continue
          specs[k] = trimmed
          continue
        }
        if (typeof v === 'boolean') {
          specs[k] = v
        }
      }
      return {
        externalId: p.externalId,
        title: p.title,
        listPrice: p.listPrice,
        salePrice: p.salePrice,
        availability: p.availability,
        category: p.category,
        brand: p.brand,
        specs,
      }
    })
  }

  /**
   * Pick up to MAX_CANDIDATE_ALTERNATIVES products from the slim catalog index
   * that share a category with at least one mentioned product and fall within
   * the customer's stated budget when present. Excludes the mentioned products
   * themselves so the recommendation judge only sees true alternatives.
   */
  private pickCandidateAlternatives(
    catalog: CatalogProductLike[],
    mentionedSpecs: ProductSpecSheet[],
    budgetMax: number | null | undefined,
  ): CatalogProductLike[] {
    if (mentionedSpecs.length === 0) return []
    const mentionedIds = new Set(mentionedSpecs.map((m) => m.externalId))
    const categories = new Set(
      mentionedSpecs.map((m) => m.category).filter((c): c is string => !!c),
    )
    if (categories.size === 0) return []

    const eligible = catalog.filter((p) => {
      if (mentionedIds.has(p.externalId)) return false
      if (!p.category || !categories.has(p.category)) return false
      if (typeof budgetMax === 'number' && budgetMax > 0) {
        const price = p.salePrice ?? p.listPrice
        if (typeof price === 'number' && price > budgetMax * 1.1) return false
      }
      return true
    })

    return eligible.slice(0, MAX_CANDIDATE_ALTERNATIVES)
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

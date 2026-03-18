import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mask central digits of phone numbers.
   * Pattern: +57XXXXXXXXXX -> +57XXX***XXXX (or similar)
   * Generalized: mask 3 digits starting from position 5 in any phone-like string
   */
  anonymizePhones(text: string): string {
    // Match phone patterns like +57XXXXXXXXXX or similar international formats
    return text.replace(
      /(\+?\d{1,3})(\d{3})(\d{3})(\d{4})/g,
      '$1$2***$4',
    )
  }

  /**
   * Recursively anonymize phone numbers in any value (string, object, array)
   */
  anonymizeValue(value: any): any {
    if (typeof value === 'string') {
      return this.anonymizePhones(value)
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.anonymizeValue(v))
    }
    if (value !== null && typeof value === 'object') {
      const result: any = {}
      for (const [k, v] of Object.entries(value)) {
        result[k] = this.anonymizeValue(v)
      }
      return result
    }
    return value
  }

  async createExport(runId: string, userId: string) {
    const run = await this.prisma.run.findUnique({ where: { id: runId } })
    if (!run) {
      throw new NotFoundException('Run not found')
    }

    // Create export job as PROCESSING
    const exportJob = await this.prisma.exportJob.create({
      data: {
        runId,
        status: 'PROCESSING',
        createdBy: userId,
      },
    })

    try {
      // Load full run data
      const conversations = await this.prisma.conversation.findMany({
        where: { runId },
        include: {
          messages: { orderBy: { orderIndex: 'asc' } },
          evaluation: {
            include: {
              findings: true,
              patterns: true,
            },
          },
          snapshot: true,
        },
      })

      const exportData = {
        exportedAt: new Date().toISOString(),
        run: {
          id: run.id,
          name: run.name,
          status: run.status,
          totalConversations: run.totalConversations,
          evaluatedCount: run.evaluatedCount,
          notEvaluableCount: run.notEvaluableCount,
          failedCount: run.failedCount,
          aggregateScore: run.aggregateScore,
          expiresAt: run.expiresAt,
          createdAt: run.createdAt,
        },
        conversations: conversations.map((conv) => ({
          id: conv.id,
          sessionId: conv.sessionId,
          conversationDate: conv.conversationDate,
          messageCount: conv.messageCount,
          status: conv.status,
          notEvaluableReason: conv.notEvaluableReason,
          messages: conv.messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
            orderIndex: msg.orderIndex,
          })),
          evaluation: conv.evaluation
            ? {
                module: conv.evaluation.module,
                score: conv.evaluation.score,
                label: conv.evaluation.label,
                integrityFindings: conv.evaluation.integrityFindings,
                qualitySubScores: conv.evaluation.qualitySubScores,
                patternClassifications: conv.evaluation.patternClassifications,
                consolidatorExplanation: conv.evaluation.consolidatorExplanation,
                promptVersions: conv.evaluation.promptVersions,
                findings: conv.evaluation.findings.map((f) => ({
                  type: f.type,
                  severity: f.severity,
                  description: f.description,
                  evidence: f.evidence,
                })),
                patterns: conv.evaluation.patterns.map((p) => ({
                  name: p.name,
                  isEmergent: p.isEmergent,
                  explanation: p.explanation,
                  evidence: p.evidence,
                })),
              }
            : null,
        })),
      }

      // Anonymize phone numbers throughout the export
      const anonymizedData = this.anonymizeValue(exportData)

      // Store as JSON string in filePath field
      const jsonString = JSON.stringify(anonymizedData, null, 2)

      await this.prisma.exportJob.update({
        where: { id: exportJob.id },
        data: {
          status: 'COMPLETED',
          filePath: jsonString,
          completedAt: new Date(),
        },
      })

      return {
        id: exportJob.id,
        status: 'COMPLETED',
        runId,
      }
    } catch (error) {
      await this.prisma.exportJob.update({
        where: { id: exportJob.id },
        data: {
          status: 'FAILED',
        },
      })
      throw error
    }
  }

  async getExportStatus(exportId: string) {
    const exportJob = await this.prisma.exportJob.findUnique({
      where: { id: exportId },
      select: {
        id: true,
        runId: true,
        status: true,
        createdAt: true,
        completedAt: true,
      },
    })
    if (!exportJob) {
      throw new NotFoundException('Export job not found')
    }
    return exportJob
  }

  async downloadExport(exportId: string) {
    const exportJob = await this.prisma.exportJob.findUnique({
      where: { id: exportId },
    })
    if (!exportJob) {
      throw new NotFoundException('Export job not found')
    }
    if (exportJob.status !== 'COMPLETED' || !exportJob.filePath) {
      throw new NotFoundException('Export not ready for download')
    }

    return {
      filename: `export-${exportJob.runId}.json`,
      data: exportJob.filePath,
    }
  }
}

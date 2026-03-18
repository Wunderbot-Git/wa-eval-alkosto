import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ExportService } from './export.service'
import { NotFoundException } from '@nestjs/common'

function makePrismaStub() {
  return {
    run: {
      findUnique: vi.fn(),
    },
    exportJob: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    conversation: {
      findMany: vi.fn(),
    },
  }
}

describe('ExportService', () => {
  let service: ExportService
  let prisma: ReturnType<typeof makePrismaStub>

  beforeEach(() => {
    prisma = makePrismaStub()
    service = new ExportService(prisma as any)
  })

  describe('anonymizePhones', () => {
    it('should mask central digits of Colombian phone numbers', () => {
      const result = service.anonymizePhones('+573001234567')
      expect(result).toBe('+57300***4567')
    })

    it('should mask phone numbers in a text', () => {
      const result = service.anonymizePhones('Mi numero es +573101234567 y otro +573201239876')
      expect(result).toBe('Mi numero es +57310***4567 y otro +57320***9876')
    })

    it('should not modify text without phone numbers', () => {
      const result = service.anonymizePhones('Hello world')
      expect(result).toBe('Hello world')
    })

    it('should handle short numbers without modification', () => {
      const result = service.anonymizePhones('Call 123')
      expect(result).toBe('Call 123')
    })
  })

  describe('anonymizeValue', () => {
    it('should anonymize phones in nested objects', () => {
      const result = service.anonymizeValue({
        name: 'Test',
        phone: '+573001234567',
        nested: { phone: '+573009876543' },
      })
      expect(result.phone).toBe('+57300***4567')
      expect(result.nested.phone).toBe('+57300***6543')
    })

    it('should anonymize phones in arrays', () => {
      const result = service.anonymizeValue(['+573001234567', 'hello'])
      expect(result[0]).toBe('+57300***4567')
      expect(result[1]).toBe('hello')
    })

    it('should pass through non-string non-object values', () => {
      expect(service.anonymizeValue(42)).toBe(42)
      expect(service.anonymizeValue(null)).toBe(null)
      expect(service.anonymizeValue(true)).toBe(true)
    })
  })

  describe('createExport', () => {
    it('should create export with anonymized data', async () => {
      prisma.run.findUnique.mockResolvedValue({
        id: 'run-1',
        name: 'RUN-20260317-abc123',
        status: 'COMPLETED',
        totalConversations: 1,
        evaluatedCount: 1,
        notEvaluableCount: 0,
        failedCount: 0,
        aggregateScore: 0.85,
        expiresAt: null,
        createdAt: new Date('2026-03-17'),
      })
      prisma.exportJob.create.mockResolvedValue({ id: 'export-1' })
      prisma.exportJob.update.mockResolvedValue({})
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: 'conv-1',
          sessionId: '+573001234567',
          conversationDate: new Date(),
          messageCount: 2,
          status: 'EVALUATED',
          notEvaluableReason: null,
          messages: [
            { role: 'CUSTOMER', content: 'Hola desde +573001234567', orderIndex: 0 },
            { role: 'AGENT', content: 'Bienvenido', orderIndex: 1 },
          ],
          evaluation: {
            module: 'CONSOLIDATOR',
            score: 0.85,
            label: 'APROBADA',
            integrityFindings: null,
            qualitySubScores: null,
            patternClassifications: null,
            consolidatorExplanation: 'Good',
            promptVersions: null,
            findings: [],
            patterns: [],
          },
          snapshot: null,
        },
      ])

      const result = await service.createExport('run-1', 'user-1')
      expect(result.status).toBe('COMPLETED')
      expect(result.id).toBe('export-1')

      // Verify anonymization was applied in the stored data
      const updateCall = prisma.exportJob.update.mock.calls[0][0]
      const storedData = JSON.parse(updateCall.data.filePath)
      expect(storedData.conversations[0].messages[0].content).toBe('Hola desde +57300***4567')
      expect(storedData.conversations[0].sessionId).toBe('+57300***4567')
    })

    it('should throw NotFoundException if run not found', async () => {
      prisma.run.findUnique.mockResolvedValue(null)
      await expect(service.createExport('nonexistent', 'user-1')).rejects.toThrow(NotFoundException)
    })

    it('should mark export as FAILED on error', async () => {
      prisma.run.findUnique.mockResolvedValue({ id: 'run-1' })
      prisma.exportJob.create.mockResolvedValue({ id: 'export-1' })
      prisma.conversation.findMany.mockRejectedValue(new Error('DB error'))
      prisma.exportJob.update.mockResolvedValue({})

      await expect(service.createExport('run-1', 'user-1')).rejects.toThrow('DB error')
      expect(prisma.exportJob.update).toHaveBeenCalledWith({
        where: { id: 'export-1' },
        data: { status: 'FAILED' },
      })
    })
  })

  describe('getExportStatus', () => {
    it('should return export status', async () => {
      prisma.exportJob.findUnique.mockResolvedValue({
        id: 'export-1',
        runId: 'run-1',
        status: 'COMPLETED',
        createdAt: new Date(),
        completedAt: new Date(),
      })

      const result = await service.getExportStatus('export-1')
      expect(result.status).toBe('COMPLETED')
    })

    it('should throw NotFoundException if export not found', async () => {
      prisma.exportJob.findUnique.mockResolvedValue(null)
      await expect(service.getExportStatus('nonexistent')).rejects.toThrow(NotFoundException)
    })
  })

  describe('downloadExport', () => {
    it('should return file data for completed export', async () => {
      prisma.exportJob.findUnique.mockResolvedValue({
        id: 'export-1',
        runId: 'run-1',
        status: 'COMPLETED',
        filePath: '{"test": true}',
      })

      const result = await service.downloadExport('export-1')
      expect(result.filename).toBe('export-run-1.json')
      expect(result.data).toBe('{"test": true}')
    })

    it('should throw NotFoundException if export not found', async () => {
      prisma.exportJob.findUnique.mockResolvedValue(null)
      await expect(service.downloadExport('nonexistent')).rejects.toThrow(NotFoundException)
    })

    it('should throw NotFoundException if export not completed', async () => {
      prisma.exportJob.findUnique.mockResolvedValue({
        id: 'export-1',
        status: 'PROCESSING',
        filePath: null,
      })
      await expect(service.downloadExport('export-1')).rejects.toThrow(NotFoundException)
    })
  })
})

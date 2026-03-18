import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('bullmq', () => {
  const addMock = vi.fn().mockResolvedValue({ id: 'job-1' })
  const addBulkMock = vi.fn().mockResolvedValue([{ id: 'job-1' }, { id: 'job-2' }])
  return {
    Queue: vi.fn().mockImplementation(() => ({
      add: addMock,
      addBulk: addBulkMock,
    })),
  }
})

vi.mock('../config/env', () => ({
  loadEnv: () => ({
    REDIS_URL: 'redis://localhost:6379',
  }),
}))

import { EvaluationQueueService } from './evaluation-queue.service'

describe('EvaluationQueueService', () => {
  let service: EvaluationQueueService

  beforeEach(() => {
    service = new EvaluationQueueService()
  })

  describe('addConversationJob', () => {
    it('should add a single job to the queue', async () => {
      const result = await service.addConversationJob('conv-1', 'run-1')
      const queue = service.getQueue()
      expect(queue.add).toHaveBeenCalledWith('evaluate-conversation', {
        conversationId: 'conv-1',
        runId: 'run-1',
      })
      expect(result).toEqual({ id: 'job-1' })
    })
  })

  describe('addBatchJobs', () => {
    it('should add multiple jobs to the queue', async () => {
      const conversationIds = ['conv-1', 'conv-2']
      const result = await service.addBatchJobs(conversationIds, 'run-1')
      const queue = service.getQueue()
      expect(queue.addBulk).toHaveBeenCalledWith([
        { name: 'evaluate-conversation', data: { conversationId: 'conv-1', runId: 'run-1' } },
        { name: 'evaluate-conversation', data: { conversationId: 'conv-2', runId: 'run-1' } },
      ])
      expect(result).toHaveLength(2)
    })

    it('should handle empty conversation list', async () => {
      await service.addBatchJobs([], 'run-1')
      const queue = service.getQueue()
      expect(queue.addBulk).toHaveBeenCalledWith([])
    })
  })
})

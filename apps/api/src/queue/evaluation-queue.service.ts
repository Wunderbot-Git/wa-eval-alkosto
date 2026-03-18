import { Injectable } from '@nestjs/common'
import { Queue } from 'bullmq'
import { loadEnv } from '../config/env'

@Injectable()
export class EvaluationQueueService {
  private readonly queue: Queue

  constructor() {
    const env = loadEnv()
    const url = new URL(env.REDIS_URL)
    this.queue = new Queue('evaluation', {
      connection: {
        host: url.hostname,
        port: parseInt(url.port || '6379', 10),
      },
    })
  }

  async addConversationJob(conversationId: string, runId: string) {
    return this.queue.add('evaluate-conversation', { conversationId, runId })
  }

  async addBatchJobs(conversationIds: string[], runId: string) {
    const jobs = conversationIds.map((conversationId) => ({
      name: 'evaluate-conversation',
      data: { conversationId, runId },
    }))
    return this.queue.addBulk(jobs)
  }

  /** Exposed for testing */
  getQueue(): Queue {
    return this.queue
  }
}

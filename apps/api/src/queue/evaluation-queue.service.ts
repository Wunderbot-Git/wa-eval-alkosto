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

  /**
   * Remove all jobs (waiting, active, completed, failed, delayed) from the queue.
   * Used to recover from orphaned-job backlogs after aborted runs.
   */
  async drain(): Promise<{ removed: number }> {
    const counts = await this.queue.getJobCounts(
      'wait',
      'active',
      'delayed',
      'failed',
      'completed',
    )
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    await this.queue.obliterate({ force: true })
    return { removed: total }
  }
}

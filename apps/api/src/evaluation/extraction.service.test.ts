import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ExtractionService } from './extraction.service'

function makeJudgeStub() {
  return {
    evaluate: vi.fn().mockResolvedValue({
      mentionedExternalIds: ['123'],
      statedNeeds: {
        use_case: 'gaming',
        budget_min: null,
        budget_max: 5000000,
        must_have_specs: ['16GB RAM'],
        deal_breakers: [],
      },
    }),
  }
}

describe('ExtractionService', () => {
  let service: ExtractionService
  let judge: ReturnType<typeof makeJudgeStub>

  beforeEach(() => {
    judge = makeJudgeStub()
    service = new ExtractionService(judge as any)
  })

  it('forwards transcript and slim catalog to the judge and returns the result', async () => {
    const transcript = [{ role: 'CUSTOMER', content: 'gaming?', orderIndex: 0 }] as any
    const catalog = [{ externalId: '123', title: 'TUF A15' }] as any

    const result = await service.extract(transcript, catalog)

    expect(judge.evaluate).toHaveBeenCalledWith(transcript, catalog)
    expect(result.mentionedExternalIds).toEqual(['123'])
    expect(result.statedNeeds.use_case).toBe('gaming')
  })
})

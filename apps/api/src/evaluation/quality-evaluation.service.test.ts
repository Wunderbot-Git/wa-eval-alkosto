import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QualityEvaluationService } from './quality-evaluation.service'

function makeJudgeStub() {
  return {
    evaluate: vi.fn().mockResolvedValue({
      score: 7.5,
      subScores: {
        understanding: 7.0,
        recommendation: 8.0,
        fluency: 7.5,
      },
      findings: [
        {
          description: 'Good response quality',
          messageRef: 1,
        },
      ],
    }),
  }
}

const sampleMessages = [
  { role: 'CUSTOMER', content: 'Hello', orderIndex: 0 },
  { role: 'AGENT', content: 'Hi there!', orderIndex: 1 },
]

describe('QualityEvaluationService', () => {
  let service: QualityEvaluationService
  let judge: ReturnType<typeof makeJudgeStub>

  beforeEach(() => {
    judge = makeJudgeStub()
    service = new QualityEvaluationService(judge)
  })

  it('should call the quality judge with transcript', async () => {
    await service.evaluate(sampleMessages)

    expect(judge.evaluate).toHaveBeenCalledWith(sampleMessages)
  })

  it('should return QualityJudgeResult with score and sub-scores', async () => {
    const result = await service.evaluate(sampleMessages)

    expect(result.score).toBe(7.5)
    expect(result.subScores).toEqual({
      understanding: 7.0,
      recommendation: 8.0,
      fluency: 7.5,
    })
  })

  it('should return findings in the result', async () => {
    const result = await service.evaluate(sampleMessages)

    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].description).toBe('Good response quality')
    expect(result.findings[0].messageRef).toBe(1)
  })

  it('should handle result with no findings', async () => {
    judge.evaluate.mockResolvedValue({
      score: 9.0,
      subScores: {
        understanding: 9.0,
        recommendation: 9.0,
        fluency: 9.0,
      },
      findings: [],
    })

    const result = await service.evaluate(sampleMessages)

    expect(result.score).toBe(9.0)
    expect(result.findings).toHaveLength(0)
  })
})

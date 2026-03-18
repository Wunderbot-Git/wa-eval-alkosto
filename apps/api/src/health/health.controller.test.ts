import { describe, it, expect } from 'vitest'
import { Test } from '@nestjs/testing'
import { HealthController } from './health.controller'

describe('HealthController', () => {
  it('returns ok status', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile()

    const controller = moduleRef.get(HealthController)
    const result = controller.getHealth()

    expect(result.status).toBe('ok')
    expect(typeof result.timestamp).toBe('string')
  })
})

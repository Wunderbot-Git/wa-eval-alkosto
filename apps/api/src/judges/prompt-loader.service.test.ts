import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PromptLoaderService } from './prompt-loader.service'
import { createHash } from 'crypto'

// Mock fs to avoid reading actual files in tests
vi.mock('fs', () => ({
  readFileSync: vi.fn((path: string) => {
    const files: Record<string, string> = {
      'integrity/system.md': 'You are an integrity judge. Date: {{conversation_date}}',
      'integrity/user.md': 'Evaluate: {{transcript}}',
      'quality/system.md': 'You are a quality judge.',
      'quality/user.md': 'Evaluate quality: {{transcript}}',
      'patterns/system.md': 'You are a pattern classifier.',
      'patterns/user.md': 'Classify: {{transcript}}',
      'consolidator/system.md': 'You are a consolidator.',
      'consolidator/user.md': 'Consolidate: {{integrity_results}}',
      'extraction/system.md': 'You extract mentions and needs.',
      'extraction/user.md': 'Extract from: {{transcript}}',
      'recommendation/system.md': 'You judge recommendation fit.',
      'recommendation/user.md': 'Judge: {{transcript}}',
    }

    for (const [key, content] of Object.entries(files)) {
      if (path.endsWith(key)) {
        return content
      }
    }

    throw new Error(`File not found: ${path}`)
  }),
}))

describe('PromptLoaderService', () => {
  let service: PromptLoaderService

  beforeEach(() => {
    service = new PromptLoaderService()
    service.onModuleInit()
  })

  describe('onModuleInit', () => {
    it('should load all prompt files on init', () => {
      // Should not throw
      expect(service.getPrompt('integrity', 'system.md')).toBeDefined()
      expect(service.getPrompt('integrity', 'user.md')).toBeDefined()
      expect(service.getPrompt('quality', 'system.md')).toBeDefined()
      expect(service.getPrompt('quality', 'user.md')).toBeDefined()
      expect(service.getPrompt('patterns', 'system.md')).toBeDefined()
      expect(service.getPrompt('patterns', 'user.md')).toBeDefined()
      expect(service.getPrompt('consolidator', 'system.md')).toBeDefined()
      expect(service.getPrompt('consolidator', 'user.md')).toBeDefined()
    })
  })

  describe('getPrompt', () => {
    it('should return content and version', () => {
      const prompt = service.getPrompt('integrity', 'system.md')
      expect(prompt.content).toContain('integrity judge')
      expect(prompt.version).toHaveLength(8)
    })

    it('should substitute variables', () => {
      const prompt = service.getPrompt('integrity', 'system.md', {
        conversation_date: '2026-01-15',
      })
      expect(prompt.content).toContain('2026-01-15')
      expect(prompt.content).not.toContain('{{conversation_date}}')
    })

    it('should substitute multiple variables', () => {
      const prompt = service.getPrompt('integrity', 'user.md', {
        transcript: 'Hello world',
      })
      expect(prompt.content).toContain('Hello world')
      expect(prompt.content).not.toContain('{{transcript}}')
    })

    it('should return raw content when no variables provided', () => {
      const prompt = service.getPrompt('integrity', 'system.md')
      expect(prompt.content).toContain('{{conversation_date}}')
    })

    it('should throw for unknown prompt', () => {
      expect(() => service.getPrompt('unknown', 'system.md')).toThrow('Prompt not loaded')
    })
  })

  describe('getVersion', () => {
    it('should return SHA-256 hash (first 8 chars)', () => {
      const version = service.getVersion('integrity', 'system.md')
      expect(version).toHaveLength(8)
      expect(version).toMatch(/^[a-f0-9]{8}$/)

      // Verify it matches expected hash
      const content = 'You are an integrity judge. Date: {{conversation_date}}'
      const expectedHash = createHash('sha256').update(content).digest('hex').slice(0, 8)
      expect(version).toBe(expectedHash)
    })

    it('should throw for unknown prompt', () => {
      expect(() => service.getVersion('unknown', 'system.md')).toThrow('Prompt not loaded')
    })
  })
})

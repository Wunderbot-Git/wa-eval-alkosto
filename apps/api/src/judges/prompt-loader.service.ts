import { Injectable, OnModuleInit, Logger } from '@nestjs/common'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'

export interface LoadedPrompt {
  content: string
  version: string // first 8 chars of SHA-256
}

@Injectable()
export class PromptLoaderService implements OnModuleInit {
  private readonly logger = new Logger(PromptLoaderService.name)
  private readonly promptsDir: string
  private readonly cache = new Map<string, LoadedPrompt>()

  constructor() {
    this.promptsDir = join(__dirname, '..', '..', 'prompts')
  }

  onModuleInit() {
    const judges = ['integrity', 'quality', 'patterns', 'consolidator']
    const files = ['system.md', 'user.md']

    for (const judge of judges) {
      for (const file of files) {
        const key = `${judge}/${file}`
        this.loadPromptFile(key)
      }
    }

    this.logger.log(`Loaded ${this.cache.size} prompt files`)
  }

  private loadPromptFile(relativePath: string): void {
    const fullPath = join(this.promptsDir, relativePath)
    try {
      const content = readFileSync(fullPath, 'utf-8')
      const hash = createHash('sha256').update(content).digest('hex').slice(0, 8)
      this.cache.set(relativePath, { content, version: hash })
    } catch {
      throw new Error(`Missing prompt file: ${fullPath}`)
    }
  }

  getPrompt(judge: string, file: string, variables?: Record<string, string>): LoadedPrompt {
    const key = `${judge}/${file}`
    const cached = this.cache.get(key)
    if (!cached) {
      throw new Error(`Prompt not loaded: ${key}`)
    }

    if (!variables || Object.keys(variables).length === 0) {
      return cached
    }

    let content = cached.content
    for (const [placeholder, value] of Object.entries(variables)) {
      content = content.replace(new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g'), value)
    }

    return { content, version: cached.version }
  }

  getVersion(judge: string, file: string): string {
    const key = `${judge}/${file}`
    const cached = this.cache.get(key)
    if (!cached) {
      throw new Error(`Prompt not loaded: ${key}`)
    }
    return cached.version
  }
}

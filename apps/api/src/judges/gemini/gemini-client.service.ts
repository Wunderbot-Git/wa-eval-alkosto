import { Injectable, Logger } from '@nestjs/common'
import { GoogleGenAI } from '@google/genai'

export type GeminiMode = 'vertex' | 'api_key' | 'fake'

/**
 * Resolve how the judges reach Gemini:
 * - GEMINI_USE_VERTEX=true → Vertex AI in the GCP project (auth via service
 *   account / Application Default Credentials, no API key needed)
 * - GEMINI_API_KEY set     → public Gemini API
 * - neither                → fake judges
 */
export function resolveGeminiMode(): GeminiMode {
  if (process.env.GEMINI_USE_VERTEX === 'true') return 'vertex'
  if (process.env.GEMINI_API_KEY) return 'api_key'
  return 'fake'
}

@Injectable()
export class GeminiClientService {
  private readonly logger = new Logger(GeminiClientService.name)
  private readonly ai: GoogleGenAI
  private readonly modelName: string

  constructor() {
    this.modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
    const mode = resolveGeminiMode()

    if (mode === 'vertex') {
      const project = process.env.GOOGLE_CLOUD_PROJECT
      if (!project) {
        throw new Error('GOOGLE_CLOUD_PROJECT is required when GEMINI_USE_VERTEX=true')
      }
      const location = process.env.GOOGLE_CLOUD_LOCATION || 'global'
      this.ai = new GoogleGenAI({ vertexai: true, project, location })
      this.logger.log(
        `Gemini client initialized (Vertex AI, project=${project}, location=${location}, model=${this.modelName})`,
      )
    } else if (mode === 'api_key') {
      this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
      this.logger.log(`Gemini client initialized (API key, model=${this.modelName})`)
    } else {
      throw new Error('GeminiClientService requires GEMINI_API_KEY or GEMINI_USE_VERTEX=true')
    }
  }

  async generateJSON<T>(systemPrompt: string, userPrompt: string): Promise<T> {
    const maxAttempts = 4
    let lastErr: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.ai.models.generateContent({
          model: this.modelName,
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            maxOutputTokens: 16384,
          },
        })

        const text = response.text ?? ''
        try {
          return JSON.parse(text) as T
        } catch {
          this.logger.error(`Failed to parse Gemini JSON response (len=${text.length}): ${text.slice(0, 300)}`)
          throw new Error('INVALID_JSON')
        }
      } catch (err) {
        lastErr = err
        if (attempt === maxAttempts) break
        const delayMs = this.backoffDelay(err, attempt)
        if (delayMs === null) break // non-retryable
        this.logger.warn(`Gemini call failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms: ${this.summarize(err)}`)
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }

    throw lastErr
  }

  /**
   * Return the backoff delay in ms for a given error, or null if not retryable.
   * Honors the 429 `retryDelay` hint when present (e.g. "Please retry in 16s").
   */
  private backoffDelay(err: unknown, attempt: number): number | null {
    const msg = (err as Error)?.message ?? String(err)
    const is429 = /\[429|Too Many Requests|RESOURCE_EXHAUSTED|quota/i.test(msg)
    const is5xx = /\[50\d |Service Unavailable|Internal Server Error/i.test(msg)
    const isFetchFailed = /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(msg)
    const isInvalidJson = /INVALID_JSON/.test(msg)
    if (!is429 && !is5xx && !isFetchFailed && !isInvalidJson) return null

    if (is429) {
      const hint = msg.match(/retry in (\d+(?:\.\d+)?)s/i)?.[1]
      if (hint) {
        const hintMs = Math.ceil(parseFloat(hint) * 1000)
        // Add small jitter to avoid thundering herd with concurrent workers
        return hintMs + Math.floor(Math.random() * 1500)
      }
      // 429 without hint: 10s, 30s, 60s
      return [10_000, 30_000, 60_000][Math.min(attempt - 1, 2)]
    }
    // fetch-failed: 2s, 5s, 15s
    return [2_000, 5_000, 15_000][Math.min(attempt - 1, 2)]
  }

  private summarize(err: unknown): string {
    const msg = (err as Error)?.message ?? String(err)
    return msg.slice(0, 160)
  }
}

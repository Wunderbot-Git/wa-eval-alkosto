import { Injectable, Logger } from '@nestjs/common'
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai'

@Injectable()
export class GeminiClientService {
  private readonly logger = new Logger(GeminiClientService.name)
  private readonly model: GenerativeModel

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required for GeminiClientService')
    }
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
    const genAI = new GoogleGenerativeAI(apiKey)
    this.model = genAI.getGenerativeModel({ model: modelName })
    this.logger.log(`Gemini client initialized with model: ${modelName}`)
  }

  async generateJSON<T>(systemPrompt: string, userPrompt: string): Promise<T> {
    const maxAttempts = 4
    let lastErr: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.model.generateContent({
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 16384,
          },
        })

        const text = result.response.text()
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

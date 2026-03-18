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
    const result = await this.model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
      generationConfig: {
        responseMimeType: 'application/json',
      },
    })

    const text = result.response.text()

    try {
      return JSON.parse(text) as T
    } catch {
      this.logger.error(`Failed to parse Gemini JSON response: ${text.slice(0, 200)}`)
      throw new Error('Gemini returned invalid JSON')
    }
  }
}

import { Injectable } from '@nestjs/common'

export interface ParsedMessage {
  role: 'customer' | 'agent'
  content: string
  orderIndex: number
}

export interface ParsedConversation {
  sessionId: string
  date: Date
  messages: ParsedMessage[]
}

export interface InvalidConversation {
  index: number
  reason: string
  raw: any
}

export interface ParseResult {
  valid: ParsedConversation[]
  invalid: InvalidConversation[]
}

@Injectable()
export class ConversationParserService {
  /**
   * Parse a date string in either ISO 8601 or US locale format.
   * US locale: "M/D/YYYY, h:mm:ss AM" (e.g. "1/23/2026, 11:50:30 AM")
   */
  parseDate(dateStr: string): Date | null {
    if (!dateStr || typeof dateStr !== 'string') return null

    // Try ISO 8601 first
    const isoDate = new Date(dateStr)
    if (!isNaN(isoDate.getTime()) && dateStr.includes('-')) {
      return isoDate
    }

    // Try US locale format: M/D/YYYY, h:mm:ss AM/PM
    const usMatch = dateStr.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i,
    )
    if (usMatch) {
      const [, month, day, year, hours, minutes, seconds, ampm] = usMatch
      let hour = parseInt(hours)
      if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12
      if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0
      return new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        hour,
        parseInt(minutes),
        parseInt(seconds),
      )
    }

    return null
  }

  /**
   * Validate a single conversation object.
   */
  validateConversation(
    conv: any,
    index: number,
  ): { parsed: ParsedConversation } | { reason: string } {
    if (!conv || typeof conv !== 'object') {
      return { reason: 'Conversation is not an object' }
    }

    const sessionId = conv.session_id
    if (!sessionId || typeof sessionId !== 'string') {
      return { reason: 'Missing or invalid session_id' }
    }

    const dateStr = conv.date
    if (!dateStr) {
      return { reason: 'Missing date field' }
    }
    const date = this.parseDate(dateStr)
    if (!date) {
      return { reason: `Invalid date format: ${dateStr}` }
    }

    if (!Array.isArray(conv.messages) || conv.messages.length === 0) {
      return { reason: 'Missing or empty messages array' }
    }

    const validRoles = new Set(['customer', 'agent'])
    const messages: ParsedMessage[] = []

    for (let i = 0; i < conv.messages.length; i++) {
      const msg = conv.messages[i]
      if (!msg || typeof msg !== 'object') {
        return { reason: `Message at index ${i} is not an object` }
      }

      const role = msg.role
      if (!role || !validRoles.has(role)) {
        return {
          reason: `Message at index ${i} has invalid role: ${role}`,
        }
      }

      const content = msg.content
      if (!content || typeof content !== 'string') {
        return {
          reason: `Message at index ${i} has missing or invalid content`,
        }
      }

      messages.push({
        role: role as 'customer' | 'agent',
        content,
        orderIndex: i,
      })
    }

    return {
      parsed: {
        sessionId,
        date,
        messages,
      },
    }
  }

  /**
   * Parse a batch of conversations from JSON content.
   * Accepts either a JSON array or a single conversation object.
   */
  parseConversationBatch(jsonContent: string): ParseResult {
    let data: any
    try {
      data = JSON.parse(jsonContent)
    } catch {
      return {
        valid: [],
        invalid: [{ index: 0, reason: 'Invalid JSON', raw: null }],
      }
    }

    const conversations = Array.isArray(data) ? data : [data]
    const valid: ParsedConversation[] = []
    const invalid: InvalidConversation[] = []

    for (let i = 0; i < conversations.length; i++) {
      const result = this.validateConversation(conversations[i], i)
      if ('parsed' in result) {
        valid.push(result.parsed)
      } else {
        invalid.push({ index: i, reason: result.reason, raw: conversations[i] })
      }
    }

    return { valid, invalid }
  }
}

import { describe, it, expect, beforeEach } from 'vitest'
import { ConversationParserService } from './conversation-parser.service'

describe('ConversationParserService', () => {
  let parser: ConversationParserService

  beforeEach(() => {
    parser = new ConversationParserService()
  })

  describe('parseDate', () => {
    it('should parse ISO 8601 date', () => {
      const date = parser.parseDate('2026-01-23T11:50:30.000Z')
      expect(date).toBeTruthy()
      expect(date!.getFullYear()).toBe(2026)
    })

    it('should parse US locale format with AM', () => {
      const date = parser.parseDate('1/23/2026, 11:50:30 AM')
      expect(date).toBeTruthy()
      expect(date!.getFullYear()).toBe(2026)
      expect(date!.getMonth()).toBe(0) // January
      expect(date!.getDate()).toBe(23)
      expect(date!.getHours()).toBe(11)
      expect(date!.getMinutes()).toBe(50)
      expect(date!.getSeconds()).toBe(30)
    })

    it('should parse US locale format with PM', () => {
      const date = parser.parseDate('12/5/2025, 3:15:00 PM')
      expect(date).toBeTruthy()
      expect(date!.getHours()).toBe(15)
    })

    it('should handle 12 AM as midnight', () => {
      const date = parser.parseDate('1/1/2026, 12:00:00 AM')
      expect(date).toBeTruthy()
      expect(date!.getHours()).toBe(0)
    })

    it('should handle 12 PM as noon', () => {
      const date = parser.parseDate('1/1/2026, 12:00:00 PM')
      expect(date).toBeTruthy()
      expect(date!.getHours()).toBe(12)
    })

    it('should return null for invalid date', () => {
      expect(parser.parseDate('not a date')).toBeNull()
    })

    it('should return null for empty string', () => {
      expect(parser.parseDate('')).toBeNull()
    })

    it('should return null for null/undefined', () => {
      expect(parser.parseDate(null as any)).toBeNull()
      expect(parser.parseDate(undefined as any)).toBeNull()
    })
  })

  describe('validateConversation', () => {
    const validConv = {
      session_id: 'session_123',
      date: '1/23/2026, 11:50:30 AM',
      messages: [
        { role: 'customer', content: 'Hello' },
        { role: 'agent', content: 'Hi there' },
      ],
    }

    it('should validate a correct conversation', () => {
      const result = parser.validateConversation(validConv, 0)
      expect('parsed' in result).toBe(true)
      if ('parsed' in result) {
        expect(result.parsed.sessionId).toBe('session_123')
        expect(result.parsed.messages).toHaveLength(2)
        expect(result.parsed.messages[0].orderIndex).toBe(0)
        expect(result.parsed.messages[1].orderIndex).toBe(1)
      }
    })

    it('should reject missing session_id', () => {
      const result = parser.validateConversation(
        { ...validConv, session_id: undefined },
        0,
      )
      expect('reason' in result).toBe(true)
      if ('reason' in result) {
        expect(result.reason).toContain('session_id')
      }
    })

    it('should reject missing date', () => {
      const result = parser.validateConversation(
        { ...validConv, date: undefined },
        0,
      )
      expect('reason' in result).toBe(true)
    })

    it('should reject invalid date format', () => {
      const result = parser.validateConversation(
        { ...validConv, date: 'bad-date' },
        0,
      )
      expect('reason' in result).toBe(true)
      if ('reason' in result) {
        expect(result.reason).toContain('Invalid date')
      }
    })

    it('should reject empty messages', () => {
      const result = parser.validateConversation(
        { ...validConv, messages: [] },
        0,
      )
      expect('reason' in result).toBe(true)
    })

    it('should reject missing messages', () => {
      const result = parser.validateConversation(
        { session_id: 'x', date: '2026-01-01T00:00:00Z' },
        0,
      )
      expect('reason' in result).toBe(true)
    })

    it('should reject invalid role', () => {
      const result = parser.validateConversation(
        {
          ...validConv,
          messages: [{ role: 'user', content: 'test' }],
        },
        0,
      )
      expect('reason' in result).toBe(true)
      if ('reason' in result) {
        expect(result.reason).toContain('invalid role')
      }
    })

    it('should reject message without content', () => {
      const result = parser.validateConversation(
        {
          ...validConv,
          messages: [{ role: 'customer' }],
        },
        0,
      )
      expect('reason' in result).toBe(true)
      if ('reason' in result) {
        expect(result.reason).toContain('content')
      }
    })

    it('should reject null conversation', () => {
      const result = parser.validateConversation(null, 0)
      expect('reason' in result).toBe(true)
    })
  })

  describe('parseConversationBatch', () => {
    it('should parse a valid array of conversations', () => {
      const json = JSON.stringify([
        {
          session_id: 'sess_1',
          date: '2026-01-23T11:00:00Z',
          messages: [{ role: 'customer', content: 'Hi' }],
        },
        {
          session_id: 'sess_2',
          date: '1/24/2026, 2:00:00 PM',
          messages: [
            { role: 'agent', content: 'Hello' },
            { role: 'customer', content: 'Thanks' },
          ],
        },
      ])

      const result = parser.parseConversationBatch(json)
      expect(result.valid).toHaveLength(2)
      expect(result.invalid).toHaveLength(0)
      expect(result.valid[0].sessionId).toBe('sess_1')
      expect(result.valid[1].sessionId).toBe('sess_2')
    })

    it('should parse a single conversation object (not array)', () => {
      const json = JSON.stringify({
        session_id: 'sess_1',
        date: '2026-01-23T11:00:00Z',
        messages: [{ role: 'customer', content: 'Hi' }],
      })

      const result = parser.parseConversationBatch(json)
      expect(result.valid).toHaveLength(1)
      expect(result.invalid).toHaveLength(0)
    })

    it('should separate valid and invalid conversations', () => {
      const json = JSON.stringify([
        {
          session_id: 'sess_1',
          date: '2026-01-23T11:00:00Z',
          messages: [{ role: 'customer', content: 'Hi' }],
        },
        {
          // Missing session_id
          date: '2026-01-23T11:00:00Z',
          messages: [{ role: 'customer', content: 'Hi' }],
        },
        {
          session_id: 'sess_3',
          date: 'bad-date',
          messages: [{ role: 'customer', content: 'Hi' }],
        },
      ])

      const result = parser.parseConversationBatch(json)
      expect(result.valid).toHaveLength(1)
      expect(result.invalid).toHaveLength(2)
    })

    it('should handle invalid JSON', () => {
      const result = parser.parseConversationBatch('not json {{{')
      expect(result.valid).toHaveLength(0)
      expect(result.invalid).toHaveLength(1)
      expect(result.invalid[0].reason).toBe('Invalid JSON')
    })
  })
})

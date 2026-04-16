import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

type RawMessage = {
  turn?: number
  speaker?: string
  message?: string
  message_type?: string
  timestamp?: string
}

type RawFile = {
  session_metadata?: { session_id?: string; date?: string }
  conversation?: RawMessage[]
}

type OutMessage = { role: 'customer' | 'agent'; content: string }
type OutConversation = { session_id: string; date: string; messages: OutMessage[] }

const UNKNOWN = '[Unknown message type]'

function parseArgs(argv: string[]) {
  const args = argv.slice(2)
  const dropUnknown = args.includes('--drop-unknown')
  const positional = args.filter((a) => !a.startsWith('--'))
  const [inputDir, outputPath] = positional
  if (!inputDir || !outputPath) {
    console.error('Usage: tsx merge-conversations.ts <inputDir> <outputPath> [--drop-unknown]')
    process.exit(1)
  }
  return { inputDir: resolve(inputDir), outputPath: resolve(outputPath), dropUnknown }
}

function transform(file: string, raw: RawFile, dropUnknown: boolean): { conv: OutConversation; unknownKept: number; unknownDropped: number } {
  const sessionId = raw.session_metadata?.session_id
  const date = raw.session_metadata?.date
  if (!sessionId) throw new Error(`${file}: missing session_metadata.session_id`)
  if (!date) throw new Error(`${file}: missing session_metadata.date`)
  if (!Array.isArray(raw.conversation)) throw new Error(`${file}: missing conversation array`)

  const messages: OutMessage[] = []
  let unknownKept = 0
  let unknownDropped = 0

  for (const [i, m] of raw.conversation.entries()) {
    const role = m.speaker
    let content = m.message
    if (role !== 'agent' && role !== 'customer') {
      throw new Error(`${file}: message ${i} has invalid speaker: ${role}`)
    }
    if (typeof content !== 'string') {
      throw new Error(`${file}: message ${i} has non-string message`)
    }
    if (content.length === 0) {
      if (m.message_type) {
        content = `[${role} sent a ${m.message_type}]`
      } else {
        throw new Error(`${file}: message ${i} has empty message and no message_type`)
      }
    }
    const isUnknown = content === UNKNOWN
    if (isUnknown && dropUnknown) {
      unknownDropped++
      continue
    }
    if (isUnknown) unknownKept++
    messages.push({ role, content })
  }

  if (messages.length === 0) throw new Error(`${file}: no messages remain after filtering`)

  return { conv: { session_id: sessionId, date, messages }, unknownKept, unknownDropped }
}

function main() {
  const { inputDir, outputPath, dropUnknown } = parseArgs(process.argv)
  if (!statSync(inputDir).isDirectory()) {
    console.error(`Not a directory: ${inputDir}`)
    process.exit(1)
  }

  const files = readdirSync(inputDir).filter((f) => f.endsWith('.json')).sort()
  const conversations: OutConversation[] = []
  const dateCounts = new Map<string, number>()
  let totalMessages = 0
  let totalUnknownKept = 0
  let totalUnknownDropped = 0
  const errors: string[] = []

  for (const f of files) {
    try {
      const raw = JSON.parse(readFileSync(join(inputDir, f), 'utf8')) as RawFile
      const { conv, unknownKept, unknownDropped } = transform(f, raw, dropUnknown)
      conversations.push(conv)
      totalMessages += conv.messages.length
      totalUnknownKept += unknownKept
      totalUnknownDropped += unknownDropped
      const datePart = conv.date.slice(0, 10)
      dateCounts.set(datePart, (dateCounts.get(datePart) ?? 0) + 1)
    } catch (e) {
      errors.push((e as Error).message)
    }
  }

  writeFileSync(outputPath, JSON.stringify(conversations, null, 2))

  console.log(`Input:  ${inputDir}`)
  console.log(`Output: ${outputPath}`)
  console.log(`Files scanned:       ${files.length}`)
  console.log(`Conversations out:   ${conversations.length}`)
  console.log(`Total messages:      ${totalMessages}`)
  console.log(`[Unknown] kept:      ${totalUnknownKept}`)
  console.log(`[Unknown] dropped:   ${totalUnknownDropped}`)
  console.log(`Date distribution:`)
  for (const [d, n] of [...dateCounts.entries()].sort()) console.log(`  ${d}: ${n}`)
  if (errors.length) {
    console.error(`\n${errors.length} errors:`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
}

main()

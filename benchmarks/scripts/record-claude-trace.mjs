#!/usr/bin/env node
// Records a real model stream as a trace: every text delta with the time it reached
// this process. Uses Claude Code's stream-json output with partial messages.
//
//   node scripts/record-claude-trace.mjs traces/claude-markdown.json "Explain ..."

import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const [out, prompt] = process.argv.slice(2)
if (!out || !prompt) throw new Error('usage: record-claude-trace.mjs <out.json> <prompt>')

const env = { ...process.env, CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' }
for (const key of Object.keys(env)) if (/^CLAUDE_CODE_(ENTRYPOINT|SSE)|^CLAUDECODE$/.test(key)) delete env[key]

const child = spawn(
  'claude',
  [
    '-p',
    prompt,
    '--tools',
    '',
    '--setting-sources',
    'project',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--verbose',
  ],
  { env, stdio: ['ignore', 'pipe', 'inherit'] },
)

const start = performance.now()
const chunks = []
let model = null
let buffer = ''
child.stdout.on('data', (data) => {
  const now = performance.now() - start
  buffer += data
  const lines = buffer.split('\n')
  buffer = lines.pop()
  for (const line of lines) {
    if (!line.startsWith('{')) continue
    const event = JSON.parse(line)
    if (event.type === 'system' && event.subtype === 'init') model = event.model
    const delta =
      event.type === 'stream_event' &&
      event.event?.type === 'content_block_delta' &&
      event.event.delta?.type === 'text_delta'
        ? event.event.delta.text
        : null
    if (delta) chunks.push({ t: Math.round(now * 10) / 10, delta })
  }
})

child.on('close', () => {
  const t0 = chunks[0]?.t ?? 0
  const trace = {
    name: out.replace(/^.*\//, '').replace(/\.json$/, ''),
    source: `recorded from Claude Code (${model}) stream-json partial messages on ${new Date().toISOString().slice(0, 10)}`,
    synthetic: false,
    chunks: chunks.map((c) => ({ t: Math.round((c.t - t0) * 10) / 10, delta: c.delta })),
  }
  writeFileSync(out, JSON.stringify(trace, null, 1) + '\n')
  const text = chunks.map((c) => c.delta).join('')
  console.log(
    `${trace.name}: ${chunks.length} chunks, ${text.length} chars, ${Math.round(trace.chunks.at(-1)?.t ?? 0)} ms`,
  )
})

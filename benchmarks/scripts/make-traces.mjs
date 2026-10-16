#!/usr/bin/env node
// Builds the synthetic traces. Each one takes the text of a recorded answer and gives
// it a different, deliberately chosen arrival pattern, from a fixed seed, so every
// run of the benchmark sees exactly the same streams.
//
//   node scripts/make-traces.mjs

import { readFileSync, writeFileSync } from 'node:fs'

const read = (name) => JSON.parse(readFileSync(new URL(`../traces/${name}.json`, import.meta.url), 'utf8'))
const textOf = (trace) => trace.chunks.map((c) => c.delta).join('')

const markdown = textOf(read('claude-markdown'))
const multilingual = textOf(read('claude-multilingual'))

function rng(seed) {
  let state = seed >>> 0
  return () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32
}

const between = (random, min, max) => min + Math.floor(random() * (max - min + 1))

/** Splits `text` at UTF-16 offsets; `size()` gives each chunk's length, `gap()` the wait before it. */
function chunked(text, { size, gap, seed }) {
  const random = rng(seed)
  const chunks = []
  let t = 0
  for (let i = 0; i < text.length;) {
    const n = Math.max(1, size(random, i))
    t += gap(random, i, text.length)
    chunks.push({ t: Math.round(t * 10) / 10, delta: text.slice(i, i + n) })
    i += n
  }
  return chunks
}

const traces = [
  {
    name: 'steady',
    description: 'Even arrival: 4-12 characters every 30 ms, about 270 characters per second.',
    chunks: chunked(markdown, { seed: 1, size: (r) => between(r, 4, 12), gap: () => 30 }),
  },
  {
    name: 'bursty',
    description: 'Groups of 3-8 chunks arrive together, then nothing for 300-900 ms.',
    chunks: (() => {
      let left = 0
      return chunked(markdown, {
        seed: 2,
        size: (r) => between(r, 6, 24),
        gap: (r) => {
          if (left > 0) {
            left--
            return 0
          }
          left = between(r, 2, 7)
          return between(r, 300, 900)
        },
      })
    })(),
  },
  {
    name: 'long-stall',
    description: 'Steady arrival with a 3-second stall halfway through.',
    chunks: (() => {
      let stalled = false
      return chunked(markdown, {
        seed: 3,
        size: (r) => between(r, 4, 12),
        gap: (_r, i, total) => {
          if (!stalled && i > total / 2) {
            stalled = true
            return 3000
          }
          return 30
        },
      })
    })(),
  },
  {
    name: 'fast',
    description: 'A fast model: 60-character chunks every 33 ms, about 1,800 characters per second.',
    chunks: chunked(markdown, { seed: 4, size: () => 60, gap: () => 33 }),
  },
  {
    name: 'tail-burst',
    description:
      'Steady for 60% of the answer, a 1.2-second pause, then the remaining 40% in one chunk as the stream closes.',
    chunks: (() => {
      const cut = Math.floor(markdown.length * 0.6)
      const head = chunked(markdown.slice(0, cut), { seed: 5, size: (r) => between(r, 4, 12), gap: () => 30 })
      return [...head, { t: head.at(-1).t + 1200, delta: markdown.slice(cut) }]
    })(),
  },
  {
    name: 'long',
    description:
      'A long answer: the Markdown text five times over (about 13,000 characters) at about 400 characters per second.',
    chunks: chunked(Array(5).fill(markdown).join('\n\n'), { seed: 6, size: (r) => between(r, 8, 20), gap: () => 35 }),
  },
  {
    name: 'unicode-split',
    description:
      'Multilingual text with emoji, cut at random UTF-16 offsets, so chunks often end inside a surrogate pair or an emoji sequence.',
    chunks: chunked(multilingual, { seed: 7, size: (r) => between(r, 1, 9), gap: (r) => between(r, 10, 60) }),
  },
  {
    name: 'markdown-split',
    description:
      'Markdown with links, bold, inline code and a table, cut at random offsets, with a 400 ms pause after one chunk in eight.',
    chunks: chunked(markdown, { seed: 8, size: (r) => between(r, 2, 14), gap: (r) => (r() < 0.125 ? 400 : 25) }),
  },
  {
    name: 'hidden-tab',
    description:
      'The steady stream, with the tab hidden from 1.5 s to 6 s. Animation frames stop while hidden and timers are throttled to once a second.',
    hidden: [1500, 6000],
    chunks: chunked(markdown, { seed: 1, size: (r) => between(r, 4, 12), gap: () => 30 }),
  },
]

for (const trace of traces) {
  const file = new URL(`../traces/${trace.name}.json`, import.meta.url)
  writeFileSync(
    file,
    JSON.stringify({ ...trace, source: 'synthetic, scripts/make-traces.mjs', synthetic: true }, null, 1) + '\n',
  )
  console.log(`${trace.name}: ${trace.chunks.length} chunks, ${trace.chunks.at(-1).t} ms`)
}

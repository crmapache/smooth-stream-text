#!/usr/bin/env node
// Plays every trace through every approach on a virtual 60 Hz frame clock and
// measures what a reader would see: when each character becomes visible, how
// evenly the text grows, how long the end takes, and whether any frame shows
// broken text.
//
// Virtual time makes the results exact and repeatable. It measures pacing, not
// rendering cost; scripts/bench-browser.mjs measures that in a real browser.
//
//   node scripts/bench-core.mjs

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { smoothStream } from 'ai'
import { createSmoothStream } from 'smooth-stream-text'

const FRAME = 1000 / 60
const HIDDEN_TIMER_MS = 1000 // browsers run timers in hidden tabs at most once a second

const traceDir = new URL('../traces/', import.meta.url)
const traces = readdirSync(traceDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(new URL(f, traceDir), 'utf8')))
  .sort((a, b) => Number(a.synthetic) - Number(b.synthetic) || a.name.localeCompare(b.name))

const isHidden = (trace, t) => trace.hidden && t >= trace.hidden[0] && t < trace.hidden[1]

/** Frame times from the first arrival until well after the last, skipping hidden periods. */
function frames(trace, until) {
  const out = []
  for (let t = 0; t <= until; t += FRAME) if (!isHidden(trace, t)) out.push(t)
  return out
}

// ---------- approaches: each returns the visible text at every frame ----------

function raw(trace) {
  const end = trace.chunks.at(-1).t + 3000
  return frames(trace, end).map((t) => ({
    t,
    text: trace.chunks
      .filter((c) => c.t <= t)
      .map((c) => c.delta)
      .join(''),
  }))
}

/** A hand-written typing effect: a fixed rate, `text.slice(0, count)`, a timer. */
function typing(cps) {
  return (trace) => {
    const source = trace.chunks.map((c) => c.delta).join('')
    const arrived = (t) => trace.chunks.filter((c) => c.t <= t).reduce((n, c) => n + c.delta.length, 0)
    const out = []
    let count = 0
    let last = 0
    const end = trace.chunks.at(-1).t + source.length / (cps / 1000) + 3000
    for (let t = 0; t <= end; t += FRAME) {
      const dt = t - last
      last = t
      const step = isHidden(trace, t) ? dt / HIDDEN_TIMER_MS : dt * (cps / 1000)
      count = Math.min(arrived(t), count + step)
      if (!isHidden(trace, t)) out.push({ t, text: source.slice(0, Math.floor(count)) })
      if (Math.floor(count) >= source.length && t > trace.chunks.at(-1).t + 500) break
    }
    return out
  }
}

/** Runs the AI SDK's own smoothStream() transform in virtual time and returns when each piece leaves it. */
async function smoothStreamTimeline(trace, chunking) {
  const events = [] // { t, run }
  let now = 0
  const at = (t, run) => events.push({ t, run })
  const delay = (ms) => new Promise((resolve) => (ms == null ? resolve() : at(now + ms, resolve)))
  const transform = smoothStream({ chunking, _internal: { delay } })()
  const writer = transform.writable.getWriter()
  const reader = transform.readable.getReader()
  const out = []
  ;(async () => {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      if (value.type === 'text-delta') out.push({ t: now, delta: value.text })
    }
  })()
  for (const chunk of trace.chunks) at(chunk.t, () => writer.write({ type: 'text-delta', id: '1', text: chunk.delta }))
  at(trace.chunks.at(-1).t, () => writer.write({ type: 'text-end', id: '1' }).then(() => writer.close()))
  const settle = () => new Promise((resolve) => setImmediate(resolve))
  while (events.length) {
    events.sort((a, b) => a.t - b.t)
    const event = events.shift()
    now = Math.max(now, event.t)
    event.run()
    await settle()
    await settle()
  }
  return out
}

function afterTransform(timeline, trace) {
  const end = timeline.at(-1).t + 3000
  return frames(trace, end).map((t) => ({
    t,
    text: timeline
      .filter((c) => c.t <= t)
      .map((c) => c.delta)
      .join(''),
  }))
}

function smoothStreamApproach(chunking) {
  return async (trace) => afterTransform(await smoothStreamTimeline(trace, chunking), trace)
}

/** smooth-stream-text's core with its defaults, on a clock that ticks only on visible frames. */
function paced(timelineOf, options = {}) {
  return async (trace) => {
    const input = timelineOf ? await timelineOf(trace) : trace.chunks
    let now = 0
    const scheduled = new Set()
    const clock = {
      now: () => now,
      schedule(callback) {
        scheduled.add(callback)
        return () => scheduled.delete(callback)
      },
    }
    const stream = createSmoothStream({ ...options, clock })
    const lastInput = input.at(-1).t
    const out = []
    let i = 0
    const end = lastInput + 5000
    for (let t = 0; t <= end; t += FRAME) {
      while (i < input.length && input[i].t <= t) {
        now = input[i].t
        stream.push(input[i].delta)
        if (i === input.length - 1) stream.end()
        i++
      }
      now = t
      if (isHidden(trace, t)) continue
      const wave = [...scheduled]
      scheduled.clear()
      for (const callback of wave) callback(t)
      const state = stream.getState()
      out.push({ t, text: state.text })
      if (state.phase === 'done' && i === input.length) break
    }
    stream.destroy()
    return out
  }
}

const APPROACHES = {
  'as received': raw,
  'fixed 60 cps': typing(60),
  'fixed 240 cps': typing(240),
  'AI SDK smoothStream()': smoothStreamApproach('word'),
  'smoothStream() + Intl.Segmenter': smoothStreamApproach(new Intl.Segmenter('en', { granularity: 'word' })),
  'smooth-stream-text': paced(null),
  "smooth-stream-text, boundary 'char'": paced(null, { boundary: 'char' }),
  "smooth-stream-text, unit 'word'": paced(null, { unit: 'word' }),
  'smoothStream() then smooth-stream-text': paced((trace) => smoothStreamTimeline(trace, 'word')),
}

// ---------- metrics ----------

const graphemeEnds = (text) => {
  const ends = new Set([0])
  for (const { index, segment } of new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text))
    ends.add(index + segment.length)
  return ends
}

/**
 * Heuristic for text a Markdown renderer would show wrongly: a construct left open on
 * the last visible line. Inline code is removed first, a list bullet is not emphasis.
 */
function brokenMarkdown(visible) {
  const line = visible.slice(visible.lastIndexOf('\n') + 1)
  if (/^\s*(```|~~~)/.test(line)) return false
  const prose = line.replace(/`[^`]*`/g, '').replace(/^\s*[-*+]\s/, '')
  const count = (re) => (prose.match(re) ?? []).length
  if (count(/`/g) % 2) return true
  if (count(/\*\*/g) % 2) return true
  if (count(/(?<!\*)\*(?!\*)/g) % 2) return true
  if (count(/~~/g) % 2) return true
  if (/\[[^\]]*$/.test(prose)) return true
  if (/\]\([^)]*$/.test(prose)) return true
  return false
}

const quantile = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : NaN
const round = (x) => (Number.isFinite(x) ? Math.round(x) : null)

function measure(trace, timeline) {
  const source = trace.chunks.map((c) => c.delta).join('')
  const arrival = new Float64Array(source.length)
  let pos = 0
  for (const chunk of trace.chunks) for (let k = 0; k < chunk.delta.length; k++) arrival[pos++] = chunk.t
  const shown = new Float64Array(source.length).fill(NaN)
  let prev = 0
  let prefixViolations = 0
  let splitGraphemes = 0
  let brokenFrames = 0
  const ends = graphemeEnds(source)
  const growth = []
  for (const frame of timeline) {
    const len = frame.text.length
    if (!source.startsWith(frame.text)) prefixViolations++
    for (let k = prev; k < len; k++) shown[k] = frame.t
    if (len !== prev) {
      if (!ends.has(len)) splitGraphemes++
      if (brokenMarkdown(frame.text)) brokenFrames++
    }
    growth.push({ t: frame.t, added: Math.max(0, len - prev) })
    prev = Math.max(prev, len)
  }
  const final = timeline.at(-1)?.text ?? ''
  const lag = []
  for (let k = 0; k < source.length; k++) if (!Number.isNaN(shown[k])) lag.push(shown[k] - arrival[k])
  lag.sort((a, b) => a - b)
  const firstShown = shown[0]
  const complete = shown[source.length - 1]
  const lastArrival = trace.chunks.at(-1).t

  // Evenness: characters added per 100 ms window while the answer is appearing.
  const windows = new Map()
  for (const g of growth)
    if (g.t >= firstShown && g.t <= complete)
      windows.set(
        Math.floor((g.t - firstShown) / 100),
        (windows.get(Math.floor((g.t - firstShown) / 100)) ?? 0) + g.added,
      )
  const counts = [...Array(Math.floor((complete - firstShown) / 100) + 1).keys()].map((w) => windows.get(w) ?? 0)
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length
  const sd = Math.sqrt(counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length)

  // Pauses the reader sees: no new text for over 250 ms before the answer is complete.
  let stalls = 0
  let lastGrowth = firstShown
  for (const g of growth) {
    if (g.t > complete) break
    if (g.added > 0) {
      if (g.t - lastGrowth > 250) stalls++
      lastGrowth = g.t
    }
  }

  return {
    complete: final === source,
    prefixViolations,
    firstVisibleMs: round(firstShown - trace.chunks[0].t),
    lagP50Ms: round(quantile(lag, 0.5)),
    lagP95Ms: round(quantile(lag, 0.95)),
    lagMaxMs: round(lag.at(-1)),
    tailMs: round(complete - lastArrival),
    evenness: Math.round((sd / mean) * 100) / 100,
    largestStepChars: Math.max(...growth.map((g) => g.added)),
    visiblePauses: stalls,
    splitGraphemeFrames: splitGraphemes,
    brokenMarkdownFrames: brokenFrames,
  }
}

const results = []
for (const trace of traces) {
  const source = trace.chunks.map((c) => c.delta).join('')
  for (const [approach, run] of Object.entries(APPROACHES)) {
    const timeline = await run(trace)
    results.push({ trace: trace.name, approach, ...measure(trace, timeline) })
  }
  console.log(`${trace.name}: ${source.length} chars, ${trace.chunks.length} chunks`)
}

const meta = {
  date: new Date().toISOString().slice(0, 10),
  node: process.version,
  frameMs: FRAME,
  // The package is installed from this repository, so record exactly which code ran.
  build: execFileSync('git', ['describe', '--always', '--dirty'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  }).trim(),
  versions: {
    'smooth-stream-text': JSON.parse(
      readFileSync(new URL('../node_modules/smooth-stream-text/package.json', import.meta.url), 'utf8'),
    ).version,
    ai: JSON.parse(readFileSync(new URL('../node_modules/ai/package.json', import.meta.url), 'utf8')).version,
  },
  traces: traces.map((t) => ({
    name: t.name,
    synthetic: t.synthetic,
    source: t.source,
    description: t.description,
    chars: t.chunks.map((c) => c.delta).join('').length,
    chunks: t.chunks.length,
    durationMs: t.chunks.at(-1).t,
  })),
}
mkdirSync(new URL('../results/', import.meta.url), { recursive: true })
writeFileSync(new URL('../results/core.json', import.meta.url), JSON.stringify({ meta, results }, null, 1) + '\n')
console.log(`wrote results/core.json (${results.length} rows)`)

#!/usr/bin/env node
// Replays traces in real time in headless Chromium and measures the rendering cost
// of each approach: how often the Markdown renderer runs, how long rendering takes
// in total, long tasks on the main thread, frame intervals and how many elements the
// output holds at its peak.
//
// Absolute numbers depend on the machine; the comparison between approaches on the
// same machine is what matters. The machine is recorded with the results.
//
//   node scripts/bench-browser.mjs

import { build } from 'esbuild'
import { cpus, totalmem } from 'node:os'
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const TRACES = ['claude-markdown', 'fast', 'long']

const page = `
import { marked } from 'marked'
import { createSmoothStream } from 'smooth-stream-text'
import { createSmoothText } from 'smooth-stream-text/dom'

const out = document.getElementById('out')
const metrics = { renders: 0, renderMs: 0, longTasks: 0, longTaskMs: 0, maxElements: 0, frames: [] }
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    metrics.longTasks++
    metrics.longTaskMs += entry.duration
  }
}).observe({ type: 'longtask', buffered: false })

function renderMarkdown(text) {
  const start = performance.now()
  out.innerHTML = marked.parse(text)
  metrics.renderMs += performance.now() - start
  metrics.renders++
}

const approaches = {
  // Markdown re-rendered on every chunk, as most chats do before pacing.
  'markdown as received': () => {
    let text = ''
    return { push: (d) => renderMarkdown((text += d)), end() {}, done: () => true }
  },
  // The headless path: the same renderer, run once per visible step.
  'markdown paced': () => {
    const stream = createSmoothStream()
    let last = ''
    stream.subscribe((s) => {
      if (s.text !== last) renderMarkdown((last = s.text))
    })
    return { push: (d) => stream.push(d), end: () => stream.end(), done: () => stream.getState().phase === 'done' }
  },
  // Whole words only: fewer visible steps, so fewer renders.
  'markdown paced, unit word': () => {
    const stream = createSmoothStream({ unit: 'word' })
    let last = ''
    stream.subscribe((s) => {
      if (s.text !== last) renderMarkdown((last = s.text))
    })
    return { push: (d) => stream.push(d), end: () => stream.end(), done: () => stream.getState().phase === 'done' }
  },
  // Plain text appended as it arrives.
  'plain text as received': () => ({
    push: (d) => {
      const start = performance.now()
      out.append(d)
      metrics.renderMs += performance.now() - start
      metrics.renders++
    },
    end() {},
    done: () => true,
  }),
  // Plain text paced and revealed by the DOM handle.
  'plain text paced + reveal': () => {
    const handle = createSmoothText(out)
    return { push: (d) => handle.push(d), end: () => handle.end(), done: () => handle.settled }
  },
}

window.runTrace = (trace, approach) =>
  new Promise((resolve) => {
    out.textContent = ''
    const run = approaches[approach]()
    const t0 = performance.now()
    let last = t0
    const frame = (now) => {
      metrics.frames.push(now - last)
      last = now
      metrics.maxElements = Math.max(metrics.maxElements, out.getElementsByTagName('*').length)
      if (performance.now() - t0 > trace.chunks.at(-1).t + 100 && run.done()) {
        resolve({ ...metrics, textLength: out.textContent.length })
        return
      }
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
    trace.chunks.forEach((chunk, i) =>
      setTimeout(() => {
        run.push(chunk.delta)
        if (i === trace.chunks.length - 1) run.end()
      }, chunk.t),
    )
  })
`

const bundle = await build({
  stdin: { contents: page, resolveDir: new URL('..', import.meta.url).pathname, loader: 'js' },
  bundle: true,
  format: 'iife',
  write: false,
  minify: true,
})
const script = bundle.outputFiles[0].text

const browser = await chromium.launch()
const browserVersion = browser.version()
const results = []
const quantile = (values, p) => [...values].sort((a, b) => a - b)[Math.floor(p * (values.length - 1))]

for (const name of TRACES) {
  const trace = JSON.parse(readFileSync(new URL(`../traces/${name}.json`, import.meta.url), 'utf8'))
  const source = trace.chunks.map((c) => c.delta).join('')
  for (const approach of [
    'markdown as received',
    'markdown paced',
    'markdown paced, unit word',
    'plain text as received',
    'plain text paced + reveal',
  ]) {
    const context = await browser.newContext({ viewport: { width: 800, height: 900 } })
    const tab = await context.newPage()
    await tab.setContent(
      `<!doctype html><meta charset="utf-8"><div id="out" style="max-width:720px;font:16px/1.6 system-ui;white-space:pre-wrap"></div>`,
    )
    await tab.addScriptTag({ content: script })
    const m = await tab.evaluate(([t, a]) => globalThis.runTrace(t, a), [trace, approach])
    results.push({
      trace: name,
      approach,
      renders: approach.endsWith('reveal') ? null : m.renders,
      renderMsTotal: approach.endsWith('reveal') ? null : Math.round(m.renderMs),
      longTasks: m.longTasks,
      longTaskMs: Math.round(m.longTaskMs),
      frameP95Ms: Math.round(quantile(m.frames.slice(1), 0.95) * 10) / 10,
      maxElements: m.maxElements,
      textComplete: approach.startsWith('plain') ? m.textLength === source.length : null,
    })
    console.log(`${name} / ${approach}: ${m.renders} renders, ${Math.round(m.renderMs)} ms`)
    await context.close()
  }
}
await browser.close()

const meta = {
  date: new Date().toISOString().slice(0, 10),
  browser: `Chromium ${browserVersion} (headless)`,
  machine: `${cpus()[0].model}, ${cpus().length} cores, ${Math.round(totalmem() / 2 ** 30)} GB, ${process.platform}`,
  node: process.version,
}
writeFileSync(new URL('../results/browser.json', import.meta.url), JSON.stringify({ meta, results }, null, 1) + '\n')
console.log('wrote results/browser.json')

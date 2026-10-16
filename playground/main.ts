import {
  createReveal,
  createSmoothStream,
  createWaveTimeline,
  defaultPacing,
  defaultReveal,
  resolveRevealOptions,
  type PacingOptions,
  type RevealOptions,
} from 'smooth-stream-text/dom'
import { version } from '../package.json'
import { buildControls, createSegmented, type ControlSpec } from './controls'
import { createChart } from './chart'
import { parseMarkdown } from './markdown'
import { createBlockRenderer } from './render'
import { SAMPLE, SAMPLES } from './sample'
import { createSimulator, type SimulatorOptions } from './simulator'

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!

const rawOut = $('#raw')
const smoothOut = $('#smooth')
const panel = $('#panel')
const startButton = $<HTMLButtonElement>('#start')
const status = $('#status')
const statusBadge = $('#status-badge')
const smoothPane = $('#smooth-pane')
const lag = $('#lag')
const rate = $('#rate')

$('#version').textContent = `v${version}`

const chart = createChart($<HTMLCanvasElement>('#chart'))

/** Keeps a pane pinned to the newest text, unless the reader has scrolled up to look back. */
function follower(element: HTMLElement) {
  let pinned = true
  element.addEventListener('scroll', () => {
    pinned = element.scrollHeight - element.scrollTop - element.clientHeight < 24
  })
  return {
    follow() {
      if (pinned) element.scrollTop = element.scrollHeight
    },
    reset() {
      pinned = true
      element.scrollTop = 0
    },
  }
}

const followers = [follower(rawOut), follower(smoothOut)]

// Both panes run the same markdown renderer, so what is being compared is the
// stream itself and nothing else. Only the right one gets paced and revealed.
const revealConfig = resolveRevealOptions({})
const timeline = createWaveTimeline(revealConfig)
const rawRenderer = createBlockRenderer(rawOut, { reveal: false })
const smoothRenderer = createBlockRenderer(smoothOut, { reveal: true, revealOptions: revealConfig, timeline })

const pacing: PacingOptions = { ...defaultPacing }
delete (pacing as { clock?: unknown }).clock

const stream = createSmoothStream(pacing)
stream.subscribe((state) => smoothRenderer.update(parseMarkdown(state.text)))

const producer: SimulatorOptions = {
  charsPerSecond: 350,
  chunkChars: 14,
  jitter: 0.9,
  pauseChance: 0.12,
  pauseMs: 700,
}

let raw = ''
let answer = SAMPLE
const simulator = createSimulator(SAMPLE, producer, {
  onChunk(delta) {
    raw += delta
    rawRenderer.update(parseMarkdown(raw))
    stream.push(delta)
  },
  onEnd() {
    stream.end()
    setRunning(false)
  },
})

function setRunning(running: boolean) {
  startButton.dataset.running = String(running)
  status.textContent = running ? 'streaming' : 'idle'
  statusBadge.classList.toggle('is-on', running)
}

function restart() {
  simulator.stop()
  raw = ''
  rawRenderer.reset()
  smoothRenderer.reset()
  stream.reset()
  timeline.reset()
  chart.clear()
  for (const one of followers) one.reset()
  simulator.start()
  setRunning(true)
}

startButton.addEventListener('click', () => {
  if (simulator.running) {
    simulator.stop()
    setRunning(false)
    return
  }
  restart()
})

$('#restart').addEventListener('click', restart)

// Everything at once, on both sides: the stream jumps to the end and closes, and
// every word still animating on screen finishes immediately.
$('#flush').addEventListener('click', () => {
  simulator.stop()
  raw = answer
  rawRenderer.update(parseMarkdown(raw))
  stream.setSource(answer)
  stream.end()
  stream.flush()
  smoothRenderer.flush()
  setRunning(false)
})

const producerControls: ControlSpec[] = [
  {
    key: 'charsPerSecond',
    label: 'Speed',
    min: 20,
    max: 1200,
    step: 10,
    value: producer.charsPerSecond,
    unit: ' ch/s',
  },
  { key: 'chunkChars', label: 'Chunk size', min: 1, max: 120, step: 1, value: producer.chunkChars, unit: ' ch' },
  { key: 'jitter', label: 'Jitter', min: 0, max: 1, step: 0.05, value: producer.jitter },
  { key: 'pauseChance', label: 'Stall chance', min: 0, max: 1, step: 0.02, value: producer.pauseChance },
  { key: 'pauseMs', label: 'Stall length', min: 0, max: 3000, step: 50, value: producer.pauseMs, unit: 'ms' },
]

const pacingControls: ControlSpec[] = [
  {
    key: 'targetLatencyMs',
    label: 'Target latency',
    min: 0,
    max: 800,
    step: 10,
    value: defaultPacing.targetLatencyMs,
    unit: 'ms',
  },
  { key: 'adaptMs', label: 'Rate inertia', min: 20, max: 1200, step: 10, value: defaultPacing.adaptMs, unit: 'ms' },
  {
    key: 'minCharsPerSecond',
    label: 'Min rate',
    min: 1,
    max: 200,
    step: 1,
    value: defaultPacing.minCharsPerSecond,
    unit: ' ch/s',
  },
  {
    key: 'maxCharsPerSecond',
    label: 'Max rate',
    min: 100,
    max: 4000,
    step: 50,
    value: defaultPacing.maxCharsPerSecond,
    unit: ' ch/s',
  },
  { key: 'settleMs', label: 'Settle window', min: 0, max: 1500, step: 25, value: defaultPacing.settleMs, unit: 'ms' },
  {
    key: 'idleGraceMs',
    label: 'Idle grace',
    min: 0,
    max: 1500,
    step: 25,
    value: defaultPacing.idleGraceMs,
    unit: 'ms',
  },
  {
    key: 'boundary',
    label: 'Cut boundary',
    options: ['markdown', 'word', 'char'],
    value: String(defaultPacing.boundary),
  },
]

const revealControls: ControlSpec[] = [
  { key: 'unit', label: 'Reveal unit', options: ['word', 'char'], value: defaultReveal.unit },
  { key: 'durationMs', label: 'Duration', min: 0, max: 1500, step: 20, value: defaultReveal.durationMs, unit: 'ms' },
  { key: 'staggerMs', label: 'Stagger', min: 0, max: 200, step: 2, value: defaultReveal.staggerMs, unit: 'ms' },
  { key: 'blurPx', label: 'Blur', min: 0, max: 20, step: 0.5, value: defaultReveal.blurPx, unit: 'px' },
  { key: 'translatePx', label: 'Shift', min: 0, max: 24, step: 0.5, value: defaultReveal.translatePx, unit: 'px' },
  {
    key: 'maxWaveLagMs',
    label: 'Wave lag cap',
    min: 0,
    max: 1200,
    step: 20,
    value: defaultReveal.maxWaveLagMs,
    unit: 'ms',
  },
]

$('#sample').append(
  createSegmented({ key: 'sample', label: 'Sample text', options: Object.keys(SAMPLES), value: 'English' }, (value) => {
    answer = SAMPLES[value]
    simulator.setText(answer)
    restart()
  }),
)

buildControls(panel, 'Producer', producerControls, (key, value) => {
  simulator.setOptions({ [key]: value } as Partial<SimulatorOptions>)
})

buildControls(panel, 'Pacing', pacingControls, (key, value) => {
  stream.setOptions({ [key]: value } as Partial<PacingOptions>)
})

buildControls(panel, 'Reveal', revealControls, (key, value) => {
  smoothRenderer.setRevealOptions({ [key]: value } as Partial<RevealOptions>)
  // The unit is shared: pacing stops at whole words exactly when words animate.
  if (key === 'unit') stream.setOptions({ unit: value as RevealOptions['unit'] })
})

function sample() {
  const state = stream.getState()
  chart.push(state.pending, state.charsPerSecond)
  for (const one of followers) one.follow()
  lag.textContent = String(state.pending)
  rate.textContent = String(Math.round(state.charsPerSecond))
  // The rim runs while the smoothed side still has something to draw, which
  // outlasts the producer by however much backlog it left behind.
  smoothPane.classList.toggle('is-active', simulator.running || state.pending > 0)
  requestAnimationFrame(sample)
}

// The page heading arrives the way the package draws text: one wave, both lines
// on the same timeline so the second line picks up where the first left off.
const titleReveal = { durationMs: 900, staggerMs: 60, blurPx: 14, translatePx: 12 }
const titleTimeline = createWaveTimeline(resolveRevealOptions(titleReveal))
for (const line of [$('#title-1'), $('#title-2')]) {
  const text = line.textContent ?? ''
  createReveal(line, { ...titleReveal, timeline: titleTimeline, initialText: '' }).update(text)
}

const install = $<HTMLButtonElement>('#install')
let copiedTimer = 0
install.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(install.querySelector('code')!.textContent ?? '')
  } catch {
    return
  }
  install.dataset.copied = ''
  clearTimeout(copiedTimer)
  copiedTimer = window.setTimeout(() => delete install.dataset.copied, 1600)
})

// The light on a card's edge follows the pointer.
document.addEventListener(
  'pointermove',
  (event) => {
    const card = (event.target as Element).closest?.<HTMLElement>('.lit')
    if (!card) return
    const box = card.getBoundingClientRect()
    card.style.setProperty('--mx', `${event.clientX - box.left}px`)
    card.style.setProperty('--my', `${event.clientY - box.top}px`)
  },
  { passive: true },
)

setRunning(false)
requestAnimationFrame(sample)
restart()

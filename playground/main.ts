import { createSmoothText, defaultPacing, defaultReveal, type SmoothTextOptions } from 'smooth-stream-text/dom'
import { buildControls, type ControlSpec } from './controls'
import { createChart } from './chart'
import { SAMPLE } from './sample'
import { createSimulator, type SimulatorOptions } from './simulator'

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!

const rawOut = $('#raw')
const smoothOut = $('#smooth')
const panel = $('#panel')
const startButton = $<HTMLButtonElement>('#start')
const status = $('#status')

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

const pacing: SmoothTextOptions = { ...defaultPacing, ...defaultReveal }
delete (pacing as { clock?: unknown }).clock

const smooth = createSmoothText(smoothOut, pacing)

const producer: SimulatorOptions = {
  charsPerSecond: 220,
  chunkChars: 14,
  jitter: 0.9,
  pauseChance: 0.12,
  pauseMs: 700,
}

let raw = ''
const simulator = createSimulator(SAMPLE, producer, {
  onChunk(delta) {
    raw += delta
    rawOut.textContent = raw
    smooth.push(delta)
  },
  onEnd() {
    smooth.end()
    setRunning(false)
  },
})

function setRunning(running: boolean) {
  startButton.textContent = running ? 'Stop' : 'Play'
  startButton.dataset.running = String(running)
  status.textContent = running ? 'streaming' : 'idle'
}

function restart() {
  simulator.stop()
  raw = ''
  rawOut.textContent = ''
  smooth.reset()
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

$('#flush').addEventListener('click', () => {
  simulator.stop()
  raw = SAMPLE
  rawOut.textContent = raw
  smooth.setText(SAMPLE)
  smooth.flush()
  setRunning(false)
})

const producerControls: ControlSpec[] = [
  { key: 'charsPerSecond', label: 'Speed', min: 20, max: 1200, step: 10, value: producer.charsPerSecond, unit: ' ch/s' },
  { key: 'chunkChars', label: 'Chunk size', min: 1, max: 120, step: 1, value: producer.chunkChars, unit: ' ch' },
  { key: 'jitter', label: 'Jitter', min: 0, max: 1, step: 0.05, value: producer.jitter },
  { key: 'pauseChance', label: 'Stall chance', min: 0, max: 1, step: 0.02, value: producer.pauseChance },
  { key: 'pauseMs', label: 'Stall length', min: 0, max: 3000, step: 50, value: producer.pauseMs, unit: 'ms' },
]

const pacingControls: ControlSpec[] = [
  { key: 'targetLatencyMs', label: 'Target latency', min: 0, max: 800, step: 10, value: defaultPacing.targetLatencyMs, unit: 'ms' },
  { key: 'adaptMs', label: 'Rate inertia', min: 20, max: 1200, step: 10, value: defaultPacing.adaptMs, unit: 'ms' },
  { key: 'minCharsPerSecond', label: 'Min rate', min: 1, max: 200, step: 1, value: defaultPacing.minCharsPerSecond, unit: ' ch/s' },
  { key: 'maxCharsPerSecond', label: 'Max rate', min: 100, max: 4000, step: 50, value: defaultPacing.maxCharsPerSecond, unit: ' ch/s' },
  { key: 'settleMs', label: 'Settle window', min: 0, max: 1500, step: 25, value: defaultPacing.settleMs, unit: 'ms' },
  { key: 'idleGraceMs', label: 'Idle grace', min: 0, max: 1500, step: 25, value: defaultPacing.idleGraceMs, unit: 'ms' },
  { key: 'boundary', label: 'Cut boundary', options: ['markdown', 'word', 'char'], value: String(defaultPacing.boundary) },
]

const revealControls: ControlSpec[] = [
  { key: 'unit', label: 'Reveal unit', options: ['word', 'char'], value: defaultReveal.unit },
  { key: 'durationMs', label: 'Duration', min: 0, max: 1500, step: 20, value: defaultReveal.durationMs, unit: 'ms' },
  { key: 'staggerMs', label: 'Stagger', min: 0, max: 200, step: 2, value: defaultReveal.staggerMs, unit: 'ms' },
  { key: 'blurPx', label: 'Blur', min: 0, max: 20, step: 0.5, value: defaultReveal.blurPx, unit: 'px' },
  { key: 'translatePx', label: 'Shift', min: 0, max: 24, step: 0.5, value: defaultReveal.translatePx, unit: 'px' },
  { key: 'maxWaveLagMs', label: 'Wave lag cap', min: 0, max: 1200, step: 20, value: defaultReveal.maxWaveLagMs, unit: 'ms' },
]

buildControls(panel, 'Producer', producerControls, (key, value) => {
  simulator.setOptions({ [key]: value } as Partial<SimulatorOptions>)
})

buildControls(panel, 'Pacing', pacingControls, (key, value) => {
  smooth.setOptions({ [key]: value } as Partial<SmoothTextOptions>)
})

buildControls(panel, 'Reveal', revealControls, (key, value) => {
  smooth.setOptions({ [key]: value } as Partial<SmoothTextOptions>)
})

function sample() {
  const state = smooth.state
  chart.push(state.pending, state.charsPerSecond)
  for (const one of followers) one.follow()
  $('#lag').textContent = `${state.pending} ch`
  $('#rate').textContent = `${Math.round(state.charsPerSecond)} ch/s`
  requestAnimationFrame(sample)
}

setRunning(false)
requestAnimationFrame(sample)
restart()

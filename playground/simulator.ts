export interface SimulatorOptions {
  /** Characters the producer emits per second, on average. */
  charsPerSecond: number
  /** Mean size of one chunk. */
  chunkChars: number
  /** 0 to 1 - how widely chunk sizes vary around the mean. */
  jitter: number
  /** 0 to 1 - chance of stalling between two chunks. */
  pauseChance: number
  /** How long a stall lasts. */
  pauseMs: number
}

export interface SimulatorHandlers {
  onChunk(delta: string): void
  onEnd(): void
}

export interface Simulator {
  start(): void
  stop(): void
  setOptions(next: Partial<SimulatorOptions>): void
  /** The answer to emit from the next `start()` on. */
  setText(next: string): void
  readonly running: boolean
}

/** Seeded so that two runs with the same settings are genuinely comparable. */
function createRandom(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

/**
 * Stands in for a language model: emits a fixed answer in uneven chunks, at a
 * controllable speed, with configurable stalls.
 */
export function createSimulator(text: string, options: SimulatorOptions, handlers: SimulatorHandlers): Simulator {
  const config = { ...options }
  let at = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let random = createRandom(0x5f3759df)
  let running = false

  function scheduleNext(delayMs: number) {
    timer = setTimeout(emit, delayMs)
  }

  function emit() {
    if (!running) return

    const spread = 1 + config.jitter * (random() * 2 - 1)
    const size = Math.max(1, Math.round(config.chunkChars * spread))
    const chunk = text.slice(at, at + size)
    at += chunk.length
    handlers.onChunk(chunk)

    if (at >= text.length) {
      running = false
      handlers.onEnd()
      return
    }

    const pace = (chunk.length / config.charsPerSecond) * 1000
    const stall = random() < config.pauseChance ? config.pauseMs : 0
    scheduleNext(pace + stall)
  }

  return {
    start() {
      if (running) return
      at = 0
      random = createRandom(0x5f3759df)
      running = true
      scheduleNext(0)
    },
    stop() {
      running = false
      if (timer) clearTimeout(timer)
      timer = null
    },
    setOptions(next) {
      Object.assign(config, next)
    },
    setText(next) {
      text = next
    },
    get running() {
      return running
    },
  }
}

import type { Clock, ManualClock } from './types'

const FRAME_MS = 16

/**
 * requestAnimationFrame where it exists, a timer otherwise. Resolved lazily
 * inside `schedule` so that importing this module in Node touches no DOM global.
 */
export const defaultClock: Clock = {
  now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now()
  },
  schedule(callback) {
    if (typeof requestAnimationFrame === 'function') {
      const handle = requestAnimationFrame(() => callback(defaultClock.now()))
      return () => cancelAnimationFrame(handle)
    }
    const handle = setTimeout(() => callback(defaultClock.now()), FRAME_MS)
    return () => clearTimeout(handle)
  },
}

/**
 * A clock driven by hand. Tests advance time instead of waiting for it, which is
 * the only way to assert on pacing without making the suite slow and flaky.
 *
 * One `advance` runs exactly one wave of callbacks, mirroring rAF: work
 * scheduled from inside a frame lands in the next one, never the current one.
 */
export function createManualClock(startMs = 0): ManualClock {
  let current = startMs
  let nextId = 1
  const pending = new Map<number, (now: number) => void>()

  const runOneWave = () => {
    if (pending.size === 0) return
    const due = [...pending.values()]
    pending.clear()
    for (const callback of due) callback(current)
  }

  return {
    now: () => current,
    schedule(callback) {
      const id = nextId++
      pending.set(id, callback)
      return () => {
        pending.delete(id)
      }
    },
    advance(ms) {
      current += ms
      runOneWave()
    },
    setNow(ms) {
      current = ms
      runOneWave()
    },
  }
}

import type { ResolvedReveal, WaveTimeline } from './types'

type TimelineOptions = Pick<ResolvedReveal, 'staggerMs' | 'maxWaveLagMs'>

/**
 * Behind a queue left by earlier frames, a frame reserves this share of the time
 * that passed, so the queue drains at least half as fast as the clock runs.
 */
const CATCH_UP = 0.5

/**
 * Claims this close together are one frame. Hosts drawing in the same frame each
 * read the clock, a fraction of a millisecond apart; a frame at 240 Hz still
 * lasts 4 ms.
 */
const SAME_FRAME_MS = 2

/**
 * Hands out the start time of every unit that is about to appear.
 *
 * One shared timeline across all hosts is what keeps the wave continuous over
 * chunk and paragraph boundaries, without any component needing to know its
 * position in the overall text. After a silence the queue heals on its own,
 * because `now` overtakes the reserved slot.
 *
 * The stagger shapes a genuine batch - a returning tab, the first frame of an
 * answer, several hosts drawing at once after a pause - and the lag cap keeps
 * even those from queueing a wave that outlives the user's attention. A steady stream is already paced, so
 * one frame never reserves more time than really passed since the previous one,
 * however many hosts claim in it: otherwise units arriving faster than one per
 * stagger would build a queue that never drains, and every word would appear
 * late. Matching the arrival rate only holds a queue steady, though, so a frame
 * behind a queue reserves less than that until the wave catches up with the text.
 */
export function createWaveTimeline(options: TimelineOptions): WaveTimeline {
  const config: TimelineOptions = { staggerMs: options.staggerMs, maxWaveLagMs: options.maxWaveLagMs }
  let next = Number.NEGATIVE_INFINITY
  // Claims of one frame share the time it may reserve.
  let frameAt = Number.NEGATIVE_INFINITY
  let frameTime = Number.POSITIVE_INFINITY

  return {
    claim(count, now) {
      if (count <= 0) return []

      if (Math.abs(now - frameAt) > SAME_FRAME_MS) {
        // As much time as really passed since the previous frame: after a silence
        // that is room for the full stagger, and a clock running backwards gets none.
        frameTime = Math.max(0, now - frameAt) * (next > now ? CATCH_UP : 1)
        frameAt = now
      }

      const start = Math.max(now, Math.min(next, now + config.maxWaveLagMs))
      const step = Math.max(0, Math.min(config.staggerMs, frameTime / count))
      const lagLeft = config.maxWaveLagMs - (start - now)
      const gap = Math.min(step, count > 1 ? Math.max(0, lagLeft / (count - 1)) : Number.POSITIVE_INFINITY)

      const starts: number[] = []
      for (let i = 0; i < count; i++) starts.push(start + i * gap)
      next = starts[count - 1] + step
      frameTime -= step * count
      return starts
    },

    reset() {
      next = Number.NEGATIVE_INFINITY
      frameAt = Number.NEGATIVE_INFINITY
      frameTime = Number.POSITIVE_INFINITY
    },

    setOptions(update) {
      if (update.staggerMs !== undefined) config.staggerMs = update.staggerMs
      if (update.maxWaveLagMs !== undefined) config.maxWaveLagMs = update.maxWaveLagMs
    },
  }
}

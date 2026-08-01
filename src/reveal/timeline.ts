import type { ResolvedReveal, WaveTimeline } from './types'

type TimelineOptions = Pick<ResolvedReveal, 'staggerMs' | 'maxWaveLagMs'>

/**
 * Hands out the start time of every unit that is about to appear.
 *
 * One shared timeline across all hosts is what keeps the wave continuous over
 * chunk and paragraph boundaries, without any component needing to know its
 * position in the overall text. After a silence the queue heals on its own,
 * because `now` overtakes the reserved slot.
 *
 * With a working pacing controller only a word or two arrives per frame, so the
 * stagger is a garnish rather than the source of the wave. Its real job is the
 * occasional genuine batch - a returning tab, a dropped frame - and the lag cap
 * keeps even those from queueing a wave that outlives the user's attention.
 */
export function createWaveTimeline(options: TimelineOptions): WaveTimeline {
  let next = Number.NEGATIVE_INFINITY

  return {
    claim(count, now) {
      if (count <= 0) return []

      const start = Math.max(now, Math.min(next, now + options.maxWaveLagMs))
      const budget = options.maxWaveLagMs - (start - now)
      const stagger = count > 1 ? Math.min(options.staggerMs, Math.max(0, budget / (count - 1))) : options.staggerMs

      const starts: number[] = []
      for (let i = 0; i < count; i++) starts.push(start + i * stagger)
      next = start + count * stagger
      return starts
    },

    reset() {
      next = Number.NEGATIVE_INFINITY
    },
  }
}

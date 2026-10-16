import { describe, expect, it } from 'vitest'
import { createWaveTimeline } from '../src/reveal/timeline'

const options = { staggerMs: 40, maxWaveLagMs: 240 }

describe('createWaveTimeline', () => {
  it('staggers units within one claim', () => {
    expect(createWaveTimeline(options).claim(3, 1000)).toEqual([1000, 1040, 1080])
  })

  it('keeps the wave continuous across separate claims', () => {
    const timeline = createWaveTimeline(options)
    timeline.claim(2, 1000) // takes 1000 and 1040, leaving the next slot at 1080
    expect(timeline.claim(1, 1010)).toEqual([1080])
  })

  it('lets the queue heal after a silence', () => {
    const timeline = createWaveTimeline(options)
    timeline.claim(2, 1000)
    expect(timeline.claim(1, 5000)).toEqual([5000])
  })

  it('compresses the stagger so a large batch cannot queue a long wave', () => {
    const starts = createWaveTimeline(options).claim(100, 0)
    expect(starts[0]).toBe(0)
    expect(starts[99]).toBeLessThanOrEqual(options.maxWaveLagMs)
  })

  it('never starts a unit in the past', () => {
    const timeline = createWaveTimeline(options)
    const starts = timeline.claim(5, 1000)
    for (const start of starts) expect(start).toBeGreaterThanOrEqual(1000)
  })

  it('caps how far ahead the queue can run', () => {
    const timeline = createWaveTimeline(options)
    for (let i = 0; i < 50; i++) timeline.claim(4, 1000)
    expect(timeline.claim(1, 1000)[0]).toBeLessThanOrEqual(1000 + options.maxWaveLagMs)
  })

  it('returns nothing for an empty claim', () => {
    expect(createWaveTimeline(options).claim(0, 1000)).toEqual([])
  })

  it('reset() clears the queue', () => {
    const timeline = createWaveTimeline(options)
    timeline.claim(5, 1000)
    timeline.reset()
    expect(timeline.claim(1, 1010)).toEqual([1010])
  })

  it('does not build a queue under a steady stream of single units', () => {
    const timeline = createWaveTimeline({ staggerMs: 36, maxWaveLagMs: 240 })
    let worst = 0
    for (let frame = 0; frame < 200; frame++) {
      const now = frame * 16
      worst = Math.max(worst, timeline.claim(1, now)[0] - now)
    }
    expect(worst).toBeLessThanOrEqual(36)
  })

  it('keeps the lag bounded when every frame brings several units', () => {
    const timeline = createWaveTimeline({ staggerMs: 36, maxWaveLagMs: 240 })
    const lags: number[] = []
    for (let frame = 0; frame < 200; frame++) {
      const now = frame * 16
      lags.push(timeline.claim(3, now)[0] - now)
    }
    expect(Math.max(...lags.slice(50))).toBeLessThanOrEqual(Math.max(...lags.slice(0, 10)))
    expect(lags[199]).toBeLessThan(options.maxWaveLagMs)
  })

  it('drains the queue a batch leaves behind, even under a steady stream', () => {
    const timeline = createWaveTimeline({ staggerMs: 36, maxWaveLagMs: 240 })
    timeline.claim(20, 0) // a returning tab: the wave now runs up to 240 ms ahead
    const lags: number[] = []
    for (let frame = 1; frame <= 60; frame++) {
      const now = frame * 16
      lags.push(timeline.claim(1, now)[0] - now)
    }
    expect(lags[0]).toBeGreaterThan(200)
    // Never faster than the order allows: a later unit does not start before an earlier one.
    for (let i = 1; i < lags.length; i++) expect(lags[i] + 16).toBeGreaterThanOrEqual(lags[i - 1])
    // Half a second of ordinary stream later, units start as they arrive again.
    expect(lags[lags.length - 1]).toBe(0)
  })

  it('shares a frame between hosts that draw in it, so their queue drains too', () => {
    const timeline = createWaveTimeline({ staggerMs: 36, maxWaveLagMs: 240 })
    timeline.claim(20, 0)
    let worst = 0
    for (let frame = 1; frame <= 100; frame++) {
      const now = frame * 16
      const lags = [timeline.claim(1, now)[0] - now, timeline.claim(1, now)[0] - now]
      if (frame > 60) worst = Math.max(worst, ...lags)
    }
    // At most one frame behind, whichever host drew second.
    expect(worst).toBeLessThanOrEqual(16)
  })

  it('spreads a batch evenly across the hosts that draw it', () => {
    const timeline = createWaveTimeline({ staggerMs: 36, maxWaveLagMs: 240 })
    expect(timeline.claim(3, 1000)).toEqual([1000, 1036, 1072])
    expect(timeline.claim(3, 1000)).toEqual([1108, 1144, 1180])
  })

  it('knows hosts of one frame by their clocks, read a moment apart', () => {
    const timeline = createWaveTimeline({ staggerMs: 36, maxWaveLagMs: 240 })
    expect(timeline.claim(3, 1000)).toEqual([1000, 1036, 1072])
    const second = timeline.claim(3, 1000.05)
    expect(second[1] - second[0]).toBeCloseTo(36)
    expect(second[2] - second[1]).toBeCloseTo(36)
  })

  it('changes its spacing in place', () => {
    const timeline = createWaveTimeline(options)
    timeline.setOptions!({ staggerMs: 100 })
    expect(timeline.claim(2, 0)).toEqual([0, 100])
  })
})

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
})

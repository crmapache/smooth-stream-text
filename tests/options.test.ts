import { describe, expect, it } from 'vitest'
import { createManualClock, createSmoothStream, defaultPacing, resolvePacingOptions } from '../src/index'
import { defaultReveal, resolveRevealOptions } from '../src/dom/index'

const frames = (clock: ReturnType<typeof createManualClock>, count: number, ms = 16) => {
  for (let i = 0; i < count; i++) clock.advance(ms)
}

describe('pacing settings that cannot work', () => {
  it('fall back to the default instead of freezing the stream', () => {
    const resolved = resolvePacingOptions({ adaptMs: Number.NaN, targetLatencyMs: 'fast' as unknown as number })
    expect(resolved.adaptMs).toBe(defaultPacing.adaptMs)
    expect(resolved.targetLatencyMs).toBe(defaultPacing.targetLatencyMs)
  })

  it('a NaN setting no longer leaves a stream drawing forever without moving', () => {
    const clock = createManualClock(0)
    let scheduled = 0
    const counting = { now: clock.now, schedule: (cb: (now: number) => void) => (scheduled++, clock.schedule(cb)) }
    const stream = createSmoothStream({ clock: counting, adaptMs: Number.NaN, boundary: 'char' })
    stream.push('hello')
    frames(clock, 200)
    expect(stream.getState().text).toBe('hello')
    expect(scheduled).toBeLessThan(200)
  })

  it('treat negatives as zero, and refuse a zero or negative ceiling', () => {
    const resolved = resolvePacingOptions({ settleMs: -5, maxCharsPerSecond: 0, minCharsPerSecond: -1 })
    expect(resolved.settleMs).toBe(0)
    expect(resolved.maxCharsPerSecond).toBe(defaultPacing.maxCharsPerSecond)
    expect(resolved.minCharsPerSecond).toBe(0)
  })

  it('keep the floor at or below the ceiling', () => {
    const resolved = resolvePacingOptions({ minCharsPerSecond: 500, maxCharsPerSecond: 100 })
    expect(resolved.minCharsPerSecond).toBe(100)
  })

  it('keep Infinity as a legitimate "never", except for the floor', () => {
    expect(resolvePacingOptions({ maxLatencyMs: Number.POSITIVE_INFINITY }).maxLatencyMs).toBe(Number.POSITIVE_INFINITY)
    expect(resolvePacingOptions({ minCharsPerSecond: Number.POSITIVE_INFINITY }).minCharsPerSecond).toBe(
      defaultPacing.minCharsPerSecond,
    )
  })

  it('an unlimited rate neither hangs on a frame that took no time nor freezes the stream', () => {
    for (const options of [
      { maxCharsPerSecond: Number.POSITIVE_INFINITY, targetLatencyMs: 0 },
      { maxCharsPerSecond: Number.POSITIVE_INFINITY, minCharsPerSecond: Number.POSITIVE_INFINITY },
    ]) {
      const clock = createManualClock(0)
      const stream = createSmoothStream({ clock, boundary: 'char', ...options })
      stream.push('hello')
      clock.advance(0)
      frames(clock, 100)
      expect(stream.getState().text).toBe('hello')
    }
  })

  it('ignore a boundary or clock of the wrong kind', () => {
    const resolved = resolvePacingOptions({ boundary: 'sentences' as never, clock: {} as never })
    expect(resolved.boundary).toBe('markdown')
    expect(resolved.clock).toBe(defaultPacing.clock)
  })

  it('apply to setOptions as well', () => {
    const clock = createManualClock(0)
    const stream = createSmoothStream({ clock, boundary: 'char' })
    stream.setOptions({ adaptMs: Number.NaN })
    stream.push('hi')
    stream.end()
    frames(clock, 100)
    expect(stream.getState().text).toBe('hi')
  })
})

describe('zero settings', () => {
  it('a zero floor means no floor, as in 0.1, and the stream still finishes', () => {
    expect(resolvePacingOptions({ minCharsPerSecond: 0 }).minCharsPerSecond).toBe(0)
    const clock = createManualClock(0)
    const stream = createSmoothStream({ clock, boundary: 'char', minCharsPerSecond: 0 })
    stream.push('hello world')
    frames(clock, 100)
    expect(stream.getState().text).toBe('hello world')
    stream.push(' and more')
    stream.end()
    frames(clock, 100)
    expect(stream.getState()).toMatchObject({ text: 'hello world and more', phase: 'done' })
  })

  it('a zero hold cap keeps the fractional progress of a slow stream', () => {
    const clock = createManualClock(0)
    const stream = createSmoothStream({
      clock,
      boundary: 'char',
      holdChars: 0,
      minCharsPerSecond: 1,
      maxCharsPerSecond: 1,
      maxLatencyMs: 100000,
    })
    stream.push('hello')
    frames(clock, 100)
    expect(stream.getState().cursor).toBeGreaterThan(0)
  })

  it('zero inertia survives a frame that took no time', () => {
    const clock = createManualClock(0)
    const stream = createSmoothStream({ clock, boundary: 'char', adaptMs: 0 })
    stream.push('hello world')
    clock.advance(0)
    stream.push(' more')
    frames(clock, 100)
    expect(stream.getState().text).toBe('hello world more')
  })
})

describe('reveal settings', () => {
  it('count animated units in whole numbers, so a fraction cannot switch the cap off', () => {
    expect(resolveRevealOptions({ maxAnimatedUnits: 2.5 }).maxAnimatedUnits).toBe(2)
    expect(resolveRevealOptions({ maxAnimatedUnits: Number.POSITIVE_INFINITY }).maxAnimatedUnits).toBe(
      Number.POSITIVE_INFINITY,
    )
  })

  it('fall back to the default when unusable', () => {
    const resolved = resolveRevealOptions({ durationMs: Number.NaN, unit: 'line' as never, staggerMs: -4 })
    expect(resolved.durationMs).toBe(defaultReveal.durationMs)
    expect(resolved.unit).toBe('char')
    expect(resolved.staggerMs).toBe(0)
  })
})

describe('manual clock', () => {
  it('skips a callback cancelled earlier in the same wave', () => {
    const clock = createManualClock(0)
    let calls = 0
    let cancel: () => void = () => {}
    clock.schedule(() => cancel())
    cancel = clock.schedule(() => calls++)
    clock.advance(16)
    expect(calls).toBe(0)
  })

  it('still runs work scheduled inside a wave in the next one', () => {
    const clock = createManualClock(0)
    const order: string[] = []
    clock.schedule(() => {
      order.push('first')
      clock.schedule(() => order.push('next wave'))
    })
    clock.advance(16)
    expect(order).toEqual(['first'])
    clock.advance(16)
    expect(order).toEqual(['first', 'next wave'])
  })
})

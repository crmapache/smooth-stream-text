import { describe, expect, it } from 'vitest'
import { createPacerState, effectiveTargetLatency, stepPacer } from '../src/core/pacer'
import { resolvePacingOptions } from '../src/core/options'

const opts = resolvePacingOptions()
const open = { closed: false as const, msSinceLastInput: 0, msSinceClose: Number.POSITIVE_INFINITY }

describe('effectiveTargetLatency', () => {
  it('is the configured target while the stream is live', () => {
    expect(effectiveTargetLatency({ ...open, pending: 100, dtMs: 16 }, opts)).toBe(opts.targetLatencyMs)
  })

  it('decays to zero across the settle window after close', () => {
    const half = effectiveTargetLatency(
      { pending: 100, dtMs: 16, closed: true, msSinceLastInput: 0, msSinceClose: opts.settleMs / 2 },
      opts,
    )
    expect(half).toBeCloseTo(opts.targetLatencyMs / 2, 5)

    const done = effectiveTargetLatency(
      { pending: 100, dtMs: 16, closed: true, msSinceLastInput: 0, msSinceClose: opts.settleMs },
      opts,
    )
    expect(done).toBe(0)
  })

  it('decays the same way after idle silence on a still-open stream', () => {
    const during = effectiveTargetLatency(
      {
        pending: 100,
        dtMs: 16,
        closed: false,
        msSinceLastInput: opts.idleGraceMs + opts.settleMs / 2,
        msSinceClose: Number.POSITIVE_INFINITY,
      },
      opts,
    )
    expect(during).toBeCloseTo(opts.targetLatencyMs / 2, 5)

    const after = effectiveTargetLatency(
      {
        pending: 100,
        dtMs: 16,
        closed: false,
        msSinceLastInput: opts.idleGraceMs + opts.settleMs,
        msSinceClose: Number.POSITIVE_INFINITY,
      },
      opts,
    )
    expect(after).toBe(0)
  })

  it('is unaffected by silence shorter than the grace period', () => {
    const t = effectiveTargetLatency(
      {
        pending: 100,
        dtMs: 16,
        closed: false,
        msSinceLastInput: opts.idleGraceMs - 1,
        msSinceClose: Number.POSITIVE_INFINITY,
      },
      opts,
    )
    expect(t).toBe(opts.targetLatencyMs)
  })
})

describe('stepPacer', () => {
  it('starts at the minimum rate so the first characters are not delayed', () => {
    expect(createPacerState(opts).rate).toBeCloseTo(opts.minCharsPerSecond / 1000, 8)
  })

  it('never exceeds the configured ceiling', () => {
    let state = createPacerState(opts)
    for (let i = 0; i < 500; i++) state = stepPacer(state, { ...open, pending: 1e6, dtMs: 16 }, opts)
    expect(state.rate).toBeLessThanOrEqual(opts.maxCharsPerSecond / 1000 + 1e-9)
  })

  it('never drops below the configured floor while work remains', () => {
    let state = createPacerState(opts)
    for (let i = 0; i < 500; i++) state = stepPacer(state, { ...open, pending: 1, dtMs: 16 }, opts)
    expect(state.rate).toBeGreaterThanOrEqual(opts.minCharsPerSecond / 1000 - 1e-9)
  })

  it('moves only a fraction of the way towards a new rate in one frame', () => {
    // A backlog of 90 chars over a 180 ms target wants 500 chars/s, well inside
    // the clamps, so what is measured here is the smoothing and nothing else.
    const wanted = 90 / opts.targetLatencyMs
    const start = createPacerState(opts)
    const state = stepPacer(start, { ...open, pending: 90, dtMs: 16 }, opts)
    const travelled = (state.rate - start.rate) / (wanted - start.rate)
    expect(travelled).toBeGreaterThan(0)
    expect(travelled).toBeLessThan(0.25)
  })

  it('caps a burst at the ceiling instead of dumping it', () => {
    // 2000 pending characters want ~11000 chars/s, so the ceiling is what keeps
    // the frame sane - roughly a couple of words, not a wall of text.
    const state = stepPacer(createPacerState(opts), { ...open, pending: 2000, dtMs: 16 }, opts)
    expect(state.exact).toBeLessThanOrEqual((opts.maxCharsPerSecond / 1000) * 16)
    expect(state.exact).toBeLessThan(20)
  })

  it('converges on the rate that drains the backlog over the target latency', () => {
    let state = createPacerState(opts)
    for (let i = 0; i < 300; i++) state = stepPacer(state, { ...open, pending: 90, dtMs: 16 }, opts)
    expect(state.rate).toBeCloseTo(90 / opts.targetLatencyMs, 3)
  })

  it('goes to full speed once the target latency has decayed to zero', () => {
    const state = stepPacer(
      createPacerState(opts),
      { pending: 500, dtMs: 16, closed: true, msSinceLastInput: 0, msSinceClose: opts.settleMs },
      opts,
    )
    expect(state.rate).toBeCloseTo(opts.maxCharsPerSecond / 1000, 8)
  })

  it('carries the fractional cursor so slow rates do not lose characters', () => {
    const slow = { ...opts, minCharsPerSecond: 10, maxCharsPerSecond: 10 }
    let state = createPacerState(slow)
    for (let i = 0; i < 100; i++) state = stepPacer(state, { ...open, pending: 100, dtMs: 10 }, slow)
    expect(state.exact).toBeCloseTo(10, 5) // 10 chars per second, for 1000 ms
  })

  it('starts the fractional cursor wherever it is told to', () => {
    expect(createPacerState(opts, 42).exact).toBe(42)
  })
})

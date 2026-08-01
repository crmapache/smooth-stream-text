import type { ResolvedPacing } from './types'

export interface PacerState {
  /** Characters per millisecond. */
  rate: number
  /** Fractional cursor, so a slow rate does not lose characters to rounding. */
  exact: number
}

export interface PacerInput {
  pending: number
  dtMs: number
  closed: boolean
  msSinceLastInput: number
  /** `Infinity` while the stream is open. */
  msSinceClose: number
}

export function createPacerState(opts: ResolvedPacing, cursor = 0): PacerState {
  // Starting at the floor rather than zero keeps the very first characters from
  // waiting on the smoothing curve to spin up.
  return { rate: opts.minCharsPerSecond / 1000, exact: cursor }
}

/**
 * How far behind live text we are currently aiming to run.
 *
 * While the producer is live this is simply the configured target. Once it stops
 * - closed outright, or silent for longer than the grace period - the target
 * decays to zero across the settle window, which is what turns the tail into a
 * gentle acceleration into a full stop instead of a stall.
 */
export function effectiveTargetLatency(input: PacerInput, opts: ResolvedPacing): number {
  const elapsed = input.closed ? input.msSinceClose : input.msSinceLastInput - opts.idleGraceMs
  if (elapsed <= 0) return opts.targetLatencyMs
  if (opts.settleMs <= 0) return 0
  return opts.targetLatencyMs * Math.max(0, 1 - elapsed / opts.settleMs)
}

/**
 * One tick of the controller.
 *
 * The rate we want is the one that would drain the current backlog over the
 * target latency, so the display keeps a constant distance behind live text
 * whatever the producer's speed - no per-model tuning. That rate is then reached
 * through exponential smoothing rather than applied directly, which is what
 * turns a twenty-word burst into a visible acceleration instead of a dump.
 */
export function stepPacer(state: PacerState, input: PacerInput, opts: ResolvedPacing): PacerState {
  const target = effectiveTargetLatency(input, opts)
  const min = opts.minCharsPerSecond / 1000
  const max = opts.maxCharsPerSecond / 1000

  const desired = target > 0 ? input.pending / target : Number.POSITIVE_INFINITY
  const alpha = 1 - Math.exp(-input.dtMs / opts.adaptMs)

  let rate = Number.isFinite(desired) ? state.rate + (desired - state.rate) * alpha : max
  rate = Math.min(max, Math.max(min, rate))

  return { rate, exact: state.exact + rate * input.dtMs }
}

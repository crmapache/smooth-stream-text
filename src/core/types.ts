import type { BoundaryMode } from './boundary'

export type { BoundaryFn, BoundaryMode } from './boundary'

/**
 * The time source the engine runs on. Injecting it is what makes every pacing
 * test deterministic and instant - see `createManualClock`.
 */
export interface Clock {
  now(): number
  /** Schedules one callback for the next frame; returns a cancel function. */
  schedule(callback: (now: number) => void): () => void
}

export interface ManualClock extends Clock {
  advance(ms: number): void
  setNow(ms: number): void
}

export interface PacingOptions {
  /** How far behind the live text the display runs, in ms. The main feel knob. */
  targetLatencyMs?: number
  /** Time constant for smoothing the rate. Larger means lazier acceleration. */
  adaptMs?: number
  minCharsPerSecond?: number
  maxCharsPerSecond?: number
  /** How long the tail takes to drain once the producer stops. */
  settleMs?: number
  /** Silence tolerated before the tail drains anyway, on a still-open stream. */
  idleGraceMs?: number
  /** Above this projected lag the display jumps instead of trying to catch up. */
  maxLatencyMs?: number
  /** Per-tick clamp on elapsed time, so a stalled frame cannot cause one big jump. */
  maxFrameMs?: number
  /** Where the cursor is allowed to stop. */
  boundary?: BoundaryMode
  /**
   * How long the producer must be silent before a held construct is released.
   *
   * Measured from the last input rather than from the start of the hold: a
   * producer stalling mid-link should not cause the half-written URL to appear.
   * Silence past this means the closing delimiter is never coming.
   */
  holdMs?: number
  /** Most characters a boundary may hold back before it is released anyway. */
  holdChars?: number
  clock?: Clock
}

export type ResolvedPacing = Required<PacingOptions>

export type StreamPhase = 'idle' | 'streaming' | 'settling' | 'done'

export interface SmoothState {
  /** The smoothed visible prefix. */
  text: string
  /** How many characters of the source are visible. */
  cursor: number
  /** Everything received so far. */
  source: string
  /** `source.length - cursor`. */
  pending: number
  phase: StreamPhase
  /** The controller's current rate, for demos and debugging. */
  charsPerSecond: number
}

export interface SmoothStream {
  /** Append a delta. Interchangeable with `setSource`. */
  push(delta: string): void
  /** Hand over the growing full string. Interchangeable with `push`. */
  setSource(text: string): void
  /**
   * The producer closed the stream: drain the tail and stop. Text arriving after
   * this reopens the stream, so one instance serves a whole conversation.
   */
  end(): void
  /** Start over. With `text`, start fully revealed - use this for chat history. */
  reset(text?: string): void
  /** Reveal everything right now. */
  flush(): void
  /**
   * Stop drawing without losing anything: nothing is on screen to draw on right
   * now. Text may still arrive while paused - it waits in the buffer.
   *
   * This is what a view detaching should call, rather than `destroy`, so that the
   * same instance survives a remount - React's StrictMode, an `<Activity>` boundary,
   * a kept-alive Vue component.
   */
  pause(): void
  /** Draw again after `pause`, carrying on from wherever the cursor stopped. */
  resume(): void
  /** Change the feel at runtime. `clock` is fixed at creation and is ignored here. */
  setOptions(next: Partial<PacingOptions>): void
  getState(): SmoothState
  subscribe(listener: (state: SmoothState) => void): () => void
  /** Release the stream for good. A destroyed stream ignores everything. */
  destroy(): void
}

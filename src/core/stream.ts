import { createBoundaryResolver } from './boundary'
import { clampToGraphemeBoundary } from './grapheme'
import { resolvePacingOptions } from './options'
import { createPacerState, stepPacer, type PacerState } from './pacer'
import type { PacingOptions, SmoothState, SmoothStream, StreamPhase } from './types'

/**
 * Buffers incoming text and releases it at a visually even rate.
 *
 * Feed it either way - `push` for deltas, `setSource` for a growing full string -
 * and read `text` off the state. The two inputs are interchangeable and produce
 * identical output at identical times.
 */
export function createSmoothStream(options?: PacingOptions): SmoothStream {
  const opts = resolvePacingOptions(options)
  const { clock } = opts
  let resolver = createBoundaryResolver(opts.boundary)

  let source = ''
  let cursor = 0
  let pacer: PacerState = createPacerState(opts)
  let closed = false
  let closedAt = Number.POSITIVE_INFINITY
  let lastInputAt = clock.now()
  let lastTickAt = clock.now()
  let holdStartedAt = Number.POSITIVE_INFINITY
  let destroyed = false

  let cancelTick: (() => void) | null = null
  const listeners = new Set<(state: SmoothState) => void>()

  function phaseOf(): StreamPhase {
    if (closed) return cursor >= source.length ? 'done' : 'settling'
    return source.length === 0 ? 'idle' : 'streaming'
  }

  function buildState(): SmoothState {
    return {
      text: source.slice(0, cursor),
      cursor,
      source,
      pending: source.length - cursor,
      phase: phaseOf(),
      charsPerSecond: pacer.rate * 1000,
    }
  }

  let state = buildState()

  function emit(): void {
    state = buildState()
    for (const listener of listeners) listener(state)
  }

  function schedule(): void {
    if (destroyed || cancelTick) return
    cancelTick = clock.schedule(tick)
  }

  function stopTicking(): void {
    cancelTick?.()
    cancelTick = null
  }

  /** Jump straight to the end of everything received. */
  function finish(now: number): void {
    cursor = source.length
    pacer = { rate: pacer.rate, exact: cursor }
    holdStartedAt = Number.POSITIVE_INFINITY
    lastTickAt = now
  }

  function advance(now: number, dt: number): void {
    const pending = source.length - cursor
    const projectedLagMs = pending / (opts.maxCharsPerSecond / 1000)
    const pastDeadline = closed && now - closedAt > opts.settleMs * 2

    // Too far behind to catch up gracefully - a returning hidden tab, or a whole
    // message handed over at once. Jumping beats crawling.
    if (projectedLagMs > opts.maxLatencyMs || pastDeadline) {
      finish(now)
      return
    }

    pacer = stepPacer(
      pacer,
      {
        pending,
        dtMs: dt,
        closed,
        msSinceLastInput: now - lastInputAt,
        msSinceClose: closed ? now - closedAt : Number.POSITIVE_INFINITY,
      },
      opts,
    )

    const desired = Math.min(Math.floor(pacer.exact), source.length)
    let next = resolver.resolve(source, desired, closed)

    if (next < desired) {
      if (holdStartedAt === Number.POSITIVE_INFINITY) holdStartedAt = now
      const heldTooLong = now - holdStartedAt > opts.holdMs
      const heldTooMuch = desired - next > opts.holdChars
      // A briefly literal `**` beats a frozen stream.
      if (heldTooLong || heldTooMuch) next = clampToGraphemeBoundary(source, desired)
    } else {
      holdStartedAt = Number.POSITIVE_INFINITY
    }

    if (next > cursor) cursor = next
    // While held, pin the fractional cursor so that releasing does not dump a
    // backlog that piled up invisibly.
    if (cursor < desired) pacer = { rate: pacer.rate, exact: cursor }
  }

  function tick(now: number): void {
    cancelTick = null
    if (destroyed) return

    const dt = Math.min(Math.max(now - lastTickAt, 0), opts.maxFrameMs)
    lastTickAt = now

    const beforeCursor = cursor
    if (source.length > cursor) advance(now, dt)

    if (cursor !== beforeCursor || phaseOf() !== state.phase) emit()
    if (source.length > cursor) schedule()
  }

  function resetTo(text?: string): void {
    stopTicking()
    resolver.reset()
    source = text ?? ''
    cursor = source.length
    pacer = createPacerState(opts, cursor)
    closed = false
    closedAt = Number.POSITIVE_INFINITY
    holdStartedAt = Number.POSITIVE_INFINITY
    lastInputAt = clock.now()
    lastTickAt = lastInputAt
  }

  function onInput(): void {
    lastInputAt = clock.now()
    emit()
    if (source.length > cursor) schedule()
  }

  return {
    push(delta) {
      if (destroyed || !delta) return
      source += delta
      onInput()
    },

    setSource(text) {
      if (destroyed || text === source) return
      if (!text.startsWith(source)) {
        // A shorter or different answer means a regeneration, not a continuation.
        resetTo()
      }
      source = text
      onInput()
    },

    end() {
      if (destroyed || closed) return
      closed = true
      closedAt = clock.now()
      emit()
      if (source.length > cursor) schedule()
    },

    reset(text) {
      if (destroyed) return
      resetTo(text)
      emit()
    },

    flush() {
      if (destroyed || cursor >= source.length) return
      finish(clock.now())
      stopTicking()
      emit()
    },

    setOptions(next) {
      if (destroyed) return
      const boundaryChanged = next.boundary !== undefined && next.boundary !== opts.boundary
      Object.assign(opts, resolvePacingOptions({ ...opts, ...next, clock }))
      if (boundaryChanged) resolver = createBoundaryResolver(opts.boundary)
    },

    getState: () => state,

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    destroy() {
      destroyed = true
      stopTicking()
      listeners.clear()
    },
  }
}

import { createBoundaryResolver, safeCut, stopsAtWords } from './boundary'
import { clampToGraphemeBoundary, clusterEnd } from './grapheme'
import { settledWords } from './words'
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
  // What was asked for is kept apart from what is in effect: a value that had to
  // give way to another, a floor above the ceiling, comes back with it.
  let given: PacingOptions = { ...options }
  const opts = resolvePacingOptions(given)
  const { clock } = opts
  let resolver = createBoundaryResolver(opts.boundary, opts.unit)

  let source = ''
  let cursor = 0
  let pacer: PacerState = createPacerState(opts)
  let closed = false
  let closedAt = Number.POSITIVE_INFINITY
  let lastInputAt = clock.now()
  let lastTickAt = clock.now()
  let destroyed = false
  let paused = false

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

  /**
   * Whether waiting alone can still show more. Holds give way with time, but half
   * of a surrogate pair at the end of an open stream is never shown on its own:
   * until the other half or the end arrives, frames would only burn battery.
   * Every input schedules again, so a sleeping stream wakes on its own.
   */
  function hasWork(): boolean {
    return cursor < safeCut(source, source.length, closed, true)
  }

  function schedule(): void {
    if (destroyed || paused || cancelTick || !hasWork()) return
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

    // When whole words are the unit, the last word of a live stream may still be
    // growing, so it is held like any other unfinished construct until the
    // producer has been silent for `holdMs`: a model pausing mid-word must not
    // leave half of it on screen. Character by character only the last cluster is
    // at stake, which needs no more than the grace period.
    const holdsWords = stopsAtWords(opts.boundary, opts.unit)
    const quiet = closed || now - lastInputAt > (holdsWords ? opts.holdMs : opts.idleGraceMs)
    const desired = Math.min(Math.floor(pacer.exact), source.length)
    let next = resolver.resolve(source, desired, closed, quiet)

    if (next < desired) {
      // Time is measured from the last input, not from the start of the hold. A
      // producer that stalls mid-link has not frozen anything we control, and
      // releasing then would show the half-written URL the hold exists to hide.
      // Silence past the cap means the closer is simply never coming.
      const abandoned = now - lastInputAt > opts.holdMs
      // Whole words in a script without spaces also wait while the dictionary may
      // still change its mind about the last ones. That is the text being
      // unfinished, like its last cluster, not a construct we hold back - so it
      // neither counts against the cap nor is released by it.
      const decided = holdsWords ? Math.min(desired, settledWords(source, quiet)) : desired
      const heldTooMuch = decided - next > opts.holdChars
      // A briefly literal `**` beats a stream frozen by us.
      if (abandoned || heldTooMuch) next = Math.max(next, safeCut(source, decided, closed, quiet))
    }

    if (next > cursor) cursor = next

    // While a boundary holds us, the fractional cursor must keep moving: it is what
    // eventually reaches the position where the hold is satisfied - the closing
    // `**`, the end of the table row. Pinning it here would stall that forever and
    // leave the release cap to dump text mid-delimiter. It only needs a ceiling, so
    // that a release cannot reveal more at once than the cap already allows - one
    // character above it, so that even a zero cap keeps fractional progress, and
    // never less than the end of the cluster the cursor is in, or an emoji longer
    // than the cap could never be crossed. The cursor itself sits inside one when
    // a pause showed what had arrived and the cluster then grew.
    const ceiling = cursor + opts.holdChars + 1
    if (pacer.exact > ceiling) {
      const clusterDone = clusterEnd(source, clampToGraphemeBoundary(source, cursor))
      pacer = { rate: pacer.rate, exact: Math.min(pacer.exact, Math.max(ceiling, clusterDone)) }
    }
  }

  function tick(now: number): void {
    cancelTick = null
    if (destroyed) return

    const dt = Math.min(Math.max(now - lastTickAt, 0), opts.maxFrameMs)
    lastTickAt = now

    const beforeCursor = cursor
    if (hasWork()) advance(now, dt)

    if (cursor !== beforeCursor || phaseOf() !== state.phase) emit()
    schedule()
  }

  function resetTo(text?: string): void {
    stopTicking()
    resolver.reset()
    source = text ?? ''
    cursor = source.length
    pacer = createPacerState(opts, cursor)
    closed = false
    closedAt = Number.POSITIVE_INFINITY
    lastInputAt = clock.now()
    lastTickAt = lastInputAt
  }

  /**
   * The producer is talking again after saying it was finished.
   *
   * One stream per view is the normal shape - a chat panel keeps the same
   * instance for every message it will ever show - so `end()` marks the end of an
   * answer, not the end of the stream. Without this the settle deadline for the
   * previous answer is long past, and everything after it would jump into place.
   */
  function reopen(): void {
    if (!closed) return
    closed = false
    closedAt = Number.POSITIVE_INFINITY
  }

  function onInput(): void {
    const now = clock.now()
    // Time spent asleep is not a frame that went slowly: without this the first
    // tick after a quiet spell would be charged for the whole silence.
    if (!cancelTick) lastTickAt = now
    lastInputAt = now
    emit()
    schedule()
  }

  return {
    push(delta) {
      if (destroyed || !delta) return
      reopen()
      source += delta
      onInput()
    },

    setSource(text) {
      if (destroyed || text === source) return
      if (!text.startsWith(source)) {
        // A shorter or different answer means a regeneration, not a continuation.
        resetTo()
      }
      reopen()
      source = text
      onInput()
    },

    end() {
      if (destroyed || closed) return
      closed = true
      closedAt = clock.now()
      // Like any input, closing may wake a sleeping stream.
      if (!cancelTick) lastTickAt = closedAt
      emit()
      schedule()
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

    pause() {
      if (destroyed || paused) return
      paused = true
      stopTicking()
    },

    resume() {
      if (destroyed || !paused) return
      paused = false
      lastTickAt = clock.now()
      schedule()
    },

    setOptions(next) {
      if (destroyed) return
      const before = { boundary: opts.boundary, unit: opts.unit }
      given = { ...given, ...next }
      Object.assign(opts, resolvePacingOptions({ ...given, clock }))
      if (opts.boundary !== before.boundary || opts.unit !== before.unit) {
        resolver = createBoundaryResolver(opts.boundary, opts.unit)
      }
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

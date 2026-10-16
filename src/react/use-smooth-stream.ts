import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { changedOptions } from '../core/options'
import { createSmoothStream } from '../core/stream'
import { createSourceSync } from '../core/sync'
import type { PacingOptions, SmoothState, SmoothStream, StreamPhase } from '../core/types'

export interface SmoothStreamControls {
  flush(): void
  reset(text?: string): void
  setOptions(next: Partial<PacingOptions>): void
}

export interface SmoothStreamController extends SmoothState, SmoothStreamControls {
  push(delta: string): void
  setSource(text: string): void
  end(): void
}

function useStream(options: PacingOptions | undefined): SmoothStream {
  const [stream] = useState(() => createSmoothStream(options))

  // Pause rather than destroy: StrictMode mounts, unmounts and mounts again, and
  // the stream itself lives in state across all three. Tearing it down on the
  // first unmount would hand the second mount a dead engine, and the text would
  // never move again. Paused it simply stops drawing while nothing is watching.
  useEffect(() => {
    stream.resume()
    return () => stream.pause()
  }, [stream])

  // The settings follow the props as they change, so one changed through
  // `setOptions` stays until its own prop changes. Only the clock is fixed at
  // creation - the stream ignores it here.
  // A copy, so that an object the app changes in place still shows what changed.
  const applied = useRef(options && { ...options })
  useEffect(() => {
    const next = options && { ...options }
    const changes = changedOptions(applied.current, next)
    applied.current = next
    if (changes) stream.setOptions(changes)
  })

  return stream
}

function useStreamState(stream: SmoothStream): SmoothState {
  const subscribe = useCallback((onChange: () => void) => stream.subscribe(onChange), [stream])
  const snapshot = useCallback(() => stream.getState(), [stream])
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

function useControls(stream: SmoothStream): SmoothStreamControls {
  return {
    flush: useCallback(() => stream.flush(), [stream]),
    reset: useCallback((text?: string) => stream.reset(text), [stream]),
    setOptions: useCallback((next: Partial<PacingOptions>) => stream.setOptions(next), [stream]),
  }
}

/**
 * Turns a growing string into a smoothed one. This is the headless path: take
 * `text`, then parse and render it however you already do.
 *
 * ```tsx
 * const { text, phase } = useSmoothStream(answer, { done: !isStreaming })
 * ```
 *
 * One hook serves any number of answers: a message that is already `done` when
 * it first arrives - history - appears at once, a new answer starts over, and
 * `done` closes whichever answer is current, even when its last chunk lands
 * after `done` was set.
 */
export function useSmoothStream(
  source: string,
  options?: PacingOptions & { done?: boolean },
): SmoothState & SmoothStreamControls {
  const stream = useSyncedStream(source, options)
  return { ...useStreamState(stream), ...useControls(stream) }
}

/** The stream behind both string hooks, fed the latest `(source, done)` pair. */
function useSyncedStream(source: string, options: (PacingOptions & { done?: boolean }) | undefined): SmoothStream {
  const { done = false, ...pacing } = options ?? {}
  const stream = useStream(pacing)
  // Created during the first render, so finished text is already there for the
  // server pass and the first paint.
  const [sync] = useState(() => {
    const created = createSourceSync(stream)
    if (done) created.apply(source, true)
    return created
  })

  useEffect(() => {
    sync.apply(source, done)
  }, [sync, source, done])

  return stream
}

export interface SmoothText extends SmoothStreamControls {
  text: string
  phase: StreamPhase
}

/**
 * `useSmoothStream` for when the text is all you render - the usual case with a
 * markdown renderer. It re-renders only when the visible text or the phase
 * changes, not for every chunk that arrives, so an expensive parse runs once
 * per visible step instead.
 *
 * ```tsx
 * const { text } = useSmoothText(answer, { done: !isStreaming })
 * return <Markdown>{text}</Markdown>
 * ```
 */
export function useSmoothText(source: string, options?: PacingOptions & { done?: boolean }): SmoothText {
  const stream = useSyncedStream(source, options)
  const subscribe = useCallback((onChange: () => void) => stream.subscribe(onChange), [stream])
  // Two plain strings rather than one state object: React compares snapshots by
  // value for strings, so a chunk that changes neither renders nothing.
  const readText = useCallback(() => stream.getState().text, [stream])
  const readPhase = useCallback(() => stream.getState().phase, [stream])
  const text = useSyncExternalStore(subscribe, readText, readText)
  const phase = useSyncExternalStore(subscribe, readPhase, readPhase)
  return { text, phase, ...useControls(stream) }
}

/**
 * The same engine, fed by deltas instead of a growing string. Use this when your
 * transport hands you chunks and you would rather not accumulate them yourself.
 */
export function useSmoothStreamController(options?: PacingOptions): SmoothStreamController {
  const stream = useStream(options)
  const state = useStreamState(stream)

  return {
    ...state,
    ...useControls(stream),
    push: useCallback((delta: string) => stream.push(delta), [stream]),
    setSource: useCallback((text: string) => stream.setSource(text), [stream]),
    end: useCallback(() => stream.end(), [stream]),
  }
}

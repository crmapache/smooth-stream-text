import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { createSmoothStream } from '../core/stream'
import type { PacingOptions, SmoothState, SmoothStream } from '../core/types'

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

function useStream(options: PacingOptions | undefined, seed?: string): SmoothStream {
  const [stream] = useState(() => {
    const created = createSmoothStream(options)
    // Already-finished text must appear instantly - that is what makes rendering
    // an existing conversation cheap instead of replaying every message.
    if (seed) created.reset(seed)
    return created
  })

  // Pause rather than destroy: StrictMode mounts, unmounts and mounts again, and
  // the stream itself lives in state across all three. Tearing it down on the
  // first unmount would hand the second mount a dead engine, and the text would
  // never move again. Paused it simply stops drawing while nothing is watching.
  useEffect(() => {
    stream.resume()
    return () => stream.pause()
  }, [stream])

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
 */
export function useSmoothStream(
  source: string,
  options?: PacingOptions & { done?: boolean },
): SmoothState & SmoothStreamControls {
  const { done, ...pacing } = options ?? {}
  const stream = useStream(pacing, done ? source : undefined)
  const state = useStreamState(stream)

  useEffect(() => {
    stream.setSource(source)
  }, [stream, source])

  useEffect(() => {
    if (done) stream.end()
  }, [stream, done])

  return { ...state, ...useControls(stream) }
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

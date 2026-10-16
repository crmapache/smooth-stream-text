import { createSmoothStream } from '../core/stream'
import { createSourceSync, type SourceSync, type SyncTarget } from '../core/sync'
import type { PacingOptions, SmoothState } from '../core/types'
import type { RevealDeps, RevealOptions } from '../reveal/types'
import { createReveal } from './reveal'

export type SmoothTextOptions = PacingOptions & RevealOptions & RevealDeps

export interface SmoothTextHandle {
  push(delta: string): void
  setText(text: string): void
  end(): void
  reset(text?: string): void
  flush(): void
  /** Stop drawing without losing anything - the element is out of view or detached. */
  pause(): void
  /** Draw again after `pause`, carrying on from where it stopped. */
  resume(): void
  setOptions(next: Partial<SmoothTextOptions>): void
  subscribe(listener: (state: SmoothState) => void): () => void
  /**
   * Called once per answer, when it is closed, fully paced and no word is still
   * animating - the moment it is completely on screen. A paused handle calls it
   * on `resume`; an answer replaced, or whose handle is destroyed, before then is
   * never announced. Returns an unsubscribe function.
   */
  onSettled(listener: () => void): () => void
  /** Whether the current answer is completely on screen; see `onSettled`. Never while paused. */
  readonly settled: boolean
  /** Release everything for good. The text stays on screen; later calls do nothing. */
  destroy(): void
  readonly state: SmoothState
}

/** Pacing and reveal wired together - the one-liner for plain JavaScript. */
export function createSmoothText(element: HTMLElement, options?: SmoothTextOptions): SmoothTextHandle {
  const stream = createSmoothStream(options)
  const reveal = createReveal(element, options)
  const settledListeners = new Set<() => void>()
  let announced = false
  let paused = false
  let destroyed = false

  const isSettled = () => !paused && stream.getState().phase === 'done' && !reveal.animating

  /**
   * Re-arms on every new answer, and announces each one once. A paused handle
   * keeps the announcement for when it is drawn again: until then the answer is
   * not on screen at all.
   */
  function checkSettled(): void {
    if (stream.getState().phase !== 'done') {
      announced = false
      return
    }
    if (announced || !isSettled()) return
    announced = true
    for (const listener of [...settledListeners]) listener()
  }

  // The first update seeds without animating, which is exactly right: whatever is
  // already there was already on screen.
  reveal.update(stream.getState().text)
  const unsubscribe = stream.subscribe((state) => {
    reveal.update(state.text)
    checkSettled()
  })
  const stopIdle = reveal.onIdle(checkSettled)

  return {
    push(delta) {
      if (!destroyed) stream.push(delta)
    },

    setText(text) {
      if (!destroyed) stream.setSource(text)
    },

    end() {
      if (!destroyed) stream.end()
    },

    reset(text) {
      if (destroyed) return
      // An answer being replaced is leaving the screen, so it is never announced -
      // not even when tearing down its animation is what finishes it. The stream
      // re-arms the announcement for the new one as it resets.
      announced = true
      // The reveal first, so the text the stream announces is already in place
      // and is not mistaken for something to animate.
      reveal.reset(text)
      stream.reset(text)
    },

    flush() {
      if (destroyed) return
      stream.flush()
      reveal.flush()
      checkSettled()
    },

    pause() {
      if (destroyed || paused) return
      paused = true
      stream.pause()
      // Nothing is watching, so whatever was animating may as well be finished.
      reveal.flush()
    },

    resume() {
      if (destroyed || !paused) return
      paused = false
      stream.resume()
      checkSettled()
    },

    setOptions(next) {
      if (destroyed) return
      stream.setOptions(next)
      reveal.setOptions(next)
    },

    subscribe: (listener) => stream.subscribe(listener),

    onSettled(listener) {
      settledListeners.add(listener)
      return () => {
        settledListeners.delete(listener)
      }
    },

    get settled() {
      return isSettled()
    },

    destroy() {
      if (destroyed) return
      destroyed = true
      unsubscribe()
      stopIdle()
      settledListeners.clear()
      stream.destroy()
      reveal.destroy()
    },

    get state() {
      return stream.getState()
    },
  }
}

/** The handle seen as a sync target, so the bindings can share one sync rule. */
export function syncTargetOf(handle: SmoothTextHandle): SyncTarget {
  return {
    getState: () => handle.state,
    setSource: (text) => handle.setText(text),
    reset: (text) => handle.reset(text),
    end: () => handle.end(),
  }
}

/** The answer each handle made by `rebindSmoothText` announced last. */
const announcedBy = new WeakMap<SmoothTextHandle, string>()

/**
 * A handle on `element` that takes over from `previous`, whose element is gone -
 * a binding rendering into a new host, as when `as` changes. The text already on
 * screen carries over without replaying. With no previous handle it is simply
 * the first one.
 */
export function rebindSmoothText(
  element: HTMLElement,
  options: SmoothTextOptions | undefined,
  previous: SmoothTextHandle | null,
  onSettled: () => void,
): { handle: SmoothTextHandle; sync: SourceSync } {
  const shown = previous?.state.text
  // An answer the previous element already announced is not announced again by
  // the one taking it over; the next answer is.
  let carried = previous && announcedBy.get(previous)
  previous?.destroy()
  const handle = createSmoothText(element, options)
  handle.onSettled(() => {
    const source = handle.state.source
    const repeat = source === carried
    carried = undefined
    announcedBy.set(handle, source)
    if (!repeat) onSettled()
  })
  if (shown) handle.reset(shown)
  return { handle, sync: createSourceSync(syncTargetOf(handle)) }
}

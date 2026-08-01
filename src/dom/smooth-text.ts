import { createSmoothStream } from '../core/stream'
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
  setOptions(next: Partial<SmoothTextOptions>): void
  subscribe(listener: (state: SmoothState) => void): () => void
  destroy(): void
  readonly state: SmoothState
}

/** Pacing and reveal wired together - the one-liner for plain JavaScript. */
export function createSmoothText(element: HTMLElement, options?: SmoothTextOptions): SmoothTextHandle {
  const stream = createSmoothStream(options)
  const reveal = createReveal(element, options)

  // The first update seeds without animating, which is exactly right: whatever is
  // already there was already on screen.
  reveal.update(stream.getState().text)
  const unsubscribe = stream.subscribe((state) => reveal.update(state.text))

  return {
    push: (delta) => stream.push(delta),
    setText: (text) => stream.setSource(text),
    end: () => stream.end(),

    reset(text) {
      stream.reset(text)
      reveal.reset(text)
    },

    flush() {
      stream.flush()
      reveal.flush()
    },

    setOptions(next) {
      stream.setOptions(next)
      reveal.setOptions(next)
    },

    subscribe: (listener) => stream.subscribe(listener),

    destroy() {
      unsubscribe()
      stream.destroy()
      reveal.destroy()
    },

    get state() {
      return stream.getState()
    },
  }
}

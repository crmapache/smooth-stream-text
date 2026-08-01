import { createSmoothStream } from '../core/stream'
import type { PacingOptions, SmoothState } from '../core/types'
import { createReveal } from '../dom/reveal'
import { createSmoothText, type SmoothTextOptions } from '../dom/smooth-text'
import type { RevealOptions } from '../reveal/types'

export interface SvelteAction<T> {
  update(next: T): void
  destroy(): void
}

export interface SmoothTextActionOptions extends SmoothTextOptions {
  text?: string
  /** Set once the producer has closed the stream. */
  done?: boolean
}

/**
 * Svelte action - paces and reveals text on any element:
 *
 * ```svelte
 * <script lang="ts">
 *   import { smoothText } from 'smooth-stream-text/svelte'
 *   export let answer = ''
 *   export let streaming = true
 * </script>
 *
 * <p use:smoothText={{ text: answer, done: !streaming }}></p>
 * ```
 *
 * A plain action returning `{ update, destroy }` - nothing is imported from Svelte.
 */
export function smoothText(node: HTMLElement, options: SmoothTextActionOptions = {}): SvelteAction<SmoothTextActionOptions> {
  const handle = createSmoothText(node, options)
  let ended = false

  const apply = (next: SmoothTextActionOptions) => {
    if (next.text !== undefined) handle.setText(next.text)
    if (next.done && !ended) {
      ended = true
      handle.end()
    }
  }

  apply(options)

  return {
    update(next) {
      handle.setOptions(next)
      apply(next)
    },
    destroy() {
      handle.destroy()
    },
  }
}

export interface RevealActionOptions extends RevealOptions {
  text?: string
}

/**
 * Svelte action - applies the wave to one piece of text inside your own markup,
 * for when you parse and render the answer yourself.
 */
export function reveal(node: HTMLElement, options: RevealActionOptions = {}): SvelteAction<RevealActionOptions> {
  const handle = createReveal(node, options)
  handle.update(options.text ?? '')

  return {
    update(next) {
      handle.setOptions(next)
      handle.update(next.text ?? '')
    },
    destroy() {
      handle.destroy()
    },
  }
}

export interface SmoothStreamStore {
  /** Svelte store contract: the subscriber is called immediately with the current value. */
  subscribe(run: (state: SmoothState) => void): () => void
  push(delta: string): void
  setSource(text: string): void
  end(): void
  flush(): void
  reset(text?: string): void
  setOptions(next: Partial<PacingOptions>): void
  destroy(): void
}

/**
 * A readable store of the smoothed state, for the headless path.
 *
 * ```svelte
 * <script lang="ts">
 *   import { smoothStream } from 'smooth-stream-text/svelte'
 *   const answer = smoothStream()
 *   onDestroy(answer.destroy)
 * </script>
 *
 * {$answer.text}
 * ```
 */
export function smoothStream(options?: PacingOptions): SmoothStreamStore {
  const stream = createSmoothStream(options)

  return {
    subscribe(run) {
      run(stream.getState())
      return stream.subscribe(run)
    },
    push: (delta) => stream.push(delta),
    setSource: (text) => stream.setSource(text),
    end: () => stream.end(),
    flush: () => stream.flush(),
    reset: (text) => stream.reset(text),
    setOptions: (next) => stream.setOptions(next),
    destroy: () => stream.destroy(),
  }
}

export { createReveal, createSmoothText, createWaveTimeline, defaultReveal, resolveRevealOptions } from '../dom/index'
export type { SmoothTextHandle, SmoothTextOptions } from '../dom/smooth-text'
export type { ResolvedReveal, RevealHandle, RevealOptions, WaveTimeline } from '../reveal/types'
export * from '../index'

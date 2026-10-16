import { changedOptions } from '../core/options'
import { createSmoothStream } from '../core/stream'
import { createSourceSync } from '../core/sync'
import type { PacingOptions, SmoothState } from '../core/types'
import { createReveal } from '../dom/reveal'
import { createSmoothText, syncTargetOf, type SmoothTextOptions } from '../dom/smooth-text'
import type { RevealOptions } from '../reveal/types'

/** The settings among an action's parameters: the text, `done` and callbacks are not. */
function settingsOf<T extends object>(params: T): Omit<T, 'text' | 'done' | 'onSettled'> {
  const settings = { ...params } as Record<string, unknown>
  delete settings.text
  delete settings.done
  delete settings.onSettled
  return settings as Omit<T, 'text' | 'done' | 'onSettled'>
}

export interface SvelteAction<T> {
  update(next: T): void
  destroy(): void
}

export interface SmoothTextActionOptions extends SmoothTextOptions {
  text?: string
  /** Set once the producer has closed the stream. */
  done?: boolean
  /** Called once per answer, when it is completely on screen. */
  onSettled?: () => void
}

/**
 * Svelte action - paces and reveals text on any element:
 *
 * ```svelte
 * <script lang="ts">
 *   import { smoothText } from 'smooth-stream-text/svelte'
 *   let { answer, streaming } = $props()
 * </script>
 *
 * <p use:smoothText={{ text: answer, done: !streaming }}></p>
 * ```
 *
 * A plain action returning `{ update, destroy }` - nothing is imported from Svelte.
 */
export function smoothText(
  node: HTMLElement,
  options: SmoothTextActionOptions = {},
): SvelteAction<SmoothTextActionOptions> {
  const handle = createSmoothText(node, options)
  const sync = createSourceSync(syncTargetOf(handle))
  let current = options
  // Only what changes reaches the handle, so a setting that is gone returns to its default.
  let applied = settingsOf(options)
  handle.onSettled(() => current.onSettled?.())

  // A message that is already done when the element appears is history: it is
  // shown at once. Every later pair goes through the same rule, so one element
  // serves any number of answers.
  const apply = (next: SmoothTextActionOptions) => {
    current = next
    if (next.text !== undefined) sync.apply(next.text, Boolean(next.done))
    else if (next.done) handle.end()
  }

  apply(options)

  return {
    update(next) {
      const settings = settingsOf(next)
      const changes = changedOptions(applied, settings)
      applied = settings
      if (changes) handle.setOptions(changes)
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
  let applied = settingsOf(options)

  return {
    update(next) {
      const settings = settingsOf(next)
      const changes = changedOptions(applied, settings)
      applied = settings
      if (changes) handle.setOptions(changes)
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
  /**
   * Hand over the latest full text and whether it is finished, on every change -
   * the rule the React and Vue bindings follow: an answer already done when it
   * first arrives is shown at once, a new one starts over, `done` closes it.
   */
  apply(text: string, done: boolean): void
  push(delta: string): void
  setSource(text: string): void
  end(): void
  flush(): void
  reset(text?: string): void
  /** Stop drawing without losing anything, while nothing shows the text. */
  pause(): void
  resume(): void
  setOptions(next: Partial<PacingOptions>): void
  destroy(): void
}

/**
 * A readable store of the smoothed state, for the headless path.
 *
 * ```svelte
 * <script lang="ts">
 *   import { smoothStream } from 'smooth-stream-text/svelte'
 *   import { onDestroy } from 'svelte'
 *   let { answer, streaming } = $props()
 *   const smooth = smoothStream()
 *   $effect(() => smooth.apply(answer, !streaming))
 *   onDestroy(smooth.destroy)
 * </script>
 *
 * {$smooth.text}
 * ```
 */
export function smoothStream(options?: PacingOptions): SmoothStreamStore {
  const stream = createSmoothStream(options)
  const sync = createSourceSync(stream)

  return {
    subscribe(run) {
      run(stream.getState())
      return stream.subscribe(run)
    },
    apply: (text, done) => sync.apply(text, done),
    push: (delta) => stream.push(delta),
    setSource: (text) => stream.setSource(text),
    end: () => stream.end(),
    flush: () => stream.flush(),
    reset: (text) => stream.reset(text),
    pause: () => stream.pause(),
    resume: () => stream.resume(),
    setOptions: (next) => stream.setOptions(next),
    destroy: () => stream.destroy(),
  }
}

export { createReveal, createSmoothText, createWaveTimeline, defaultReveal, resolveRevealOptions } from '../dom/index'
export type { SmoothTextHandle, SmoothTextOptions } from '../dom/smooth-text'
export type { ResolvedReveal, RevealHandle, RevealOptions, WaveTimeline } from '../reveal/types'
export * from '../index'

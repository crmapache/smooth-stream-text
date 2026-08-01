import type { Clock } from '../core/types'

export interface RevealOptions {
  /** What animates as one unit. */
  unit?: 'word' | 'char'
  /** How long one unit takes to appear. */
  durationMs?: number
  /** Delay between neighbouring units. Small on purpose - the pacing carries the wave. */
  staggerMs?: number
  /** Starting blur, in pixels. */
  blurPx?: number
  /** Starting upward shift, in pixels. Zero keeps the spans `display: inline`. */
  translatePx?: number
  easing?: string
  /** Above this queue depth the stagger compresses, so a batch cannot queue a long wave. */
  maxWaveLagMs?: number
  respectReducedMotion?: boolean
  /** Set to false to skip the built-in stylesheet and supply your own. */
  injectStyles?: boolean
  /** Extra class on every animating unit. */
  className?: string
}

export type ResolvedReveal = Required<Omit<RevealOptions, 'className'>> & { className?: string }

export interface WaveTimeline {
  /** Reserves `count` slots and returns their absolute start timestamps. */
  claim(count: number, now: number): number[]
  reset(): void
}

export interface RevealHandle {
  /** Hand over the full visible text; the diff against what is shown is internal. */
  update(fullVisibleText: string): void
  /** Settle everything immediately. */
  flush(): void
  /** Drop everything and seed `text` as already settled. */
  reset(text?: string): void
  setOptions(next: Partial<RevealOptions>): void
  destroy(): void
}

export interface RevealDeps {
  timeline?: WaveTimeline
  clock?: Clock
  /**
   * The text to treat as already on screen.
   *
   * Left unset, the first `update` seeds - which is what makes a remount silent.
   * Pass `''` when you have just created this element for text that is genuinely
   * new, so that its first update animates instead of appearing at once.
   */
  initialText?: string
}

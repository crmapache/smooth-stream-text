import { defaultClock } from './clock'
import type { PacingOptions, ResolvedPacing } from './types'

export const defaultPacing: ResolvedPacing = {
  targetLatencyMs: 180,
  adaptMs: 250,
  minCharsPerSecond: 12,
  maxCharsPerSecond: 900,
  settleMs: 400,
  idleGraceMs: 200,
  maxLatencyMs: 2000,
  maxFrameMs: 100,
  boundary: 'markdown',
  unit: 'char',
  holdMs: 1500,
  holdChars: 120,
  clock: defaultClock,
}

/**
 * Settings that only make sense above zero; everything else numeric may be zero.
 * A zero floor is no floor: the rate still rises with the backlog.
 */
const POSITIVE = new Set<keyof ResolvedPacing>(['maxCharsPerSecond', 'maxFrameMs'])

/** Infinity is a legitimate "never" for the caps, but an endless floor leaves nothing to smooth. */
const FINITE = new Set<keyof ResolvedPacing>(['minCharsPerSecond'])

/**
 * A number the engine can run on, or `undefined` to fall back to the default.
 *
 * A NaN cursor never advances yet keeps scheduling frames forever, so anything
 * that is not a number is refused outright. Negative values mean zero; Infinity
 * is a legitimate "never" for the caps and is kept.
 */
export function sanitizeNumber(value: unknown, positive: boolean): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined
  if (positive) return value > 0 ? value : undefined
  return Math.max(0, value)
}

const isBoundary = (value: unknown) =>
  value === 'char' || value === 'word' || value === 'markdown' || typeof value === 'function'

const isClock = (value: unknown) =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { now?: unknown }).now === 'function' &&
  typeof (value as { schedule?: unknown }).schedule === 'function'

/**
 * The complete settings, with every value checked. Anything unusable falls back
 * to its default rather than leaving the stream frozen; a floor above the ceiling
 * is lowered to it.
 */
export function resolvePacingOptions(options?: PacingOptions): ResolvedPacing {
  const resolved = { ...defaultPacing }
  if (!options) return resolved

  for (const key of Object.keys(defaultPacing) as (keyof ResolvedPacing)[]) {
    const value = options[key]
    if (value === undefined) continue
    if (key === 'boundary') {
      if (isBoundary(value)) resolved.boundary = value as ResolvedPacing['boundary']
    } else if (key === 'unit') {
      if (value === 'char' || value === 'word') resolved.unit = value
    } else if (key === 'clock') {
      if (isClock(value)) resolved.clock = value as ResolvedPacing['clock']
    } else {
      const number = sanitizeNumber(value, POSITIVE.has(key))
      if (number !== undefined && (Number.isFinite(number) || !FINITE.has(key))) {
        ;(resolved as Record<string, unknown>)[key] = number
      }
    }
  }

  if (resolved.minCharsPerSecond > resolved.maxCharsPerSecond) resolved.minCharsPerSecond = resolved.maxCharsPerSecond
  return resolved
}

/**
 * What changed between the settings a binding passed last time and now, or
 * `null` when nothing did.
 *
 * Bindings apply their props as they change rather than all of them on every
 * render: a setting changed at runtime through `setOptions` then stays until its
 * own prop changes. A key that is gone comes back as `undefined`, which returns
 * the setting to its default.
 */
export function changedOptions<T extends object>(previous: T | undefined, next: T | undefined): Partial<T> | null {
  const before = (previous ?? {}) as Record<string, unknown>
  const after = (next ?? {}) as Record<string, unknown>
  const changes: Record<string, unknown> = {}
  let changed = false
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (Object.is(before[key], after[key])) continue
    changes[key] = after[key]
    changed = true
  }
  return changed ? (changes as Partial<T>) : null
}

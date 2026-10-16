import { sanitizeNumber } from '../core/options'
import type { ResolvedReveal, RevealOptions } from './types'

export const defaultReveal: ResolvedReveal = {
  unit: 'char',
  durationMs: 380,
  staggerMs: 36,
  blurPx: 4,
  translatePx: 3,
  easing: 'cubic-bezier(.22,.61,.36,1)',
  maxWaveLagMs: 240,
  maxAnimatedUnits: 64,
  respectReducedMotion: true,
  injectStyles: true,
  className: undefined,
}

/** The complete settings, with every value checked; anything unusable falls back to its default. */
export function resolveRevealOptions(options?: RevealOptions): ResolvedReveal {
  const resolved = { ...defaultReveal }
  if (!options) return resolved

  for (const key of Object.keys(defaultReveal) as (keyof ResolvedReveal)[]) {
    const value = options[key]
    if (value === undefined) continue
    const fallback = defaultReveal[key]
    if (key === 'unit') {
      if (value === 'word' || value === 'char') resolved.unit = value
    } else if (key === 'className') {
      resolved.className = typeof value === 'string' ? value : undefined
    } else if (typeof fallback === 'number') {
      let number = sanitizeNumber(value, false)
      // Units are counted whole: a fraction would step past zero and lift the cap.
      if (number !== undefined && key === 'maxAnimatedUnits') number = Math.floor(number)
      if (number !== undefined) (resolved as Record<string, unknown>)[key] = number
    } else if (typeof fallback === 'boolean') {
      ;(resolved as Record<string, unknown>)[key] = Boolean(value)
    } else if (typeof value === typeof fallback) {
      ;(resolved as Record<string, unknown>)[key] = value
    }
  }

  return resolved
}

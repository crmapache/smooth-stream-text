import type { ResolvedReveal, RevealOptions } from './types'

export const defaultReveal: ResolvedReveal = {
  unit: 'word',
  durationMs: 380,
  staggerMs: 36,
  blurPx: 4,
  translatePx: 3,
  easing: 'cubic-bezier(.22,.61,.36,1)',
  maxWaveLagMs: 240,
  respectReducedMotion: true,
  injectStyles: true,
  className: undefined,
}

export function resolveRevealOptions(options?: RevealOptions): ResolvedReveal {
  if (!options) return { ...defaultReveal }
  const resolved = { ...defaultReveal }
  for (const key of Object.keys(defaultReveal) as (keyof ResolvedReveal)[]) {
    const value = options[key]
    if (value !== undefined) (resolved as Record<string, unknown>)[key] = value
  }
  return resolved
}

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
  holdMs: 400,
  holdChars: 120,
  clock: defaultClock,
}

export function resolvePacingOptions(options?: PacingOptions): ResolvedPacing {
  if (!options) return { ...defaultPacing }
  const resolved = { ...defaultPacing }
  for (const key of Object.keys(defaultPacing) as (keyof ResolvedPacing)[]) {
    const value = options[key]
    if (value !== undefined) (resolved as Record<string, unknown>)[key] = value
  }
  return resolved
}

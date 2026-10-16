export { createReveal } from './reveal'
export { createSmoothText } from './smooth-text'
export type { SmoothTextHandle, SmoothTextOptions } from './smooth-text'

export { createWaveTimeline } from '../reveal/timeline'
export { defaultReveal, resolveRevealOptions } from '../reveal/options'
export { splitPieces } from '../reveal/split'
export {
  FLAT_CLASS,
  FORCE_MOTION_CLASS,
  REVEAL_CSS,
  WORD_CLASS,
  applyRevealVars,
  ensureStyles,
  prefersReducedMotion,
} from '../reveal/styles'
export type { Piece } from '../reveal/split'
export type { ResolvedReveal, RevealDeps, RevealHandle, RevealOptions, WaveTimeline } from '../reveal/types'

export * from '../index'

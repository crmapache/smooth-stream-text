export { createSmoothStream } from './core/stream'
export { defaultPacing, resolvePacingOptions } from './core/options'
export { createManualClock, defaultClock } from './core/clock'
export { createBoundaryResolver } from './core/boundary'
export { clampToGraphemeBoundary } from './core/grapheme'
export { createPacerState, effectiveTargetLatency, stepPacer } from './core/pacer'

export type { BoundaryFn, BoundaryMode, BoundaryResolver } from './core/boundary'
export type { PacerInput, PacerState } from './core/pacer'
export type {
  Clock,
  ManualClock,
  PacingOptions,
  ResolvedPacing,
  SmoothState,
  SmoothStream,
  StreamPhase,
} from './core/types'

export { useSmoothStream, useSmoothStreamController, useSmoothText } from './use-smooth-stream'
export { Reveal, RevealProvider, useReveal } from './reveal'
export { SmoothText } from './smooth-text'

export type { SmoothStreamController, SmoothStreamControls, SmoothText as SmoothTextState } from './use-smooth-stream'
export type { RevealContextValue, RevealProps, RevealProviderProps } from './reveal'
export type { SmoothTextProps } from './smooth-text'

export { createReveal, createSmoothText, createWaveTimeline, defaultReveal, resolveRevealOptions } from '../dom/index'
export type { SmoothTextHandle, SmoothTextOptions } from '../dom/smooth-text'
export type { ResolvedReveal, RevealHandle, RevealOptions, WaveTimeline } from '../reveal/types'

export * from '../index'

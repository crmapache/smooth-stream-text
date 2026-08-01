import { createElement, useEffect, useRef, type ElementType } from 'react'
import { defaultPacing } from '../core/options'
import type { PacingOptions } from '../core/types'
import { defaultReveal } from '../reveal/options'
import type { RevealOptions } from '../reveal/types'
import { Reveal, RevealProvider } from './reveal'
import { useSmoothStream } from './use-smooth-stream'

export interface SmoothTextProps extends PacingOptions, RevealOptions {
  text: string
  /** Set once the producer has closed the stream. */
  done?: boolean
  as?: ElementType
  className?: string
  /** Fires once the tail has finished appearing. */
  onSettled?: () => void
}

const PACING_KEYS = new Set(Object.keys(defaultPacing))
const REVEAL_KEYS = new Set(Object.keys(defaultReveal))

function splitOptions(options: Record<string, unknown>) {
  const pacing: Record<string, unknown> = {}
  const reveal: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(options)) {
    if (PACING_KEYS.has(key)) pacing[key] = value
    if (REVEAL_KEYS.has(key)) reveal[key] = value
  }
  return { pacing: pacing as PacingOptions, reveal: reveal as RevealOptions }
}

/**
 * Pacing and reveal in one element, for when you are rendering plain text.
 *
 * If you parse markdown yourself, use `useSmoothStream` for the text and
 * `Reveal` on your own pieces instead - that is the headless path.
 */
export function SmoothText({ text, done, as, className, onSettled, ...options }: SmoothTextProps) {
  const { pacing, reveal } = splitOptions(options as Record<string, unknown>)
  const { text: smoothed, phase } = useSmoothStream(text, { ...pacing, done })

  const fired = useRef(false)
  useEffect(() => {
    if (phase !== 'done') {
      fired.current = false
      return
    }
    if (fired.current) return
    fired.current = true
    onSettled?.()
  }, [phase, onSettled])

  return createElement(RevealProvider, reveal, createElement(Reveal, { as, className }, smoothed))
}

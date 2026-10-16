import { createElement, forwardRef, useEffect, useRef, useState, type ElementType, type HTMLAttributes } from 'react'
import { changedOptions, defaultPacing } from '../core/options'
import type { SourceSync } from '../core/sync'
import type { PacingOptions } from '../core/types'
import { escapeHtml } from '../dom/escape'
import { rebindSmoothText, type SmoothTextHandle, type SmoothTextOptions } from '../dom/smooth-text'
import { defaultReveal } from '../reveal/options'
import type { RevealOptions } from '../reveal/types'
import { useIsomorphicLayoutEffect, useMergedRef } from './reveal'

export interface SmoothTextProps
  extends
    PacingOptions,
    Omit<RevealOptions, 'className'>,
    Omit<HTMLAttributes<HTMLElement>, 'children' | 'dangerouslySetInnerHTML'> {
  text: string
  /** Set once the producer has closed the stream. */
  done?: boolean
  as?: ElementType
  /** Class of the host element. */
  className?: string
  /** Extra class on every animating word. */
  unitClassName?: string
  /**
   * Fires once per answer, when it is completely on screen - every word paced and
   * finished animating. Not for an answer unmounted before then; one hidden by
   * `<Activity>` fires when it shows again.
   */
  onSettled?: () => void
}

// A lookup rather than a set built at the top of the module, which bundlers could
// not drop from an app that never renders SmoothText.
const isOption = (key: string) =>
  Object.prototype.hasOwnProperty.call(defaultPacing, key) || Object.prototype.hasOwnProperty.call(defaultReveal, key)

/** Settings for the engine on one side, attributes for the host element on the other. */
function splitProps(props: Record<string, unknown>) {
  const options: Record<string, unknown> = {}
  const attributes: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    if (isOption(key)) options[key] = value
    else attributes[key] = value
  }
  return { options: options as SmoothTextOptions, attributes }
}

/**
 * Pacing and reveal in one element, for when you are rendering plain text.
 *
 * If you parse markdown yourself, use `useSmoothStream` for the text and
 * `Reveal` on your own pieces instead - that is the headless path.
 *
 * One element serves any number of answers. A message that is already `done`
 * when it first arrives is history and appears at once; every setting can change
 * at any time; other props - `id`, `aria-*`, `style`, a `ref` - go to the host.
 */
export const SmoothText = /* @__PURE__ */ forwardRef<HTMLElement, SmoothTextProps>(function SmoothText(
  { text, done = false, as = 'span', className, unitClassName, onSettled, ...rest },
  ref,
) {
  const { options, attributes } = splitProps(rest)
  if (unitClassName !== undefined) options.className = unitClassName

  const hostRef = useRef<HTMLElement | null>(null)
  const mergedRef = useMergedRef<HTMLElement>(hostRef, ref)
  const handleRef = useRef<SmoothTextHandle | null>(null)
  const syncRef = useRef<SourceSync | null>(null)
  const boundRef = useRef<HTMLElement | null>(null)
  const onSettledRef = useRef(onSettled)
  const optionsRef = useRef(options)
  // What the handle was last given, so that only the props that change reach it.
  const appliedRef = useRef(options)

  useEffect(() => {
    onSettledRef.current = onSettled
    optionsRef.current = options
  })

  // Rendered once and never touched by React again, so the handle can own the
  // children - while finished text is still in the server output.
  const [initialHtml] = useState(() => ({ __html: escapeHtml(done ? text : '') }))

  useIsomorphicLayoutEffect(() => {
    const host = hostRef.current!
    if (!handleRef.current || boundRef.current !== host) {
      // The first element, or a new one because `as` changed.
      const bound = rebindSmoothText(host, optionsRef.current, handleRef.current, () => onSettledRef.current?.())
      appliedRef.current = optionsRef.current
      handleRef.current = bound.handle
      boundRef.current = host
      syncRef.current = bound.sync
    }
    const handle = handleRef.current
    // Pause, never destroy: StrictMode and `<Activity>` unmount and mount the same
    // element again, and the answer must carry on from where it was.
    handle.resume()
    return () => handle.pause()
  }, [as])

  useIsomorphicLayoutEffect(() => {
    syncRef.current!.apply(text, done)
  }, [text, done, as])

  useEffect(() => {
    const changes = changedOptions(appliedRef.current, options)
    appliedRef.current = options
    if (changes) handleRef.current?.setOptions(changes)
  })

  return createElement(as, { ...attributes, ref: mergedRef, className, dangerouslySetInnerHTML: initialHtml })
})

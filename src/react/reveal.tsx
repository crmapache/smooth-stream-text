import {
  createContext,
  createElement,
  forwardRef,
  useContext,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ElementType,
  type ForwardedRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { escapeHtml } from '../dom/escape'
import { createReveal } from '../dom/reveal'
import { defaultReveal, resolveRevealOptions } from '../reveal/options'
import { createWaveTimeline } from '../reveal/timeline'
import type { ResolvedReveal, RevealHandle, RevealOptions, WaveTimeline } from '../reveal/types'

export interface RevealContextValue {
  options: ResolvedReveal
  timeline: WaveTimeline
}

// Calls at the top of a module are kept by bundlers unless marked pure. Unmarked,
// they would pull the whole reveal into an app that imports only the hooks.
const RevealContext = /* @__PURE__ */ createContext<RevealContextValue | null>(null)

// useLayoutEffect warns during server rendering, where there is no layout to read.
export const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function assignRef<T>(ref: ForwardedRef<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

/** Points our own ref and the caller's at the same host element. */
export function useMergedRef<T>(own: ForwardedRef<T>, forwarded: ForwardedRef<T> | undefined) {
  return useMemo(
    () => (value: T | null) => {
      assignRef(own, value)
      assignRef(forwarded, value)
    },
    [own, forwarded],
  )
}

export interface RevealProviderProps extends RevealOptions {
  /** Change this when a new message starts, to clear the wave queue. */
  resetKey?: string | number
  children?: ReactNode
}

/**
 * Shares one wave across every `Reveal` beneath it, so the stagger stays
 * continuous when your renderer splits an answer into separate paragraphs, list
 * items and code blocks. Renders no DOM of its own.
 *
 * Its settings may change at any time: the shared timeline keeps its identity
 * and follows them, so every `Reveal` already on screen does too.
 */
export function RevealProvider({ children, resetKey, ...options }: RevealProviderProps) {
  const resolved = resolveRevealOptions(options)
  // Every resolved option is a primitive, so its serialisation is a sound identity -
  // and it keeps the context stable across unrelated re-renders.
  const key = JSON.stringify(resolved)

  const [timeline] = useState(() => createWaveTimeline(resolved))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo<RevealContextValue>(() => ({ options: resolved, timeline }), [key, timeline])

  // The queue must be ready before any `Reveal` below claims from it, and they
  // claim in their own effects - layout effects for one mounted with the new
  // message, which React runs before a parent's. Insertion effects run before
  // every layout effect, so the first words of a new message take slots in the
  // fresh queue, and the reset never erases what they took. Neither runs on a server.
  useInsertionEffect(() => {
    timeline.setOptions?.(value.options)
  }, [timeline, value])

  useInsertionEffect(() => {
    timeline.reset()
  }, [timeline, resetKey])

  return createElement(RevealContext.Provider, { value }, children)
}

/** The reveal settings and shared wave in scope. Falls back to the defaults outside a provider. */
export function useReveal(): RevealContextValue {
  const context = useContext(RevealContext)
  const [standalone] = useState<RevealContextValue>(() => ({
    options: defaultReveal,
    timeline: createWaveTimeline(defaultReveal),
  }))
  return context ?? standalone
}

export interface RevealProps extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'dangerouslySetInnerHTML'> {
  /** Plain text. Reveal is a leaf - give it a string, not elements. */
  children?: string
  as?: ElementType
  /**
   * The text to treat as already on screen. Defaults to whatever is mounted, which
   * is what keeps a remount silent. Pass `''` when this element was just created
   * for text that is genuinely new, so its first paint animates.
   */
  initialText?: string
}

/**
 * Applies the wave to one piece of text inside your own markup.
 *
 * Hang it on the text of each paragraph, list item or heading your renderer
 * produces; appended text animates, everything already on screen stays put. It
 * renders a host element with no React children, so the imperative renderer
 * inside never fights React's tree. Any other props - `id`, `aria-*`, `style`,
 * a `ref` - go to that host.
 *
 * Remounts are silent by design: a fresh handle treats the text it is handed as
 * already settled, so a markdown parser recreating a node does not replay it.
 */
export const Reveal = /* @__PURE__ */ forwardRef<HTMLElement, RevealProps>(function Reveal(
  { children = '', as = 'span', initialText, ...attributes },
  ref,
) {
  const { options, timeline } = useReveal()
  const hostRef = useRef<HTMLElement | null>(null)
  const handleRef = useRef<RevealHandle | null>(null)
  const boundRef = useRef<HTMLElement | null>(null)
  const mergedRef = useMergedRef<HTMLElement>(hostRef, ref)

  // Rendered once, then never touched again. React does not manage the children of
  // an element with dangerouslySetInnerHTML, which is what lets the imperative
  // renderer own them - while still putting the real text in the server output.
  const [initialHtml] = useState(() => ({ __html: escapeHtml(initialText ?? children) }))

  useIsomorphicLayoutEffect(() => {
    const host = hostRef.current!
    if (handleRef.current && boundRef.current === host) return
    // The first element, or a new one because `as` changed. A new element takes
    // over the text already on screen without replaying it; `initialText` only
    // describes the first.
    const first = boundRef.current === null
    handleRef.current?.destroy()
    boundRef.current = host
    const handle = createReveal(host, { ...options, timeline, initialText: first ? initialText : undefined })
    handle.update(children)
    handleRef.current = handle
    // Never destroyed on unmount. StrictMode and `<Activity>` mount the same element
    // again, and its wave must carry on rather than start over behind the slots it
    // already took; an element that is really gone just finishes its animations.
    // Later text and settings go through the effects below.
  }, [as])

  useEffect(() => {
    handleRef.current?.setOptions(options)
  }, [options])

  useEffect(() => {
    handleRef.current?.update(children)
  }, [children])

  return createElement(as, { ...attributes, ref: mergedRef, dangerouslySetInnerHTML: initialHtml })
})

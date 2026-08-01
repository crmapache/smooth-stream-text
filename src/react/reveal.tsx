import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from 'react'
import { createReveal } from '../dom/reveal'
import { defaultReveal, resolveRevealOptions } from '../reveal/options'
import { createWaveTimeline } from '../reveal/timeline'
import type { ResolvedReveal, RevealHandle, RevealOptions, WaveTimeline } from '../reveal/types'

export interface RevealContextValue {
  options: ResolvedReveal
  timeline: WaveTimeline
}

const RevealContext = createContext<RevealContextValue | null>(null)

// useLayoutEffect warns during server rendering, where there is no layout to read.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export interface RevealProviderProps extends RevealOptions {
  /** Change this when a new message starts, to clear the wave queue. */
  resetKey?: string | number
  children?: ReactNode
}

/**
 * Shares one wave across every `Reveal` beneath it, so the stagger stays
 * continuous when your renderer splits an answer into separate paragraphs, list
 * items and code blocks. Renders no DOM of its own.
 */
export function RevealProvider({ children, resetKey, ...options }: RevealProviderProps) {
  const resolved = resolveRevealOptions(options)
  // Every resolved option is a primitive, so its serialisation is a sound identity -
  // and it keeps the context stable across unrelated re-renders.
  const key = JSON.stringify(resolved)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const timeline = useMemo(() => createWaveTimeline(resolved), [key])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo<RevealContextValue>(() => ({ options: resolved, timeline }), [key, timeline])

  useEffect(() => {
    timeline.reset()
  }, [timeline, resetKey])

  return createElement(RevealContext.Provider, { value }, children)
}

/** The reveal settings and shared wave in scope. Falls back to the defaults outside a provider. */
export function useReveal(): RevealContextValue {
  const context = useContext(RevealContext)
  const standalone = useMemo<RevealContextValue>(
    () => ({ options: defaultReveal, timeline: createWaveTimeline(defaultReveal) }),
    [],
  )
  return context ?? standalone
}

export interface RevealProps {
  /** Plain text. Reveal is a leaf - give it a string, not elements. */
  children?: string
  as?: ElementType
  className?: string
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
 * inside never fights React's tree.
 *
 * Remounts are silent by design: a fresh handle treats the text it is handed as
 * already settled, so a markdown parser recreating a node does not replay it.
 */
export function Reveal({ children = '', as = 'span', className, initialText }: RevealProps) {
  const { options, timeline } = useReveal()
  const hostRef = useRef<HTMLElement>(null)
  const handleRef = useRef<RevealHandle | null>(null)

  // Rendered once, then never touched again. React does not manage the children of
  // an element with dangerouslySetInnerHTML, which is what lets the imperative
  // renderer own them - while still putting the real text in the server output.
  const [initialHtml] = useState(() => ({ __html: escapeHtml(initialText ?? children) }))

  useIsomorphicLayoutEffect(() => {
    const handle = createReveal(hostRef.current!, { ...options, timeline, initialText })
    // Without an explicit initialText this seeds with the mounted text, which is
    // what makes a remount silent.
    handle.update(children)
    handleRef.current = handle
    return () => {
      handle.destroy()
      handleRef.current = null
    }
    // Mount only: later changes go through the update effects below.
  }, [])

  useEffect(() => {
    handleRef.current?.setOptions(options)
  }, [options])

  useEffect(() => {
    handleRef.current?.update(children)
  }, [children])

  const Host = as as 'span'
  return <Host ref={hostRef as React.Ref<HTMLSpanElement>} className={className} dangerouslySetInnerHTML={initialHtml} />
}

import { defaultClock } from '../core/clock'
import { resolveRevealOptions } from '../reveal/options'
import { splitPieces } from '../reveal/split'
import { createWaveTimeline } from '../reveal/timeline'
import { applyRevealVars, ensureStyles, FLAT_CLASS, prefersReducedMotion, WORD_CLASS } from '../reveal/styles'
import type { RevealDeps, RevealHandle, RevealOptions } from '../reveal/types'

interface LiveNode {
  node: ChildNode
  text: string
  /** When this node may be folded back into the settled text. */
  settleAt: number
}

/**
 * Reveals appended text as a left-to-right wave.
 *
 * The element is owned entirely by the handle - give it a host with no other
 * children. Its shape is one leading text node holding everything that has
 * finished animating, followed by a short tail of spans:
 *
 * ```html
 * <host>everything settled<span class="sst-word">still</span> <span class="sst-word">arriving</span></host>
 * ```
 *
 * Finished units collapse back into that text node, so a long answer is a flat
 * text node plus a handful of spans rather than thousands of them - and copying
 * finished text yields exactly the characters on screen.
 */
export function createReveal(element: HTMLElement, options?: RevealOptions & RevealDeps): RevealHandle {
  const config = resolveRevealOptions(options)
  const clock = options?.clock ?? defaultClock
  const ownTimeline = options?.timeline ?? createWaveTimeline(config)
  const doc = element.ownerDocument

  let shown = ''
  let seeded = false
  let live: LiveNode[] = []
  let cancelPoll: (() => void) | null = null

  let settled = doc.createTextNode('')
  element.textContent = ''
  element.appendChild(settled)

  if (config.injectStyles) ensureStyles(doc)
  applyRevealVars(element, config)

  const animationsOff = () => config.respectReducedMotion && prefersReducedMotion()

  function appendSettled(text: string): void {
    settled.data += text
  }

  function stopPolling(): void {
    cancelPoll?.()
    cancelPoll = null
  }

  function settleDue(now: number): void {
    let merged = 0
    while (merged < live.length && live[merged].settleAt <= now) merged++
    if (merged === 0) return

    for (let i = 0; i < merged; i++) {
      appendSettled(live[i].text)
      live[i].node.remove()
    }
    live = live.slice(merged)
  }

  function poll(now: number): void {
    cancelPoll = null
    settleDue(now)
    if (live.length > 0) startPolling()
  }

  function startPolling(): void {
    if (cancelPoll) return
    cancelPoll = clock.schedule(poll)
  }

  function makeWordSpan(text: string, delayMs: number): HTMLElement {
    const span = doc.createElement('span')
    span.className = config.className ? `${WORD_CLASS} ${config.className}` : WORD_CLASS
    if (config.translatePx === 0) span.classList.add(FLAT_CLASS)
    span.style.animationDelay = `${Math.max(0, delayMs)}ms`
    span.textContent = text
    return span
  }

  function animate(delta: string): void {
    const pieces = splitPieces(delta, config.unit)
    const now = clock.now()
    const starts = ownTimeline.claim(
      pieces.reduce((count, piece) => count + (piece.animatable ? 1 : 0), 0),
      now,
    )

    let claimed = 0
    // Whitespace is already invisible, so it settles at once; it only sits in the
    // live list to keep document order while its neighbours animate.
    let lastSettleAt = now

    for (const piece of pieces) {
      if (!piece.animatable) {
        const node = doc.createTextNode(piece.text)
        element.appendChild(node)
        live.push({ node, text: piece.text, settleAt: lastSettleAt })
        continue
      }
      const start = starts[claimed++]
      const node = makeWordSpan(piece.text, start - now)
      element.appendChild(node)
      lastSettleAt = start + config.durationMs
      live.push({ node, text: piece.text, settleAt: lastSettleAt })
    }

    startPolling()
  }

  function seed(text: string): void {
    stopPolling()
    for (const entry of live) entry.node.remove()
    live = []
    settled.data = text
    shown = text
    seeded = true
  }

  return {
    update(text) {
      // Not an extension: the consumer's parser re-split a paragraph or moved text
      // between chunks. Reseeding beats re-animating what was already visible.
      if (!text.startsWith(shown)) {
        seed(text)
        return
      }

      const delta = text.slice(shown.length)
      shown = text

      // The first update is what was already on screen when the handle appeared,
      // so it must not animate. This is also what makes a remount silent.
      if (!seeded) {
        seeded = true
        appendSettled(delta)
        return
      }

      if (!delta) return
      if (animationsOff()) {
        appendSettled(delta)
        return
      }
      animate(delta)
    },

    flush() {
      stopPolling()
      for (const entry of live) {
        appendSettled(entry.text)
        entry.node.remove()
      }
      live = []
    },

    reset(text) {
      seed(text ?? '')
      ownTimeline.reset()
    },

    setOptions(next) {
      Object.assign(config, resolveRevealOptions({ ...config, ...next }))
      if (config.injectStyles) ensureStyles(doc)
      applyRevealVars(element, config)
    },

    destroy() {
      stopPolling()
    },
  }
}

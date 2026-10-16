import { defaultClock } from '../core/clock'
import { resolveRevealOptions } from '../reveal/options'
import { splitPieces, type Piece } from '../reveal/split'
import { createWaveTimeline } from '../reveal/timeline'
import {
  applyRevealVars,
  ensureStyles,
  FLAT_CLASS,
  FORCE_MOTION_CLASS,
  prefersReducedMotion,
  WORD_CLASS,
} from '../reveal/styles'
import type { RevealDeps, RevealHandle, RevealOptions } from '../reveal/types'

interface LiveNode {
  node: ChildNode
  text: string
  /** When this node may be folded back into the settled text. */
  settleAt: number
}

/**
 * A word this long animates as plain inline text. An `inline-block` cannot wrap,
 * so a long URL or identifier would overflow a narrow column until it settled
 * and then jump onto its new lines.
 */
const LONG_WORD = 24

const TEXT_NODE = 3

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

  let shown = options?.initialText ?? ''
  let seeded = options?.initialText !== undefined
  let live: LiveNode[] = []
  let cancelPoll: (() => void) | null = null
  let destroyed = false
  const idleListeners = new Set<() => void>()

  const settled = doc.createTextNode(shown)
  element.textContent = ''
  element.appendChild(settled)

  if (config.injectStyles) ensureStyles(element)
  applyRevealVars(element, config)

  const animationsOff = () => config.respectReducedMotion && prefersReducedMotion()

  function stopPolling(): void {
    cancelPoll?.()
    cancelPoll = null
  }

  function notifyIdle(): void {
    for (const listener of [...idleListeners]) listener()
  }

  /**
   * Where a selection endpoint inside a node about to fold will be once its text
   * has moved into the settled node, or null when it is not inside one.
   */
  function foldedOffset(folding: LiveNode[], base: number, node: Node | null, offset: number): number | null {
    if (!node) return null
    let start = base
    for (const entry of folding) {
      if (entry.node === node) {
        // A text node counts characters; a span counts children, of which it has one.
        return start + (node.nodeType === TEXT_NODE ? offset : offset > 0 ? entry.text.length : 0)
      }
      if (entry.node.contains(node)) return start + offset
      start += entry.text.length
    }
    return null
  }

  function selectionFor(): Selection | null {
    const root = element.getRootNode() as Document | (ShadowRoot & { getSelection?: () => Selection | null })
    const fromRoot = 'getSelection' in root && typeof root.getSelection === 'function' ? root.getSelection() : null
    return fromRoot ?? doc.getSelection?.() ?? null
  }

  /**
   * Moves the first `count` live nodes into the settled text: one write to the
   * text node however many there are, appended rather than reassigned so that a
   * selection already in the settled text stays put. A selection reaching into a
   * folding node is carried over to the same characters.
   */
  function fold(count: number): void {
    if (count <= 0) return
    const folding = live.slice(0, count)
    live = live.slice(count)

    const selection = selectionFor()
    const touched =
      selection !== null &&
      selection.rangeCount > 0 &&
      (element.contains(selection.anchorNode) || element.contains(selection.focusNode))
    const base = settled.length
    const anchor = touched ? foldedOffset(folding, base, selection!.anchorNode, selection!.anchorOffset) : null
    const focus = touched ? foldedOffset(folding, base, selection!.focusNode, selection!.focusOffset) : null

    settled.appendData(folding.map((entry) => entry.text).join(''))
    for (const entry of folding) entry.node.remove()

    if (anchor !== null || focus !== null) {
      selection!.setBaseAndExtent(
        anchor !== null ? settled : selection!.anchorNode!,
        anchor ?? selection!.anchorOffset,
        focus !== null ? settled : selection!.focusNode!,
        focus ?? selection!.focusOffset,
      )
    }
  }

  function foldAll(): void {
    stopPolling()
    const wasAnimating = live.length > 0
    fold(live.length)
    if (wasAnimating) notifyIdle()
  }

  function poll(now: number): void {
    cancelPoll = null
    let due = 0
    while (due < live.length && live[due].settleAt <= now) due++
    fold(due)
    if (live.length > 0) startPolling()
    else if (due > 0) notifyIdle()
  }

  function startPolling(): void {
    if (cancelPoll || destroyed) return
    cancelPoll = clock.schedule(poll)
  }

  /**
   * Shows `text` at once, after everything already on screen. Behind animating
   * units it waits as its own node and folds when they do, so the order on screen
   * is always the order of the text.
   */
  function appendInstant(text: string): void {
    if (!text) return
    if (live.length === 0) {
      settled.appendData(text)
      return
    }
    const node = doc.createTextNode(text)
    element.appendChild(node)
    live.push({ node, text, settleAt: Number.NEGATIVE_INFINITY })
    startPolling()
  }

  function makeWordSpan(text: string, delayMs: number): HTMLElement {
    const span = doc.createElement('span')
    span.className = config.className ? `${WORD_CLASS} ${config.className}` : WORD_CLASS
    // A character never gets its own block box: neighbouring letters must still
    // shape and wrap together, which they only do as plain inline text.
    if (config.unit === 'char' || config.translatePx === 0 || text.length > LONG_WORD) span.classList.add(FLAT_CLASS)
    if (!config.respectReducedMotion) span.classList.add(FORCE_MOTION_CLASS)
    span.style.animationDelay = `${Math.max(0, delayMs)}ms`
    span.textContent = text
    return span
  }

  /** Index of the first piece that animates; everything before it shows at once. */
  function animatedFrom(pieces: Piece[]): number {
    let left = Math.max(0, config.maxAnimatedUnits)
    for (let i = pieces.length - 1; i >= 0; i--) {
      if (!pieces[i].animatable) continue
      if (left === 0) return i + 1
      left--
    }
    return 0
  }

  function animate(delta: string): void {
    const pieces = splitPieces(delta, config.unit)
    const from = animatedFrom(pieces)
    appendInstant(
      pieces
        .slice(0, from)
        .map((piece) => piece.text)
        .join(''),
    )

    const animated = pieces.slice(from)
    const now = clock.now()
    const starts = ownTimeline.claim(
      animated.reduce((count, piece) => count + (piece.animatable ? 1 : 0), 0),
      now,
    )

    let claimed = 0
    // Whitespace is already invisible, so it settles at once; it only sits in the
    // live list to keep document order while its neighbours animate.
    let lastSettleAt = now

    for (const piece of animated) {
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
    const wasAnimating = live.length > 0
    for (const entry of live) entry.node.remove()
    live = []
    settled.data = text
    shown = text
    seeded = true
    if (wasAnimating) notifyIdle()
  }

  return {
    update(text) {
      if (destroyed) return
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
        appendInstant(delta)
        return
      }

      if (!delta) return
      if (animationsOff()) {
        appendInstant(delta)
        return
      }
      if (config.injectStyles) ensureStyles(element)
      animate(delta)
    },

    flush() {
      if (destroyed) return
      foldAll()
    },

    reset(text) {
      if (destroyed) return
      seed(text ?? '')
      ownTimeline.reset()
    },

    setOptions(next) {
      if (destroyed) return
      Object.assign(config, resolveRevealOptions({ ...config, ...next }))
      // A shared timeline belongs to whoever shares it; only our own follows along.
      if (!options?.timeline) ownTimeline.setOptions?.(config)
      if (config.injectStyles) ensureStyles(element)
      applyRevealVars(element, config)
    },

    get animating() {
      return live.length > 0
    },

    onIdle(listener) {
      idleListeners.add(listener)
      return () => {
        idleListeners.delete(listener)
      }
    },

    destroy() {
      if (destroyed) return
      destroyed = true
      stopPolling()
      // Whatever was mid-animation stays on screen as plain text.
      fold(live.length)
      idleListeners.clear()
    },
  }
}

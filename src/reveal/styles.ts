import type { ResolvedReveal } from './types'

export const WORD_CLASS = 'sst-word'
/** Applied when there is no shift to animate, which lets the span stay inline. */
export const FLAT_CLASS = 'sst-flat'
/** Applied when `respectReducedMotion` is off, so the reduced-motion rule leaves the span alone. */
export const FORCE_MOTION_CLASS = 'sst-motion'

const STYLE_MARKER = 'data-smooth-stream-text'

/**
 * `transform` needs a block box, which is why the default word span is
 * `inline-block`. With `translatePx: 0` only opacity and blur animate, and both
 * work on an inline box - the zero-layout-impact configuration.
 *
 * Everything sits in a cascade layer, so any rule of your own wins over it
 * without a specificity fight.
 */
export const REVEAL_CSS = `@layer smooth-stream-text {
  @keyframes sst-in {
    from { opacity: 0; filter: blur(var(--sst-blur)); transform: translateY(var(--sst-translate)); }
    to { opacity: 1; filter: blur(0px); transform: none; }
  }
  @keyframes sst-in-flat {
    from { opacity: 0; filter: blur(var(--sst-blur)); }
    to { opacity: 1; filter: blur(0px); }
  }
  .${WORD_CLASS} {
    display: inline-block;
    white-space: pre-wrap;
    animation-name: sst-in;
    animation-duration: var(--sst-duration);
    animation-timing-function: var(--sst-easing);
    animation-fill-mode: both;
  }
  .${WORD_CLASS}.${FLAT_CLASS} {
    display: inline;
    animation-name: sst-in-flat;
  }
  @media (prefers-reduced-motion: reduce) {
    .${WORD_CLASS}:not(.${FORCE_MOTION_CLASS}) { animation: none; opacity: 1; filter: none; transform: none; }
  }
}
`

type StyleRoot = Document | ShadowRoot

const DOCUMENT_NODE = 9
const DOCUMENT_FRAGMENT_NODE = 11

const isDocument = (node: Node): node is Document => node.nodeType === DOCUMENT_NODE
const isShadowRoot = (node: Node): node is ShadowRoot => node.nodeType === DOCUMENT_FRAGMENT_NODE && 'host' in node

/** Where styles for `target` have to live: its shadow root if it has one, otherwise its document. */
function styleRootOf(target: Node): StyleRoot {
  if (isDocument(target) || isShadowRoot(target)) return target
  const root = target.getRootNode()
  return isDocument(root) || isShadowRoot(root) ? root : target.ownerDocument!
}

/** One constructed sheet per document: a sheet cannot be shared across documents. */
const sheets = new WeakMap<Document, CSSStyleSheet>()

/**
 * Adopts the stylesheet into `root`. Constructed sheets are not inline styles, so
 * a Content Security Policy without `'unsafe-inline'` does not block them.
 */
function adopt(root: StyleRoot): boolean {
  const doc = isDocument(root) ? root : root.ownerDocument
  const Sheet = doc.defaultView?.CSSStyleSheet
  if (!Sheet || !('adoptedStyleSheets' in root) || typeof Sheet.prototype.replaceSync !== 'function') return false

  let sheet = sheets.get(doc)
  if (!sheet) {
    try {
      sheet = new Sheet()
      sheet.replaceSync(REVEAL_CSS)
    } catch {
      return false
    }
    sheets.set(doc, sheet)
  }
  if (!root.adoptedStyleSheets.includes(sheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
  return true
}

/**
 * The `<style>` each root got where stylesheets cannot be adopted. Finding it
 * again would search the whole document, on every update of every element.
 */
const styleElements = new WeakMap<StyleRoot, HTMLStyleElement>()

/**
 * Adds the stylesheet once per document or shadow root - wherever `target`
 * renders. Repeat calls are cheap.
 */
export function ensureStyles(target: Document | ShadowRoot | Element): void {
  const root = styleRootOf(target)
  if (adopt(root)) return
  const known = styleElements.get(root)
  // Still in place, unless the page took it out.
  if (known?.getRootNode() === root) return
  let style = root.querySelector<HTMLStyleElement>(`style[${STYLE_MARKER}]`)
  if (!style) {
    const doc = isDocument(root) ? root : root.ownerDocument
    style = doc.createElement('style')
    style.setAttribute(STYLE_MARKER, '')
    style.textContent = REVEAL_CSS
    ;(isDocument(root) ? root.head : root).appendChild(style)
  }
  styleElements.set(root, style)
}

/** Everything visual is a custom property, so consumers can restyle from CSS alone. */
export function applyRevealVars(el: HTMLElement, options: ResolvedReveal): void {
  el.style.setProperty('--sst-duration', `${options.durationMs}ms`)
  el.style.setProperty('--sst-easing', options.easing)
  el.style.setProperty('--sst-blur', `${options.blurPx}px`)
  el.style.setProperty('--sst-translate', `${options.translatePx}px`)
}

export function prefersReducedMotion(): boolean {
  if (typeof matchMedia !== 'function') return false
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

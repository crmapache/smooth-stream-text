import type { ResolvedReveal } from './types'

export const WORD_CLASS = 'sst-word'
/** Applied when there is no shift to animate, which lets the span stay inline. */
export const FLAT_CLASS = 'sst-flat'

const STYLE_MARKER = 'data-smooth-stream-text'

/**
 * `transform` needs a block box, which is why the default word span is
 * `inline-block`. With `translatePx: 0` only opacity and blur animate, and both
 * work on an inline box - the zero-layout-impact configuration.
 */
const CSS = `
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
  .${WORD_CLASS} { animation: none; opacity: 1; filter: none; transform: none; }
}
`

/** Adds the stylesheet once per document. Repeat calls are free. */
export function ensureStyles(doc: Document): void {
  if (doc.querySelector(`style[${STYLE_MARKER}]`)) return
  const style = doc.createElement('style')
  style.setAttribute(STYLE_MARKER, '')
  style.textContent = CSS
  doc.head.appendChild(style)
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

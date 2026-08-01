import type { BoundaryMode, SmoothState } from '../core/types'
import { createSmoothText, type SmoothTextHandle, type SmoothTextOptions } from '../dom/smooth-text'

/** Scalar settings live as attributes; anything structured goes through the `options` property. */
const OBSERVED_ATTRIBUTES = [
  'text',
  'done',
  'unit',
  'duration',
  'stagger',
  'blur',
  'translate',
  'target-latency',
  'min-cps',
  'max-cps',
  'boundary',
]

const NUMERIC: Record<string, keyof SmoothTextOptions> = {
  duration: 'durationMs',
  stagger: 'staggerMs',
  blur: 'blurPx',
  translate: 'translatePx',
  'target-latency': 'targetLatencyMs',
  'min-cps': 'minCharsPerSecond',
  'max-cps': 'maxCharsPerSecond',
}

/**
 * `<smooth-stream-text>` - the universal wrapper. Works in plain HTML and in any
 * framework without its own binding: Angular, Solid, Qwik, Astro and the rest.
 *
 * ```html
 * <smooth-stream-text text="Hello there" done></smooth-stream-text>
 * ```
 *
 * ```ts
 * import 'smooth-stream-text/web-component'
 *
 * const el = document.querySelector('smooth-stream-text')!
 * el.options = { targetLatencyMs: 120 }
 * el.push(' more text')
 * el.addEventListener('sst:done', () => console.log('finished'))
 * ```
 */
export class SmoothStreamTextElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return OBSERVED_ATTRIBUTES
  }

  private handle: SmoothTextHandle | null = null
  private unsubscribe: (() => void) | null = null
  private _options: SmoothTextOptions | undefined
  private ended = false
  private announced = false

  connectedCallback(): void {
    if (this.handle) return
    if (!this.style.display) this.style.display = 'block'
    this.handle = createSmoothText(this, this.currentOptions())
    this.unsubscribe = this.handle.subscribe((state) => this.onState(state))
    this.sync()
  }

  disconnectedCallback(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.handle?.destroy()
    this.handle = null
    this.ended = false
    this.announced = false
  }

  attributeChangedCallback(): void {
    if (!this.handle) return
    this.handle.setOptions(this.currentOptions())
    this.sync()
  }

  get options(): SmoothTextOptions | undefined {
    return this._options
  }

  set options(value: SmoothTextOptions | undefined) {
    this._options = value
    this.handle?.setOptions(this.currentOptions())
  }

  get state(): SmoothState | undefined {
    return this.handle?.state
  }

  push(delta: string): void {
    this.handle?.push(delta)
  }

  end(): void {
    this.ended = true
    this.handle?.end()
  }

  flush(): void {
    this.handle?.flush()
  }

  reset(text?: string): void {
    this.ended = false
    this.announced = false
    this.handle?.reset(text)
  }

  private onState(state: SmoothState): void {
    if (state.phase !== 'done' || this.announced) return
    this.announced = true
    this.dispatchEvent(new CustomEvent('sst:done', { bubbles: true }))
  }

  private sync(): void {
    if (!this.handle) return
    const text = this.getAttribute('text')
    if (text !== null) this.handle.setText(text)
    if (this.hasAttribute('done') && !this.ended) {
      this.ended = true
      this.handle.end()
    }
  }

  private currentOptions(): SmoothTextOptions {
    const options: SmoothTextOptions = { ...this._options }

    for (const [attribute, key] of Object.entries(NUMERIC)) {
      const raw = this.getAttribute(attribute)
      if (raw === null) continue
      const value = Number(raw)
      if (Number.isFinite(value)) (options as Record<string, unknown>)[key] = value
    }

    const unit = this.getAttribute('unit')
    if (unit === 'word' || unit === 'char') options.unit = unit

    const boundary = this.getAttribute('boundary')
    if (boundary === 'char' || boundary === 'word' || boundary === 'markdown') {
      options.boundary = boundary as BoundaryMode
    }

    return options
  }
}

/** Registers the element. Idempotent, and runs on import for the common case. */
export function defineSmoothStreamTextElement(tag = 'smooth-stream-text'): void {
  if (typeof customElements !== 'undefined' && !customElements.get(tag)) {
    customElements.define(tag, SmoothStreamTextElement)
  }
}

defineSmoothStreamTextElement()

export { createReveal, createSmoothText, createWaveTimeline, defaultReveal, resolveRevealOptions } from '../dom/index'
export type { SmoothTextHandle, SmoothTextOptions } from '../dom/smooth-text'
export type { ResolvedReveal, RevealHandle, RevealOptions, WaveTimeline } from '../reveal/types'
export * from '../index'

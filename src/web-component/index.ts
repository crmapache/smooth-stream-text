import { changedOptions } from '../core/options'
import { createSourceSync, type SourceSync } from '../core/sync'
import type { BoundaryMode, SmoothState } from '../core/types'
import { createSmoothText, syncTargetOf, type SmoothTextHandle, type SmoothTextOptions } from '../dom/smooth-text'

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
 * Importing this module on a server must not throw: frameworks render pages that
 * import it there. The element itself only ever runs in a browser.
 */
const Base: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement

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
 *
 * The stream belongs to the element, not to its place in the document: moving
 * it or taking it out and back in pauses and resumes it, and nothing is lost.
 * `sst:done` fires once per answer, when it is completely on screen.
 */
export class SmoothStreamTextElement extends Base {
  static get observedAttributes(): string[] {
    return OBSERVED_ATTRIBUTES
  }

  private handle: SmoothTextHandle | null = null
  private sync: SourceSync | null = null
  private _options: SmoothTextOptions | undefined
  /** What the handle was last given, so that a setting that is gone returns to its default. */
  private applied: SmoothTextOptions | undefined

  connectedCallback(): void {
    // A framework may have set properties before this class was registered, which
    // leaves plain values shadowing the accessors.
    for (const key of ['options', 'text', 'done'] as const) {
      if (!Object.prototype.hasOwnProperty.call(this, key)) continue
      const value = (this as Record<string, unknown>)[key]
      delete (this as Record<string, unknown>)[key]
      ;(this as Record<string, unknown>)[key] = value
    }
    if (!this.style.display) this.style.display = 'block'
    this.ensureHandle().resume()
    this.syncText()
  }

  disconnectedCallback(): void {
    this.handle?.pause()
  }

  attributeChangedCallback(name: string): void {
    if (!this.handle) return
    if (name === 'text' || name === 'done') this.syncText()
    else this.applyOptions()
  }

  get options(): SmoothTextOptions | undefined {
    return this._options
  }

  set options(value: SmoothTextOptions | undefined) {
    this._options = value
    this.applyOptions()
  }

  /** Reflects the `text` attribute, so frameworks that bind properties work too. */
  get text(): string {
    return this.getAttribute('text') ?? ''
  }

  /** `null` or `undefined` - what a framework binds before the answer arrives - is no text yet. */
  set text(value: string | null | undefined) {
    this.setAttribute('text', value ?? '')
  }

  /** Reflects the `done` attribute. */
  get done(): boolean {
    return this.hasAttribute('done')
  }

  set done(value: boolean) {
    this.toggleAttribute('done', Boolean(value))
  }

  get state(): SmoothState | undefined {
    return this.handle?.state
  }

  push(delta: string): void {
    this.ensureHandle().push(delta)
  }

  end(): void {
    this.ensureHandle().end()
  }

  flush(): void {
    this.handle?.flush()
  }

  reset(text?: string): void {
    this.ensureHandle().reset(text)
  }

  /**
   * The handle is made on first use, whether that is being connected or a method
   * call: text pushed before the element is in the document must not be lost.
   */
  private ensureHandle(): SmoothTextHandle {
    if (this.handle) return this.handle
    this.applied = this.currentOptions()
    const handle = createSmoothText(this, this.applied)
    handle.onSettled(() => this.dispatchEvent(new CustomEvent('sst:done', { bubbles: true })))
    if (!this.isConnected) handle.pause()
    this.handle = handle
    this.sync = createSourceSync(syncTargetOf(handle))
    return handle
  }

  private applyOptions(): void {
    if (!this.handle) return
    const next = this.currentOptions()
    const changes = changedOptions(this.applied, next)
    this.applied = next
    if (changes) this.handle.setOptions(changes)
  }

  private syncText(): void {
    const handle = this.handle
    if (!handle) return
    const text = this.getAttribute('text')
    // Without a `text` attribute the text is pushed, and `done` only closes it.
    if (text === null) {
      if (this.hasAttribute('done')) handle.end()
      return
    }
    this.sync!.apply(text, this.hasAttribute('done'))
  }

  /**
   * The complete settings: defaults, then the `options` property, then attributes.
   * An attribute that was removed falls back to the property or the default
   * rather than keeping its last value.
   */
  private currentOptions(): SmoothTextOptions {
    const options: Record<string, unknown> = { ...this._options }

    for (const [attribute, key] of Object.entries(NUMERIC)) {
      const raw = this.getAttribute(attribute)
      const value = raw === null ? Number.NaN : Number(raw)
      if (Number.isFinite(value)) options[key] = value
      else if (!(key in options)) options[key] = undefined
    }

    const unit = this.getAttribute('unit')
    options.unit = unit === 'word' || unit === 'char' ? unit : this._options?.unit

    const boundary = this.getAttribute('boundary')
    options.boundary =
      boundary === 'char' || boundary === 'word' || boundary === 'markdown'
        ? (boundary as BoundaryMode)
        : this._options?.boundary

    return options as SmoothTextOptions
  }
}

/** Whether the base class already holds a name - a constructor can only hold one. */
let defaultRegistered = false

/**
 * Registers the element. Idempotent, and runs on import for the common case. Any
 * other tag gets its own subclass, since the platform allows one name per class.
 */
export function defineSmoothStreamTextElement(tag = 'smooth-stream-text'): void {
  if (typeof customElements === 'undefined' || customElements.get(tag)) return
  if (defaultRegistered) {
    customElements.define(tag, class extends SmoothStreamTextElement {})
    return
  }
  customElements.define(tag, SmoothStreamTextElement)
  defaultRegistered = true
}

defineSmoothStreamTextElement()

export { createReveal, createSmoothText, createWaveTimeline, defaultReveal, resolveRevealOptions } from '../dom/index'
export type { SmoothTextHandle, SmoothTextOptions } from '../dom/smooth-text'
export type { ResolvedReveal, RevealHandle, RevealOptions, WaveTimeline } from '../reveal/types'
export * from '../index'

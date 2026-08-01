import {
  computed,
  defineComponent,
  getCurrentScope,
  h,
  inject,
  onMounted,
  onScopeDispose,
  provide,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type InjectionKey,
  type PropType,
  type Ref,
} from 'vue'
import { createSmoothStream } from '../core/stream'
import type { PacingOptions, SmoothState, StreamPhase } from '../core/types'
import { createReveal } from '../dom/reveal'
import { createSmoothText, type SmoothTextOptions } from '../dom/smooth-text'
import { defaultReveal, resolveRevealOptions } from '../reveal/options'
import { createWaveTimeline } from '../reveal/timeline'
import type { ResolvedReveal, RevealOptions, WaveTimeline } from '../reveal/types'

const TIMELINE_KEY: InjectionKey<{ timeline: WaveTimeline; options: ResolvedReveal }> = Symbol('smooth-stream-text')

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export interface UseSmoothStream {
  state: Ref<SmoothState>
  text: ComputedRef<string>
  phase: ComputedRef<StreamPhase>
  flush(): void
  reset(text?: string): void
  setOptions(next: Partial<PacingOptions>): void
}

/**
 * Turns a growing string into a smoothed one. The headless path: take `text` and
 * render it however you already do.
 */
export function useSmoothStream(
  source: Ref<string> | (() => string),
  options?: PacingOptions & { done?: Ref<boolean> | boolean },
): UseSmoothStream {
  const { done, ...pacing } = options ?? {}
  const stream = createSmoothStream(pacing)
  const state = shallowRef<SmoothState>(stream.getState())
  const unsubscribe = stream.subscribe((next) => {
    state.value = next
  })

  const readSource = typeof source === 'function' ? source : () => source.value
  const readDone = typeof done === 'object' && done !== null ? () => done.value : () => Boolean(done)

  // A conversation loaded from history is already complete: show it at once.
  if (readDone()) stream.reset(readSource())

  watch(readSource, (next) => stream.setSource(next), { immediate: true })
  watch(readDone, (finished) => {
    if (finished) stream.end()
  })

  if (getCurrentScope()) {
    onScopeDispose(() => {
      unsubscribe()
      stream.destroy()
    })
  }

  return {
    state,
    text: computed(() => state.value.text),
    phase: computed(() => state.value.phase),
    flush: () => stream.flush(),
    reset: (text?: string) => stream.reset(text),
    setOptions: (next: Partial<PacingOptions>) => stream.setOptions(next),
  }
}

/**
 * Shares one wave across every `Reveal` beneath it, so the stagger stays
 * continuous across paragraphs. Renders its default slot and no DOM of its own.
 */
export const RevealProvider = defineComponent({
  name: 'RevealProvider',
  props: {
    options: { type: Object as PropType<RevealOptions>, default: undefined },
    resetKey: { type: [String, Number] as PropType<string | number>, default: undefined },
  },
  setup(props, { slots }) {
    const resolved = resolveRevealOptions(props.options)
    const timeline = createWaveTimeline(resolved)
    provide(TIMELINE_KEY, { timeline, options: resolved })
    watch(
      () => props.resetKey,
      () => timeline.reset(),
    )
    return () => slots.default?.()
  },
})

/** Applies the wave to one piece of text inside your own markup. */
export const Reveal = defineComponent({
  name: 'Reveal',
  props: {
    text: { type: String, default: '' },
    as: { type: String, default: 'span' },
    className: { type: String, default: undefined },
    options: { type: Object as PropType<RevealOptions>, default: undefined },
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    const shared = inject(TIMELINE_KEY, null)
    // Rendered once so the server output carries the real text, then left alone -
    // Vue only patches innerHTML when the string itself changes.
    const initialHtml = escapeHtml(props.text)
    let handle: ReturnType<typeof createReveal> | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createReveal(host.value, {
        ...(shared?.options ?? defaultReveal),
        ...props.options,
        timeline: shared?.timeline,
      })
      handle.update(props.text)
    })

    watch(
      () => props.text,
      (next) => handle?.update(next),
    )
    watch(
      () => props.options,
      (next) => {
        if (next) handle?.setOptions(next)
      },
      { deep: true },
    )

    onScopeDispose(() => {
      handle?.destroy()
      handle = null
    })

    return () => h(props.as, { ref: host, class: props.className, innerHTML: initialHtml })
  },
})

/** Pacing and reveal in one element, for when you are rendering plain text. */
export const SmoothText = defineComponent({
  name: 'SmoothText',
  props: {
    text: { type: String, default: '' },
    done: { type: Boolean, default: false },
    as: { type: String, default: 'div' },
    className: { type: String, default: undefined },
    options: { type: Object as PropType<SmoothTextOptions>, default: undefined },
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    const initialHtml = escapeHtml(props.done ? props.text : '')
    let handle: ReturnType<typeof createSmoothText> | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createSmoothText(host.value, props.options)
      if (props.done) handle.reset(props.text)
      else handle.setText(props.text)
      if (props.done) handle.end()
    })

    watch(
      () => props.text,
      (next) => handle?.setText(next),
    )
    watch(
      () => props.done,
      (finished) => {
        if (finished) handle?.end()
      },
    )
    watch(
      () => props.options,
      (next) => {
        if (next) handle?.setOptions(next)
      },
      { deep: true },
    )

    onScopeDispose(() => {
      handle?.destroy()
      handle = null
    })

    return () => h(props.as, { ref: host, class: props.className, innerHTML: initialHtml })
  },
})

export default SmoothText

export { createReveal, createSmoothText, createWaveTimeline, defaultReveal, resolveRevealOptions } from '../dom/index'
export type { SmoothTextHandle, SmoothTextOptions } from '../dom/smooth-text'
export type { ResolvedReveal, RevealHandle, RevealOptions, WaveTimeline } from '../reveal/types'
export * from '../index'

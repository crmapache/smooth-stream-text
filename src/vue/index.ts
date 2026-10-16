import {
  computed,
  defineComponent,
  getCurrentInstance,
  getCurrentScope,
  h,
  inject,
  onActivated,
  onDeactivated,
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
import { changedOptions } from '../core/options'
import { createSmoothStream } from '../core/stream'
import { createSourceSync } from '../core/sync'
import type { PacingOptions, SmoothState, StreamPhase } from '../core/types'
import { createReveal } from '../dom/reveal'
import { escapeHtml } from '../dom/escape'
import { rebindSmoothText, type SmoothTextHandle, type SmoothTextOptions } from '../dom/smooth-text'
import { defaultReveal, resolveRevealOptions } from '../reveal/options'
import { createWaveTimeline } from '../reveal/timeline'
import type { ResolvedReveal, RevealHandle, RevealOptions, WaveTimeline } from '../reveal/types'

interface SharedReveal {
  timeline: WaveTimeline
  options: Ref<ResolvedReveal>
}

const TIMELINE_KEY: InjectionKey<SharedReveal> = Symbol('smooth-stream-text')

/** The host's props; no class attribute at all when there is no class. */
const hostProps = (host: Ref<HTMLElement | null>, className: string | undefined, innerHTML: string) =>
  className ? { ref: host, class: className, innerHTML } : { ref: host, innerHTML }

/**
 * Pauses whatever `pause` stops while a kept-alive component is hidden. Outside a
 * component there is nothing to keep alive.
 */
function pauseWhileDeactivated(pause: () => void, resume: () => void): void {
  if (!getCurrentInstance()) return
  onDeactivated(pause)
  onActivated(resume)
}

export interface UseSmoothStream {
  state: Ref<SmoothState>
  text: ComputedRef<string>
  phase: ComputedRef<StreamPhase>
  flush(): void
  reset(text?: string): void
  pause(): void
  resume(): void
  setOptions(next: Partial<PacingOptions>): void
}

/**
 * Turns a growing string into a smoothed one. The headless path: take `text` and
 * render it however you already do.
 *
 * One call serves any number of answers: text that is already `done` when it
 * first arrives - history - is shown at once, also on the server; a new answer
 * starts over; `done` closes whichever answer is current. Pacing starts once the
 * component is mounted, so server rendering schedules nothing.
 */
export function useSmoothStream(
  source: Ref<string> | (() => string),
  options?: PacingOptions & { done?: Ref<boolean> | (() => boolean) | boolean },
): UseSmoothStream {
  const { done, ...pacing } = options ?? {}
  const stream = createSmoothStream(pacing)
  const sync = createSourceSync(stream)
  const state = shallowRef<SmoothState>(stream.getState())
  const unsubscribe = stream.subscribe((next) => {
    state.value = next
  })

  const readSource = typeof source === 'function' ? source : () => source.value
  // A getter is the natural way to pass a prop - `() => !props.streaming`.
  const readDone =
    typeof done === 'function'
      ? done
      : typeof done === 'object' && done !== null
        ? () => done.value
        : () => Boolean(done)
  const apply = () => sync.apply(readSource(), readDone())

  // A conversation loaded from history is already complete: show it at once.
  if (readDone()) apply()
  if (getCurrentInstance()) onMounted(apply)
  else apply()
  watch([readSource, readDone], apply)

  pauseWhileDeactivated(
    () => stream.pause(),
    () => stream.resume(),
  )

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
    pause: () => stream.pause(),
    resume: () => stream.resume(),
    setOptions: (next: Partial<PacingOptions>) => stream.setOptions(next),
  }
}

// The components are marked pure: calls at the top of a module are kept by
// bundlers unless marked, and would pull the reveal into an app that imports
// only `useSmoothStream`.

/**
 * Shares one wave across every `Reveal` beneath it, so the stagger stays
 * continuous across paragraphs. Renders its default slot and no DOM of its own.
 * Its options may change at any time; every `Reveal` below follows them.
 */
export const RevealProvider = /* @__PURE__ */ defineComponent({
  name: 'RevealProvider',
  props: {
    options: { type: Object as PropType<RevealOptions>, default: undefined },
    resetKey: { type: [String, Number] as PropType<string | number>, default: undefined },
  },
  setup(props, { slots }) {
    const resolved = computed(() => resolveRevealOptions(props.options))
    const timeline = createWaveTimeline(resolved.value)
    provide(TIMELINE_KEY, { timeline, options: resolved })
    watch(resolved, (next) => timeline.setOptions?.(next))
    watch(
      () => props.resetKey,
      () => timeline.reset(),
    )
    return () => slots.default?.()
  },
})

/** Applies the wave to one piece of text inside your own markup. */
export const Reveal = /* @__PURE__ */ defineComponent({
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
    let handle: RevealHandle | null = null

    // The provider's settings, overridden by this element's own.
    const settings = () => ({ ...(shared?.options.value ?? defaultReveal), ...props.options })

    /** Binds to the current element. A new element takes over the text on screen without replaying it. */
    const bind = () => {
      if (!host.value) return
      handle?.destroy()
      handle = createReveal(host.value, { ...settings(), timeline: shared?.timeline })
      handle.update(props.text)
    }

    onMounted(bind)
    watch(() => props.as, bind, { flush: 'post' })
    watch(
      () => props.text,
      (next) => handle?.update(next),
    )
    watch(settings, (next) => handle?.setOptions(next), { deep: true })

    onScopeDispose(() => {
      handle?.destroy()
      handle = null
    })

    return () => h(props.as, hostProps(host, props.className, initialHtml))
  },
})

/**
 * Pacing and reveal in one element, for when you are rendering plain text.
 *
 * Emits `settled` once per answer, when it is completely on screen - inside a
 * deactivated `<KeepAlive>`, once it is activated again, and never for an answer
 * unmounted before then. A message that is already `done` when it first arrives
 * is history and appears at once.
 */
export const SmoothText = /* @__PURE__ */ defineComponent({
  name: 'SmoothText',
  props: {
    text: { type: String, default: '' },
    done: { type: Boolean, default: false },
    as: { type: String, default: 'div' },
    className: { type: String, default: undefined },
    options: { type: Object as PropType<SmoothTextOptions>, default: undefined },
  },
  emits: ['settled'],
  setup(props, { emit }) {
    const host = ref<HTMLElement | null>(null)
    const initialHtml = escapeHtml(props.done ? props.text : '')
    let handle: SmoothTextHandle | null = null
    let sync: ReturnType<typeof createSourceSync> | null = null
    // A copy of what the handle was last given: a deep watch hands back the same
    // object changed in place, and a setting that is gone must return to its default.
    let applied: SmoothTextOptions | undefined

    /** Binds to the current element. A new element takes over the text on screen without replaying it. */
    const bind = () => {
      if (!host.value) return
      applied = props.options && { ...props.options }
      const bound = rebindSmoothText(host.value, applied, handle, () => emit('settled'))
      handle = bound.handle
      sync = bound.sync
      sync.apply(props.text, props.done)
    }

    onMounted(bind)
    watch(() => props.as, bind, { flush: 'post' })
    watch(
      () => [props.text, props.done] as const,
      ([text, done]) => sync?.apply(text, done),
    )
    watch(
      () => props.options,
      (next) => {
        const snapshot = next && { ...next }
        const changes = changedOptions(applied, snapshot)
        applied = snapshot
        if (changes) handle?.setOptions(changes)
      },
      { deep: true },
    )

    pauseWhileDeactivated(
      () => handle?.pause(),
      () => handle?.resume(),
    )

    onScopeDispose(() => {
      handle?.destroy()
      handle = null
    })

    return () => h(props.as, hostProps(host, props.className, initialHtml))
  },
})

export default SmoothText

export { createReveal, createSmoothText, createWaveTimeline, defaultReveal, resolveRevealOptions } from '../dom/index'
export type { SmoothTextHandle, SmoothTextOptions } from '../dom/smooth-text'
export type { ResolvedReveal, RevealHandle, RevealOptions, WaveTimeline } from '../reveal/types'
export * from '../index'

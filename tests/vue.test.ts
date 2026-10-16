// @vitest-environment jsdom
import { KeepAlive, createApp, createSSRApp, defineComponent, h, nextTick, reactive, ref, type App } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { afterEach, describe, expect, it } from 'vitest'
import { Reveal, RevealProvider, SmoothText, useSmoothStream } from '../src/vue/index'
import { createManualClock, type ManualClock } from '../src/index'

const apps: App[] = []

/** `setup` runs once and returns the render function, exactly as in a real component. */
function mount(setup: () => () => unknown) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp({ setup })
  app.mount(el)
  apps.push(app)
  return el
}

const frames = (clock: ManualClock, count = 200) => {
  for (let i = 0; i < count; i++) clock.advance(16)
}

const words = (el: ParentNode) => [...el.querySelectorAll('.sst-word')].map((node) => node.textContent)

afterEach(() => {
  while (apps.length) apps.pop()!.unmount()
  document.body.innerHTML = ''
})

describe('SmoothText', () => {
  it('paces text into the host element', async () => {
    const clock = createManualClock(0)
    const text = ref('')
    const el = mount(() => () => h(SmoothText, { text: text.value, options: { clock, boundary: 'char' } }))

    text.value = 'hello world'
    await nextTick()
    frames(clock)
    expect(el.textContent).toBe('hello world')
  })

  it('renders a finished answer instantly', async () => {
    const clock = createManualClock(0)
    const el = mount(() => () => h(SmoothText, { text: 'a historical answer', done: true, options: { clock } }))
    await nextTick()
    expect(el.textContent).toBe('a historical answer')
    expect(words(el)).toHaveLength(0)
  })
})

describe('Reveal', () => {
  it('seeds on mount and animates only later additions', async () => {
    const text = ref('one two')
    const el = mount(
      () => () => h(RevealProvider, { options: { unit: 'word' } }, () => [h(Reveal, { text: text.value })]),
    )
    await nextTick()
    expect(words(el)).toHaveLength(0)

    text.value = 'one two three'
    await nextTick()
    expect(words(el)).toEqual(['three'])
    expect(el.textContent).toBe('one two three')
  })

  it('keeps one continuous wave across sibling chunks', async () => {
    const a = ref('one')
    const b = ref('two')
    const el = mount(
      () => () =>
        h(RevealProvider, { options: { staggerMs: 40, unit: 'word' } }, () => [
          h(Reveal, { text: a.value, as: 'p' }),
          h(Reveal, { text: b.value, as: 'p' }),
        ]),
    )
    await nextTick()

    a.value = 'one three'
    b.value = 'two four'
    await nextTick()

    const delays = [...el.querySelectorAll('.sst-word')].map((node) => (node as HTMLElement).style.animationDelay)
    expect(delays).toHaveLength(2)
    expect(new Set(delays).size).toBe(2)
  })

  it('escapes text in the initial markup', async () => {
    const el = mount(() => () => h(Reveal, { text: '<script>alert(1)</script>' }))
    await nextTick()
    expect(el.querySelector('script')).toBeNull()
    expect(el.textContent).toBe('<script>alert(1)</script>')
  })
})

describe('useSmoothStream', () => {
  it('exposes the smoothed text as a ref', async () => {
    const clock = createManualClock(0)
    const source = ref('')
    let smoothed!: ReturnType<typeof useSmoothStream>

    mount(() => {
      smoothed = useSmoothStream(source, { clock, boundary: 'char' })
      return () => h('p', smoothed.text.value)
    })

    source.value = 'hello world'
    await nextTick()
    frames(clock)
    expect(smoothed.text.value).toBe('hello world')
    expect(smoothed.phase.value).toBe('streaming')
  })

  it('creates exactly one stream across re-renders', async () => {
    const clock = createManualClock(0)
    const source = ref('')
    const other = ref(0)
    let setupRuns = 0
    let smoothed!: ReturnType<typeof useSmoothStream>

    mount(() => {
      setupRuns++
      smoothed = useSmoothStream(source, { clock, boundary: 'char' })
      return () => h('p', `${other.value}:${smoothed.text.value}`)
    })

    source.value = 'hello'
    other.value = 1
    await nextTick()
    other.value = 2
    await nextTick()
    frames(clock)

    expect(setupRuns).toBe(1)
    expect(smoothed.text.value).toBe('hello')
  })

  it('shows an already-finished answer at once', async () => {
    const clock = createManualClock(0)
    const source = ref('a historical answer')
    let smoothed!: ReturnType<typeof useSmoothStream>

    mount(() => {
      smoothed = useSmoothStream(source, { clock, done: true })
      return () => h('p', smoothed.text.value)
    })

    await nextTick()
    expect(smoothed.text.value).toBe('a historical answer')
  })
})

describe('useSmoothStream across answers', () => {
  it('reports a finished history message as done from the start', () => {
    const clock = createManualClock(0)
    let phase = ''
    mount(() => {
      const s = useSmoothStream(() => 'history answer', { done: true, clock })
      return () => {
        phase = s.phase.value
        return h('p', s.text.value)
      }
    })
    expect(phase).toBe('done')
  })

  it('closes again when new text arrives while done stays true', async () => {
    const clock = createManualClock(0)
    const src = ref('a')
    const done = ref(false)
    let s!: ReturnType<typeof useSmoothStream>
    mount(() => {
      s = useSmoothStream(src, { done, clock, boundary: 'char' })
      return () => h('p', s.text.value)
    })
    done.value = true
    await nextTick()
    frames(clock)
    src.value = 'a b c'
    await nextTick()
    frames(clock)
    expect(s.text.value).toBe('a b c')
    expect(s.phase.value).toBe('done')
  })

  it('schedules nothing while rendering on the server', async () => {
    let scheduled = 0
    const clock = { now: () => 0, schedule: () => (scheduled++, () => {}) }
    const app = createSSRApp({
      setup() {
        const s = useSmoothStream(() => 'streaming text', { clock })
        return () => h('p', s.text.value)
      },
    })
    expect(await renderToString(app)).toBe('<p></p>')
    expect(scheduled).toBe(0)
  })

  it('renders finished history on the server', async () => {
    const app = createSSRApp({
      setup() {
        const s = useSmoothStream(() => 'done already', { done: true })
        return () => h('p', s.text.value)
      },
    })
    expect(await renderToString(app)).toBe('<p>done already</p>')
  })

  it('pauses inside a deactivated KeepAlive', async () => {
    const clock = createManualClock(0)
    const show = ref(true)
    const src = ref('')
    let s!: ReturnType<typeof useSmoothStream>
    const Inner = defineComponent({
      setup() {
        s = useSmoothStream(src, { clock, boundary: 'char' })
        return () => h('p', s.text.value)
      },
    })
    mount(() => () => h(KeepAlive, {}, { default: () => (show.value ? h(Inner) : undefined) }))
    show.value = false
    await nextTick()
    src.value = 'hello'
    await nextTick()
    frames(clock, 50)
    expect(s.text.value).toBe('')
    show.value = true
    await nextTick()
    frames(clock)
    expect(s.text.value).toBe('hello')
  })
})

describe('RevealProvider and Reveal after mount', () => {
  it('a changed provider option reaches the Reveals already mounted', async () => {
    const duration = ref(380)
    const text = ref('hi')
    const el = mount(
      () => () => h(RevealProvider, { options: { durationMs: duration.value } }, () => h(Reveal, { text: text.value })),
    )
    await nextTick()
    duration.value = 1000
    text.value = 'hi there'
    await nextTick()
    expect((el.querySelector('span') as HTMLElement).style.getPropertyValue('--sst-duration')).toBe('1000ms')
  })

  it('moves to the new element when `as` changes, keeping its text', async () => {
    const as = ref('span')
    const text = ref('one')
    const el = mount(() => () => h(Reveal, { as: as.value, text: text.value }))
    await nextTick()
    as.value = 'p'
    text.value = 'one two'
    await nextTick()
    await nextTick()
    expect(el.querySelector('p')?.textContent).toBe('one two')
    expect(el.children).toHaveLength(1)
  })
})

describe('SmoothText across answers', () => {
  it('emits settled once per answer, after the wave', async () => {
    const clock = createManualClock(0)
    const text = ref('')
    const done = ref(false)
    let settled = 0
    mount(
      () => () =>
        h(SmoothText, {
          text: text.value,
          done: done.value,
          options: { clock, boundary: 'char' },
          onSettled: () => settled++,
        }),
    )
    await nextTick()
    text.value = 'one'
    done.value = true
    await nextTick()
    frames(clock)
    expect(settled).toBe(1)
    text.value = 'one two'
    await nextTick()
    frames(clock)
    expect(settled).toBe(2)
  })
})

describe('useSmoothStream done as a getter', () => {
  it('reads a getter, the way props are passed', async () => {
    const clock = createManualClock(0)
    const props = reactive({ answer: 'one', streaming: true })
    let s!: ReturnType<typeof useSmoothStream>
    mount(() => {
      s = useSmoothStream(() => props.answer, { done: () => !props.streaming, clock, boundary: 'char' })
      return () => h('p', s.text.value)
    })
    await nextTick()
    frames(clock)
    expect(s.phase.value).toBe('streaming')
    props.streaming = false
    await nextTick()
    frames(clock)
    expect(s.phase.value).toBe('done')
  })
})

describe('SmoothText settings', () => {
  it('returns a setting left out of its options to the default', async () => {
    const options = ref<Record<string, number> | undefined>({ durationMs: 900 })
    const el = mount(() => () => h(SmoothText, { text: '', options: options.value }))
    await nextTick()
    const host = el.firstElementChild as HTMLElement
    expect(host.style.getPropertyValue('--sst-duration')).toBe('900ms')
    options.value = { targetLatencyMs: 50 }
    await nextTick()
    expect(host.style.getPropertyValue('--sst-duration')).toBe('380ms')
    options.value = { durationMs: 700 }
    await nextTick()
    options.value = undefined
    await nextTick()
    expect(host.style.getPropertyValue('--sst-duration')).toBe('380ms')
  })
})

describe('SmoothText element changes', () => {
  it('does not announce an answer again when `as` changes', async () => {
    const as = ref('p')
    let settled = 0
    const el = mount(
      () => () => h(SmoothText, { as: as.value, text: 'an old answer', done: true, onSettled: () => settled++ }),
    )
    await nextTick()
    expect(settled).toBe(1)
    as.value = 'section'
    await nextTick()
    await nextTick()
    expect(el.querySelector('section')?.textContent).toBe('an old answer')
    expect(settled).toBe(1)
  })
})

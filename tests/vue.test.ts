// @vitest-environment jsdom
import { createApp, h, nextTick, ref, type App } from 'vue'
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
    const el = mount(() => () => h(RevealProvider, null, () => [h(Reveal, { text: text.value })]))
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
        h(RevealProvider, { options: { staggerMs: 40 } }, () => [
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

// @vitest-environment jsdom
import { act, render, cleanup } from '@testing-library/react'
import { StrictMode, createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import {
  Reveal,
  RevealProvider,
  SmoothText,
  useSmoothStream,
  useSmoothStreamController,
  useSmoothText,
} from '../src/react/index'
import { createManualClock, type ManualClock } from '../src/index'

afterEach(cleanup)

const words = (el: ParentNode) => [...el.querySelectorAll('.sst-word')].map((node) => node.textContent)
const runFrames = (clock: ManualClock, count = 200) =>
  act(() => {
    for (let i = 0; i < count; i++) clock.advance(16)
  })

describe('useSmoothStream', () => {
  it('renders an already-done message instantly, with no animation', () => {
    const clock = createManualClock(0)
    function Probe() {
      const { text, phase } = useSmoothStream('a full historical answer', { done: true, clock })
      return (
        <p data-testid="out" data-phase={phase}>
          {text}
        </p>
      )
    }
    const { getByTestId } = render(<Probe />)
    expect(getByTestId('out').textContent).toBe('a full historical answer')
  })

  it('paces a growing source and reports its phase', () => {
    const clock = createManualClock(0)
    function Probe({ src, done }: { src: string; done: boolean }) {
      const { text, phase } = useSmoothStream(src, { done, clock, boundary: 'char' })
      return (
        <p data-testid="out" data-phase={phase}>
          {text}
        </p>
      )
    }

    const { getByTestId, rerender } = render(<Probe src="" done={false} />)
    rerender(<Probe src="hello world" done={false} />)
    act(() => clock.advance(16))
    expect(getByTestId('out').textContent!.length).toBeLessThan(11)

    runFrames(clock)
    expect(getByTestId('out').textContent).toBe('hello world')

    rerender(<Probe src="hello world" done />)
    runFrames(clock, 60)
    expect(getByTestId('out').dataset.phase).toBe('done')
  })

  it('exposes flush and reset', () => {
    const clock = createManualClock(0)
    let controls: ReturnType<typeof useSmoothStream> | null = null
    function Probe({ src }: { src: string }) {
      const state = useSmoothStream(src, { clock, boundary: 'char' })
      controls = state
      return <p data-testid="out">{state.text}</p>
    }

    const { getByTestId, rerender } = render(<Probe src="" />)
    rerender(<Probe src="a long streamed answer" />)
    act(() => controls!.flush())
    expect(getByTestId('out').textContent).toBe('a long streamed answer')

    act(() => controls!.reset())
    expect(getByTestId('out').textContent).toBe('')
  })
})

describe('useSmoothStreamController', () => {
  it('paces pushed deltas', () => {
    const clock = createManualClock(0)
    let controller: ReturnType<typeof useSmoothStreamController> | null = null
    function Probe() {
      controller = useSmoothStreamController({ clock, boundary: 'char' })
      return <p data-testid="out">{controller.text}</p>
    }

    const { getByTestId } = render(<Probe />)
    act(() => {
      controller!.push('hello ')
      controller!.push('world')
      controller!.end()
    })
    runFrames(clock)
    expect(getByTestId('out').textContent).toBe('hello world')
    expect(controller!.phase).toBe('done')
  })
})

describe('Reveal', () => {
  it('mounts its initial text as settled and animates only later additions', () => {
    function Chunk({ text }: { text: string }) {
      return (
        <RevealProvider unit="word">
          <Reveal>{text}</Reveal>
        </RevealProvider>
      )
    }

    const { container, rerender } = render(<Chunk text="one two" />)
    expect(words(container)).toHaveLength(0)
    expect(container.textContent).toBe('one two')

    rerender(<Chunk text="one two three" />)
    expect(words(container)).toEqual(['three'])
    expect(container.textContent).toBe('one two three')
  })

  it('does not re-animate when the node is recreated with the same text', () => {
    function Chunk({ nodeKey, text }: { nodeKey: string; text: string }) {
      return (
        <RevealProvider unit="word">
          <Reveal key={nodeKey}>{text}</Reveal>
        </RevealProvider>
      )
    }

    const { container, rerender } = render(<Chunk nodeKey="a" text="one two" />)
    rerender(<Chunk nodeKey="b" text="one two" />)
    expect(words(container)).toHaveLength(0)
    expect(container.textContent).toBe('one two')
  })

  it('reseeds instead of replaying when the parser re-splits text between chunks', () => {
    function Chunk({ text }: { text: string }) {
      return (
        <RevealProvider unit="word">
          <Reveal>{text}</Reveal>
        </RevealProvider>
      )
    }

    const { container, rerender } = render(<Chunk text="a paragraph that moved" />)
    rerender(<Chunk text="moved" />)
    expect(words(container)).toHaveLength(0)
    expect(container.textContent).toBe('moved')
  })

  it('keeps one continuous wave across sibling chunks', () => {
    function Answer({ a, b }: { a: string; b: string }) {
      return (
        <RevealProvider staggerMs={40} unit="word">
          <Reveal as="p">{a}</Reveal>
          <Reveal as="p">{b}</Reveal>
        </RevealProvider>
      )
    }

    const { container, rerender } = render(<Answer a="one" b="two" />)
    rerender(<Answer a="one three" b="two four" />)
    const delays = [...container.querySelectorAll('.sst-word')].map(
      (node) => (node as HTMLElement).style.animationDelay,
    )
    expect(delays).toHaveLength(2)
    expect(new Set(delays).size).toBe(2)
  })

  it('animates on mount when told the element starts empty', () => {
    const { container } = render(
      <RevealProvider unit="word">
        <Reveal initialText="">brand new</Reveal>
      </RevealProvider>,
    )
    expect(words(container)).toEqual(['brand', 'new'])
    expect(container.textContent).toBe('brand new')
  })

  it('renders the text as real markup on the server pass', () => {
    const markup = renderToStaticMarkup(
      <RevealProvider>
        <Reveal>hello &amp; welcome</Reveal>
      </RevealProvider>,
    )
    expect(markup).toContain('hello &amp; welcome')
  })

  it('escapes text in the server pass', () => {
    const markup = renderToStaticMarkup(<Reveal>{'<script>alert(1)</script>'}</Reveal>)
    expect(markup).not.toContain('<script>')
    expect(markup).toContain('&lt;script&gt;')
  })

  it('renders the requested element', () => {
    const { container } = render(
      <Reveal as="p" className="answer">
        hi
      </Reveal>,
    )
    expect(container.querySelector('p.answer')).toBeTruthy()
  })

  it('works without a provider', () => {
    const { container, rerender } = render(<Reveal>one</Reveal>)
    rerender(<Reveal>one two</Reveal>)
    // The defaults: letters, each fading in place.
    expect(words(container)).toEqual(['t', 'w', 'o'])
  })
})

describe('SmoothText', () => {
  it('wires pacing and reveal together', () => {
    const clock = createManualClock(0)
    const { container, rerender } = render(<SmoothText text="" clock={clock} boundary="char" />)
    rerender(<SmoothText text="hello world" clock={clock} boundary="char" />)
    runFrames(clock)
    expect(container.textContent).toBe('hello world')
  })

  it('calls onSettled once the tail has finished', () => {
    const clock = createManualClock(0)
    let settled = 0
    const props = { clock, boundary: 'char' as const, onSettled: () => settled++ }

    const { rerender } = render(<SmoothText text="hi" {...props} />)
    runFrames(clock, 40)
    expect(settled).toBe(0)

    rerender(<SmoothText text="hi there" done {...props} />)
    runFrames(clock)
    expect(settled).toBe(1)
  })

  it('passes reveal options through to the wave', () => {
    const clock = createManualClock(0)
    const { container, rerender } = render(<SmoothText text="one" clock={clock} boundary="char" translatePx={0} />)
    rerender(<SmoothText text="one two three" clock={clock} boundary="char" translatePx={0} />)
    runFrames(clock, 5)
    const span = container.querySelector('.sst-word')
    expect(span?.classList.contains('sst-flat')).toBe(true)
  })
})

describe('remounting', () => {
  it('keeps pacing after a StrictMode double mount', () => {
    // StrictMode mounts, unmounts and mounts again. A hook that tears its engine
    // down on unmount but keeps it in state comes back holding a dead one - and
    // the text never moves again.
    const clock = createManualClock(0)
    function Probe({ src }: { src: string }) {
      const { text } = useSmoothStream(src, { clock, boundary: 'char' })
      return <p data-testid="out">{text}</p>
    }

    const { getByTestId, rerender } = render(
      <StrictMode>
        <Probe src="" />
      </StrictMode>,
    )

    rerender(
      <StrictMode>
        <Probe src="hello world" />
      </StrictMode>,
    )
    runFrames(clock)

    expect(getByTestId('out').textContent).toBe('hello world')
  })

  it('paces the next message on the same hook instance', () => {
    // A chat panel keeps one hook for the whole conversation: message after
    // message goes through the same stream, and every one of them must be paced,
    // not just the first.
    const clock = createManualClock(0)
    function Probe({ src, done }: { src: string; done: boolean }) {
      const { text } = useSmoothStream(src, { done, clock, boundary: 'char' })
      return <p data-testid="out">{text}</p>
    }

    const { getByTestId, rerender } = render(<Probe src="first answer" done={false} />)
    runFrames(clock)
    rerender(<Probe src="first answer" done />)
    runFrames(clock)
    expect(getByTestId('out').textContent).toBe('first answer')

    // The panel clears the buffer between messages, then streams the next one.
    rerender(<Probe src="" done={false} />)
    rerender(<Probe src="a whole second answer arriving" done={false} />)
    runFrames(clock, 8)

    // Still paced, not dumped: the second answer is on its way in, not already there.
    const shown = getByTestId('out').textContent!
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.length).toBeLessThan('a whole second answer arriving'.length)

    runFrames(clock)
    expect(getByTestId('out').textContent).toBe('a whole second answer arriving')
  })
})

describe('one hook, many answers', () => {
  function Probe({ src, done, clock }: { src: string; done: boolean; clock: ManualClock }) {
    const { text, phase } = useSmoothStream(src, { done, clock, boundary: 'char' })
    return (
      <p data-testid="out" data-phase={phase}>
        {text}
      </p>
    )
  }

  it('switches between finished messages instantly', () => {
    const clock = createManualClock(0)
    const { getByTestId, rerender } = render(<Probe src="first answer from history" done clock={clock} />)
    rerender(<Probe src="second, different answer" done clock={clock} />)
    expect(getByTestId('out').textContent).toBe('second, different answer')
    expect(getByTestId('out').dataset.phase).toBe('done')
  })

  it('closes the answer when its last chunk lands after done', () => {
    const clock = createManualClock(0)
    const { getByTestId, rerender } = render(<Probe src="hello wor" done={false} clock={clock} />)
    runFrames(clock, 10)
    rerender(<Probe src="hello wor" done clock={clock} />)
    rerender(<Probe src="hello world" done clock={clock} />)
    runFrames(clock)
    expect(getByTestId('out').textContent).toBe('hello world')
    expect(getByTestId('out').dataset.phase).toBe('done')
  })

  it('follows pacing props after mount', () => {
    const clock = createManualClock(0)
    function Rate({ cps }: { cps: number }) {
      const { cursor } = useSmoothStream('x'.repeat(5000), {
        clock,
        boundary: 'char',
        minCharsPerSecond: cps,
        maxCharsPerSecond: cps,
        maxLatencyMs: 1e9,
      })
      return <p data-testid="out" data-cursor={cursor} />
    }
    const { getByTestId, rerender } = render(<Rate cps={10} />)
    runFrames(clock, 10)
    const slow = Number(getByTestId('out').dataset.cursor)
    rerender(<Rate cps={1000} />)
    runFrames(clock, 10)
    expect(Number(getByTestId('out').dataset.cursor) - slow).toBeGreaterThan(100)
  })
})

describe('RevealProvider and Reveal after mount', () => {
  it('a changed stagger reaches the Reveals already mounted', () => {
    function App({ stagger, text }: { stagger: number; text: string }) {
      return (
        <RevealProvider staggerMs={stagger} unit="word">
          <Reveal initialText="">{text}</Reveal>
        </RevealProvider>
      )
    }
    const { container, rerender } = render(<App stagger={40} text="" />)
    rerender(<App stagger={100} text="aa bb" />)
    const delays = [...container.querySelectorAll<HTMLElement>('.sst-word')].map((s) =>
      parseFloat(s.style.animationDelay),
    )
    expect(delays[1] - delays[0]).toBeCloseTo(100)
  })

  it('moves to the new element when `as` changes, keeping its text', () => {
    function App({ as, text }: { as: 'span' | 'p'; text: string }) {
      return <Reveal as={as}>{text}</Reveal>
    }
    const { container, rerender } = render(<App as="span" text="one" />)
    rerender(<App as="p" text="one two" />)
    expect(container.querySelector('p')?.textContent).toBe('one two')
    expect(container.querySelector('span:not(.sst-word)')).toBeNull()
  })

  it('passes other props and the ref to the host', () => {
    const ref = createRef<HTMLElement>()
    const { container } = render(
      <Reveal as="p" id="answer" aria-live="polite" data-x="1" ref={ref}>
        text
      </Reveal>,
    )
    const host = container.querySelector('p')!
    expect(host.id).toBe('answer')
    expect(host.getAttribute('aria-live')).toBe('polite')
    expect(host.dataset.x).toBe('1')
    expect(ref.current).toBe(host)
  })
})

describe('SmoothText lifecycle', () => {
  it('calls onSettled only once the last word has finished animating', () => {
    const clock = createManualClock(0)
    let spansAtSettled = -1
    const onSettled = () => (spansAtSettled = document.querySelectorAll('.sst-word').length)
    const { rerender } = render(
      <SmoothText text="" clock={clock} boundary="char" durationMs={2000} onSettled={onSettled} />,
    )
    rerender(
      <SmoothText
        text="hello world there"
        done
        clock={clock}
        boundary="char"
        durationMs={2000}
        onSettled={onSettled}
      />,
    )
    runFrames(clock, 400)
    expect(spansAtSettled).toBe(0)
  })

  it('does not call onSettled for an answer unmounted before it was on screen', () => {
    const clock = createManualClock(0)
    let settled = 0
    const props = { clock, boundary: 'char' as const, durationMs: 2000, onSettled: () => settled++ }
    const { rerender, unmount } = render(<SmoothText text="" {...props} />)
    rerender(<SmoothText text="hello world there" done {...props} />)
    runFrames(clock, 60) // paced to the end, the last words still fading in
    unmount()
    runFrames(clock, 400)
    expect(settled).toBe(0)
  })

  it('does not announce an answer again when `as` changes', () => {
    const clock = createManualClock(0)
    let settled = 0
    const props = { clock, text: 'an old answer', done: true, onSettled: () => settled++ }
    const { rerender, container } = render(<SmoothText as="p" {...props} />)
    expect(settled).toBe(1)
    rerender(<SmoothText as="div" {...props} />)
    runFrames(clock, 100)
    expect(container.querySelector('div')?.textContent).toBe('an old answer')
    expect(settled).toBe(1)
    // The next answer on the new element is announced as usual.
    rerender(<SmoothText as="div" {...props} text="a new answer" />)
    runFrames(clock, 100)
    expect(settled).toBe(2)
  })

  it('shows history at once and settles it once', () => {
    let settled = 0
    const { container } = render(
      <SmoothText text="an old answer" done clock={createManualClock(0)} onSettled={() => settled++} />,
    )
    expect(container.textContent).toBe('an old answer')
    expect(settled).toBe(1)
  })

  it('carries on pacing after a StrictMode double mount', () => {
    const clock = createManualClock(0)
    const { container, rerender } = render(
      <StrictMode>
        <SmoothText text="" clock={clock} boundary="char" />
      </StrictMode>,
    )
    rerender(
      <StrictMode>
        <SmoothText text="hello world" clock={clock} boundary="char" />
      </StrictMode>,
    )
    runFrames(clock)
    expect(container.textContent).toBe('hello world')
  })

  it('moves to a new element when `as` changes without replaying', () => {
    const clock = createManualClock(0)
    const { container, rerender } = render(<SmoothText as="span" text="one two" done clock={clock} />)
    rerender(<SmoothText as="p" text="one two" done clock={clock} />)
    expect(container.querySelector('p')?.textContent).toBe('one two')
    expect(container.querySelectorAll('.sst-word')).toHaveLength(0)
  })

  it('passes attributes, the ref and a unit class through', () => {
    const clock = createManualClock(0)
    const ref = createRef<HTMLElement>()
    const { container, rerender } = render(
      <SmoothText
        text=""
        as="p"
        id="a"
        className="host"
        unitClassName="unit"
        aria-busy
        ref={ref}
        clock={clock}
        boundary="char"
      />,
    )
    rerender(
      <SmoothText
        text="hello"
        as="p"
        id="a"
        className="host"
        unitClassName="unit"
        aria-busy
        ref={ref}
        clock={clock}
        boundary="char"
      />,
    )
    runFrames(clock, 10)
    const host = container.querySelector('p')!
    expect(ref.current).toBe(host)
    expect(host.id).toBe('a')
    expect(host.className).toBe('host')
    expect(host.getAttribute('aria-busy')).toBe('true')
    expect(host.querySelector('.sst-word.unit')).not.toBeNull()
  })
})

describe('useSmoothText', () => {
  it('renders only when the visible text or phase changes', () => {
    const clock = createManualClock(0)
    let lean = 0
    let full = 0
    function Lean({ src }: { src: string }) {
      useSmoothText(src, { clock })
      lean++
      return null
    }
    function Full({ src }: { src: string }) {
      useSmoothStream(src, { clock })
      full++
      return null
    }
    const { rerender } = render(
      <>
        <Lean src="" />
        <Full src="" />
      </>,
    )
    let src = ''
    for (let i = 0; i < 40; i++) {
      src += 'word '
      rerender(
        <>
          <Lean src={src} />
          <Full src={src} />
        </>,
      )
      act(() => clock.advance(16))
    }
    expect(lean).toBeLessThan(full)
  })

  it('gives the same text as useSmoothStream, history included', () => {
    function Probe({ src, done }: { src: string; done: boolean }) {
      const { text, phase } = useSmoothText(src, { done, clock: createManualClock(0) })
      return <p data-phase={phase}>{text}</p>
    }
    const { container } = render(<Probe src="an old answer" done />)
    expect(container.textContent).toBe('an old answer')
    expect(container.querySelector('p')!.dataset.phase).toBe('done')
  })
})

describe('settings that change at runtime', () => {
  // A target this far away, and a producer never taken for silent, pin the rate to the floor.
  const floor = { targetLatencyMs: 1e6, maxLatencyMs: 1e9, idleGraceMs: 1e9 }

  it('keeps a setting changed through setOptions until its own prop changes', () => {
    const clock = createManualClock(0)
    let controller: ReturnType<typeof useSmoothStreamController> | null = null
    function Probe({ min }: { min?: number }) {
      controller = useSmoothStreamController({
        clock,
        boundary: 'char',
        ...floor,
        ...(min === undefined ? {} : { minCharsPerSecond: min }),
      })
      return null
    }
    const { rerender } = render(<Probe min={20} />)
    act(() => controller!.push('x'.repeat(400)))
    runFrames(clock, 30)
    expect(controller!.charsPerSecond).toBeCloseTo(20)

    act(() => controller!.setOptions({ minCharsPerSecond: 40 }))
    rerender(<Probe min={20} />) // what the next chunk would cause
    runFrames(clock, 30)
    expect(controller!.charsPerSecond).toBeCloseTo(40)

    rerender(<Probe min={25} />)
    runFrames(clock, 30)
    expect(controller!.charsPerSecond).toBeCloseTo(25)

    // A prop that is gone returns to the default.
    rerender(<Probe />)
    runFrames(clock, 30)
    expect(controller!.charsPerSecond).toBeCloseTo(12)
  })

  it('sees a settings object changed in place', () => {
    const clock = createManualClock(0)
    const options = { clock, boundary: 'char' as const, ...floor, minCharsPerSecond: 20 }
    let controller: ReturnType<typeof useSmoothStreamController> | null = null
    function Probe() {
      controller = useSmoothStreamController(options)
      return null
    }
    const { rerender } = render(<Probe />)
    act(() => controller!.push('x'.repeat(400)))
    runFrames(clock, 30)
    options.minCharsPerSecond = 40
    rerender(<Probe />)
    runFrames(clock, 30)
    expect(controller!.charsPerSecond).toBeCloseTo(40)
  })

  it('returns a SmoothText setting that is no longer passed to its default', () => {
    const { container, rerender } = render(<SmoothText text="" durationMs={900} />)
    const host = container.firstElementChild as HTMLElement
    expect(host.style.getPropertyValue('--sst-duration')).toBe('900ms')
    rerender(<SmoothText text="" />)
    expect(host.style.getPropertyValue('--sst-duration')).toBe('380ms')
  })
})

describe('RevealProvider resetKey', () => {
  it('starts a new message on a fresh queue, even for a paragraph mounted with the new key', () => {
    const message = (key: number, id: string, text: string) => (
      <RevealProvider resetKey={key}>
        <Reveal key={id} initialText="">
          {text}
        </Reveal>
      </RevealProvider>
    )
    const { container, rerender } = render(message(1, 'old', 'the'))
    // The previous answer grows, queueing a wave of its own.
    rerender(message(1, 'old', 'the tail of the previous answer, long enough to queue a wave'))
    const delays = () =>
      [...container.querySelectorAll<HTMLElement>('.sst-word')].map((span) => span.style.animationDelay)
    expect(delays().at(-1)).not.toBe('0ms')

    rerender(message(2, 'new', 'a new answer'))
    expect(delays()[0]).toBe('0ms')
    // The slots it took are not handed out again as the paragraph grows.
    const before = delays()
    rerender(message(2, 'new', 'a new answer, and more'))
    const after = delays().slice(before.length)
    expect(parseFloat(after[0])).toBeGreaterThanOrEqual(parseFloat(before.at(-1)!))
  })

  it('takes its slots once under StrictMode, which mounts every paragraph twice', () => {
    const message = (key: number, id: string, text: string) => (
      <StrictMode>
        <RevealProvider resetKey={key}>
          <Reveal key={id} initialText="">
            {text}
          </Reveal>
        </RevealProvider>
      </StrictMode>
    )
    const { container, rerender } = render(message(1, 'old', 'the first answer'))
    const delays = () =>
      [...container.querySelectorAll<HTMLElement>('.sst-word')].map((span) => span.style.animationDelay)
    expect(delays()[0]).toBe('0ms')
    rerender(message(1, 'old', 'the first answer, long enough to queue a wave of its own'))
    rerender(message(2, 'new', 'a new answer'))
    expect(delays()[0]).toBe('0ms')
  })
})

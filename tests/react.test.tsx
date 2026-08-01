// @vitest-environment jsdom
import { act, render, cleanup } from '@testing-library/react'
import { StrictMode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { Reveal, RevealProvider, SmoothText, useSmoothStream, useSmoothStreamController } from '../src/react/index'
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
      return <p data-testid="out" data-phase={phase}>{text}</p>
    }
    const { getByTestId } = render(<Probe />)
    expect(getByTestId('out').textContent).toBe('a full historical answer')
  })

  it('paces a growing source and reports its phase', () => {
    const clock = createManualClock(0)
    function Probe({ src, done }: { src: string; done: boolean }) {
      const { text, phase } = useSmoothStream(src, { done, clock, boundary: 'char' })
      return <p data-testid="out" data-phase={phase}>{text}</p>
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
        <RevealProvider>
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
        <RevealProvider>
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
        <RevealProvider>
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
        <RevealProvider staggerMs={40}>
          <Reveal as="p">{a}</Reveal>
          <Reveal as="p">{b}</Reveal>
        </RevealProvider>
      )
    }

    const { container, rerender } = render(<Answer a="one" b="two" />)
    rerender(<Answer a="one three" b="two four" />)
    const delays = [...container.querySelectorAll('.sst-word')].map((node) => (node as HTMLElement).style.animationDelay)
    expect(delays).toHaveLength(2)
    expect(new Set(delays).size).toBe(2)
  })

  it('animates on mount when told the element starts empty', () => {
    const { container } = render(
      <RevealProvider>
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
    const { container } = render(<Reveal as="p" className="answer">hi</Reveal>)
    expect(container.querySelector('p.answer')).toBeTruthy()
  })

  it('works without a provider', () => {
    const { container, rerender } = render(<Reveal>one</Reveal>)
    rerender(<Reveal>one two</Reveal>)
    expect(words(container)).toEqual(['two'])
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

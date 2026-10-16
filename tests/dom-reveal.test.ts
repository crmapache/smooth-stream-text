// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createReveal, createSmoothText, createWaveTimeline } from '../src/dom/index'
import { createManualClock } from '../src/index'

let host: HTMLElement

beforeEach(() => {
  document.body.innerHTML = ''
  document.head.innerHTML = ''
  host = document.createElement('div')
  document.body.appendChild(host)
})

const words = (el: ParentNode) => [...el.querySelectorAll('.sst-word')].map((node) => node.textContent)

describe('createReveal', () => {
  it('seeds its first update as already settled, with no spans', () => {
    createReveal(host, { unit: 'word' }).update('already here')
    expect(host.textContent).toBe('already here')
    expect(words(host)).toHaveLength(0)
  })

  it('wraps only newly appended words', () => {
    const reveal = createReveal(host, { unit: 'word' })
    reveal.update('one two')
    reveal.update('one two three four')
    expect(host.textContent).toBe('one two three four')
    expect(words(host)).toEqual(['three', 'four'])
  })

  it('keeps textContent exactly equal to the visible text at all times', () => {
    const reveal = createReveal(host, { unit: 'word' })
    for (const text of ['a', 'a b', 'a b c', 'a b c d']) {
      reveal.update(text)
      expect(host.textContent).toBe(text)
    }
  })

  it('collapses finished words back into plain text', () => {
    const clock = createManualClock(0)
    const reveal = createReveal(host, { unit: 'word', clock, durationMs: 100, staggerMs: 0 })
    reveal.update('')
    reveal.update('hello world')
    expect(words(host).length).toBeGreaterThan(0)

    clock.advance(500)
    expect(words(host)).toHaveLength(0)
    expect(host.textContent).toBe('hello world')
    expect(host.childNodes).toHaveLength(1)
    expect(host.firstChild?.nodeType).toBe(Node.TEXT_NODE)
  })

  it('keeps only a short tail of spans across a long stream', () => {
    const clock = createManualClock(0)
    const reveal = createReveal(host, { unit: 'word', clock, durationMs: 380, staggerMs: 36 })
    reveal.update('')
    let text = ''
    for (let i = 0; i < 400; i++) {
      text += `word${i} `
      reveal.update(text)
      clock.advance(16)
    }
    expect(words(host).length).toBeLessThan(40)
    expect(host.textContent).toBe(text)
  })

  it('animates its first update when told the element starts empty', () => {
    // The case a markdown renderer hits constantly: a node created for text that
    // has just arrived, which must animate rather than seed.
    const reveal = createReveal(host, { unit: 'word', initialText: '' })
    reveal.update('brand new')
    expect(words(host)).toEqual(['brand', 'new'])
    expect(host.textContent).toBe('brand new')
  })

  it('accepts a non-empty initialText as already settled', () => {
    const reveal = createReveal(host, { unit: 'word', initialText: 'already here' })
    expect(host.textContent).toBe('already here')
    reveal.update('already here and more')
    expect(words(host)).toEqual(['and', 'more'])
    expect(host.textContent).toBe('already here and more')
  })

  it('silently reseeds when the new text is not an extension of the old', () => {
    const reveal = createReveal(host, { unit: 'word' })
    reveal.update('first answer')
    reveal.update('a completely different answer')
    expect(host.textContent).toBe('a completely different answer')
    expect(words(host)).toHaveLength(0)
  })

  it('creates no spans at all under reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
    const reveal = createReveal(host, { unit: 'word' })
    reveal.update('')
    reveal.update('hello world')
    expect(words(host)).toHaveLength(0)
    expect(host.textContent).toBe('hello world')
    vi.unstubAllGlobals()
  })

  it('honours respectReducedMotion: false', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
    const reveal = createReveal(host, { unit: 'word', respectReducedMotion: false })
    reveal.update('')
    reveal.update('hello world')
    expect(words(host)).toEqual(['hello', 'world'])
    vi.unstubAllGlobals()
  })

  it('flush() settles everything immediately', () => {
    const reveal = createReveal(host, { unit: 'word', durationMs: 10000 })
    reveal.update('')
    reveal.update('hello world')
    reveal.flush()
    expect(words(host)).toHaveLength(0)
    expect(host.textContent).toBe('hello world')
  })

  it('reset() clears the host and seeds the given text', () => {
    const reveal = createReveal(host, { unit: 'word' })
    reveal.update('')
    reveal.update('hello world')
    reveal.reset('fresh start')
    expect(words(host)).toHaveLength(0)
    expect(host.textContent).toBe('fresh start')
  })

  it('animates by grapheme cluster in char mode', () => {
    const reveal = createReveal(host, { unit: 'char' })
    reveal.update('')
    reveal.update('hi\u{1F600}')
    expect(words(host)).toEqual(['h', 'i', '\u{1F600}'])
  })

  it('leaves whitespace unwrapped so line breaking is untouched', () => {
    const reveal = createReveal(host, { unit: 'word' })
    reveal.update('')
    reveal.update('one two')
    const spaces = [...host.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent === ' ')
    expect(spaces).toHaveLength(1)
  })

  it('drops the block box when there is no shift to animate', () => {
    const reveal = createReveal(host, { unit: 'word', translatePx: 0 })
    reveal.update('')
    reveal.update('inline')
    expect(host.querySelector('.sst-word')?.classList.contains('sst-flat')).toBe(true)
  })

  it('injects its stylesheet exactly once', () => {
    createReveal(document.createElement('div'))
    createReveal(document.createElement('div'))
    expect(document.querySelectorAll('style[data-smooth-stream-text]')).toHaveLength(1)
  })

  it('injects nothing when asked not to', () => {
    createReveal(host, { unit: 'word', injectStyles: false })
    expect(document.querySelectorAll('style[data-smooth-stream-text]')).toHaveLength(0)
  })

  it('exposes every visual parameter as a custom property', () => {
    createReveal(host, { unit: 'word', durationMs: 500, blurPx: 8, translatePx: 6, easing: 'linear' })
    expect(host.style.getPropertyValue('--sst-duration')).toBe('500ms')
    expect(host.style.getPropertyValue('--sst-blur')).toBe('8px')
    expect(host.style.getPropertyValue('--sst-translate')).toBe('6px')
    expect(host.style.getPropertyValue('--sst-easing')).toBe('linear')
  })

  it('shares one wave across hosts when given a shared timeline', () => {
    const timeline = createWaveTimeline({ staggerMs: 40, maxWaveLagMs: 240 })
    const clock = createManualClock(1000)
    const a = document.createElement('div')
    const b = document.createElement('div')
    document.body.append(a, b)

    const revealA = createReveal(a, { unit: 'word', timeline, clock })
    const revealB = createReveal(b, { unit: 'word', timeline, clock })
    revealA.update('')
    revealB.update('')
    revealA.update('one')
    revealB.update('two')

    const delayOf = (el: Element) => (el.querySelector('.sst-word') as HTMLElement).style.animationDelay
    expect(delayOf(a)).toBe('0ms')
    expect(delayOf(b)).toBe('40ms')
  })
})

describe('createReveal - order, folding and selection', () => {
  it('keeps the text in order when reduced motion switches on mid-wave', () => {
    let reduce = false
    vi.stubGlobal('matchMedia', () => ({ matches: reduce, addEventListener() {}, removeEventListener() {} }))
    const clock = createManualClock(0)
    const reveal = createReveal(host, { unit: 'word', clock, initialText: '' })
    reveal.update('one two')
    reduce = true
    reveal.update('one two three')
    expect(host.textContent).toBe('one two three')
    clock.advance(5000)
    expect(host.textContent).toBe('one two three')
    expect(host.childNodes).toHaveLength(1)
    vi.unstubAllGlobals()
  })

  it('folds a whole pass into the settled text with one write', () => {
    const clock = createManualClock(0)
    const reveal = createReveal(host, { unit: 'word', clock, initialText: '' })
    reveal.update('a b c d e')
    const settled = host.firstChild as Text
    const writes = vi.spyOn(settled, 'appendData')
    clock.advance(5000)
    expect(writes).toHaveBeenCalledTimes(1)
    expect(host.textContent).toBe('a b c d e')
  })

  it('keeps a selection inside the settled text when more folds in', () => {
    const clock = createManualClock(0)
    const reveal = createReveal(host, { unit: 'word', clock, initialText: 'Settled ' })
    reveal.update('Settled text')
    const selection = document.getSelection()!
    selection.setBaseAndExtent(host.firstChild!, 0, host.firstChild!, 7)
    expect(selection.toString()).toBe('Settled')
    clock.advance(5000)
    expect(selection.toString()).toBe('Settled')
  })

  it('carries a selection inside an animating word over to the folded text', () => {
    const clock = createManualClock(0)
    const reveal = createReveal(host, { unit: 'word', clock, initialText: '' })
    reveal.update('hello world')
    const word = host.querySelector('.sst-word')!.firstChild!
    const selection = document.getSelection()!
    selection.setBaseAndExtent(word, 1, word, 4)
    expect(selection.toString()).toBe('ell')
    clock.advance(5000)
    expect(host.querySelectorAll('.sst-word')).toHaveLength(0)
    expect(selection.toString()).toBe('ell')
  })

  it('keeps a selection running from settled text into a word, and its direction', () => {
    const clock = createManualClock(0)
    const reveal = createReveal(host, { unit: 'word', clock, initialText: 'Settled ' })
    reveal.update('Settled text hello')
    const word = host.querySelectorAll('.sst-word')[1].firstChild!
    const selection = document.getSelection()!
    selection.setBaseAndExtent(word, 3, host.firstChild!, 4)
    expect(selection.toString()).toBe('led text hel')
    reveal.flush()
    expect(selection.toString()).toBe('led text hel')
    expect(selection.anchorOffset).toBeGreaterThan(selection.focusOffset)
  })

  it('animates only the tail of a huge batch and shows the rest at once', () => {
    const clock = createManualClock(0)
    const reveal = createReveal(host, { unit: 'word', clock, initialText: '', maxAnimatedUnits: 20 })
    const text = 'word '.repeat(2000)
    reveal.update(text)
    expect(words(host)).toHaveLength(20)
    expect(host.childNodes.length).toBeLessThan(50)
    expect(host.textContent).toBe(text)
    clock.advance(5000)
    expect(host.childNodes).toHaveLength(1)
    expect(host.textContent).toBe(text)
  })

  it('animates a long word inline, so it can wrap while it appears', () => {
    const reveal = createReveal(host, { unit: 'word', initialText: '' })
    reveal.update('see https://example.com/a/rather/long/path ok')
    const spans = [...host.querySelectorAll('.sst-word')]
    expect(spans[1].classList.contains('sst-flat')).toBe(true)
    expect(spans[0].classList.contains('sst-flat')).toBe(false)
  })

  it('marks its units when it is told to animate under reduced motion anyway', () => {
    const reveal = createReveal(host, { unit: 'word', initialText: '', respectReducedMotion: false })
    reveal.update('hello')
    expect(host.querySelector('.sst-word')!.classList.contains('sst-motion')).toBe(true)
  })

  it('reports when the last unit has finished', () => {
    const clock = createManualClock(0)
    const reveal = createReveal(host, { unit: 'word', clock, initialText: '' })
    const idle = vi.fn()
    reveal.onIdle(idle)
    expect(reveal.animating).toBe(false)
    reveal.update('one two')
    expect(reveal.animating).toBe(true)
    clock.advance(16)
    expect(idle).not.toHaveBeenCalled()
    clock.advance(5000)
    expect(reveal.animating).toBe(false)
    expect(idle).toHaveBeenCalledTimes(1)
    reveal.update('one two three')
    reveal.flush()
    expect(idle).toHaveBeenCalledTimes(2)
  })

  it('does nothing after destroy, and leaves the text as plain text', () => {
    const clock = createManualClock(0)
    const reveal = createReveal(host, { unit: 'word', clock, initialText: '' })
    reveal.update('one two')
    reveal.destroy()
    expect(host.childNodes).toHaveLength(1)
    reveal.update('one two three')
    reveal.reset('other')
    expect(host.textContent).toBe('one two')
  })

  it('puts its styles inside the shadow root it renders in', () => {
    const outer = document.createElement('div')
    document.body.appendChild(outer)
    const shadow = outer.attachShadow({ mode: 'open' })
    const inner = document.createElement('p')
    shadow.appendChild(inner)
    createReveal(inner, { unit: 'word', initialText: '' }).update('shadowed')
    const inShadow =
      shadow.querySelector('style[data-smooth-stream-text]') !== null || shadow.adoptedStyleSheets?.length > 0
    expect(inShadow).toBe(true)
  })
})

describe('the unit setting', () => {
  it('animates letters by default, each as plain inline text', () => {
    const reveal = createReveal(host, { initialText: '' })
    reveal.update('hi you')
    const spans = [...host.querySelectorAll('.sst-word')]
    expect(spans.map((span) => span.textContent)).toEqual(['h', 'i', 'y', 'o', 'u'])
    for (const span of spans) expect(span.classList.contains('sst-flat')).toBe(true)
  })

  it('one key switches pacing and reveal to whole words together', () => {
    const clock = createManualClock(0)
    const handle = createSmoothText(host, { clock, unit: 'word', initialText: '' })
    handle.push('several whole words arrive one after another here')
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      clock.advance(16)
      for (const span of host.querySelectorAll('.sst-word')) seen.add(span.textContent!)
    }
    expect([...seen].sort()).toEqual(['after', 'another', 'arrive', 'here', 'one', 'several', 'whole', 'words'].sort())
    handle.destroy()
  })
})

describe('styles without constructable stylesheets', () => {
  it('looks for its style element once, not on every update', () => {
    expect('adoptedStyleSheets' in document).toBe(false) // the fallback this is about
    const spy = vi.spyOn(document, 'querySelector')
    const reveal = createReveal(host, { unit: 'word', initialText: '' })
    for (let i = 1; i <= 50; i++) reveal.update('word '.repeat(i))
    const lookups = spy.mock.calls.filter(([selector]) => String(selector).startsWith('style')).length
    spy.mockRestore()
    expect(lookups).toBeLessThanOrEqual(1)
    reveal.destroy()
  })

  it('puts the styles back when the page removed them', () => {
    const reveal = createReveal(host, { unit: 'word', initialText: '' })
    reveal.update('one')
    document.querySelector('style[data-smooth-stream-text]')?.remove()
    reveal.update('one two')
    expect(document.querySelector('style[data-smooth-stream-text]')).not.toBeNull()
    reveal.destroy()
  })
})

describe('the animation cap', () => {
  it('holds with a fractional value instead of switching off', () => {
    const reveal = createReveal(host, { unit: 'word', maxAnimatedUnits: 2.5, initialText: '' })
    reveal.update('one two three four five six seven eight nine ten')
    expect(host.querySelectorAll('.sst-word')).toHaveLength(2)
    reveal.destroy()
  })
})

describe('createSmoothText', () => {
  it('paces pushed deltas onto the element', () => {
    const clock = createManualClock(0)
    const handle = createSmoothText(host, { clock, boundary: 'char' })
    handle.push('hello world')
    clock.advance(16)
    expect(host.textContent!.length).toBeLessThan(11)

    for (let i = 0; i < 200; i++) clock.advance(16)
    expect(host.textContent).toBe('hello world')
    handle.destroy()
  })

  it('accepts a growing string as well as deltas', () => {
    const clock = createManualClock(0)
    const handle = createSmoothText(host, { clock, boundary: 'char' })
    handle.setText('hello')
    handle.setText('hello world')
    for (let i = 0; i < 200; i++) clock.advance(16)
    expect(host.textContent).toBe('hello world')
    handle.destroy()
  })

  it('flush() shows everything at once', () => {
    const clock = createManualClock(0)
    const handle = createSmoothText(host, { clock, boundary: 'char' })
    handle.push('the whole answer arrives')
    handle.flush()
    expect(host.textContent).toBe('the whole answer arrives')
    handle.destroy()
  })

  it('reports its phase through the stream state', () => {
    const clock = createManualClock(0)
    const handle = createSmoothText(host, { clock, boundary: 'char' })
    expect(handle.state.phase).toBe('idle')
    handle.push('hi')
    handle.end()
    for (let i = 0; i < 100; i++) clock.advance(16)
    expect(handle.state.phase).toBe('done')
    handle.destroy()
  })

  /** An answer closed and fully paced while its last words are still fading in. */
  function midWave() {
    const clock = createManualClock(0)
    const handle = createSmoothText(host, { clock, boundary: 'char', durationMs: 2000, initialText: '' })
    const announced: string[] = []
    handle.onSettled(() => announced.push(handle.state.source))
    handle.push('the first answer')
    handle.end()
    for (let i = 0; i < 40 && handle.state.phase !== 'done'; i++) clock.advance(16)
    expect(handle.state.phase).toBe('done')
    expect(handle.settled).toBe(false)
    return { clock, handle, announced }
  }

  it('announces only the new answer when one replaces another mid-animation', () => {
    const { clock, handle, announced } = midWave()
    handle.reset('the second answer')
    handle.end()
    for (let i = 0; i < 200; i++) clock.advance(16)
    expect(announced).toEqual(['the second answer'])
    handle.destroy()
  })

  it('announces an answer paused mid-animation once it is drawn again', () => {
    const { clock, handle, announced } = midWave()
    handle.pause()
    expect(announced).toEqual([])
    expect(handle.settled).toBe(false)
    handle.resume()
    expect(handle.settled).toBe(true)
    for (let i = 0; i < 200; i++) clock.advance(16)
    expect(announced).toEqual(['the first answer'])
    handle.destroy()
  })

  it('never announces an answer whose element went away before it was on screen', () => {
    const { clock, handle, announced } = midWave()
    handle.pause()
    handle.destroy()
    for (let i = 0; i < 200; i++) clock.advance(16)
    expect(announced).toEqual([])
  })

  it('destroy() stops all work and leaves the element alone', () => {
    const clock = createManualClock(0)
    const handle = createSmoothText(host, { clock })
    handle.push('abc')
    handle.destroy()
    const before = host.textContent
    for (let i = 0; i < 50; i++) clock.advance(16)
    expect(host.textContent).toBe(before)
  })
})

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
    createReveal(host).update('already here')
    expect(host.textContent).toBe('already here')
    expect(words(host)).toHaveLength(0)
  })

  it('wraps only newly appended words', () => {
    const reveal = createReveal(host)
    reveal.update('one two')
    reveal.update('one two three four')
    expect(host.textContent).toBe('one two three four')
    expect(words(host)).toEqual(['three', 'four'])
  })

  it('keeps textContent exactly equal to the visible text at all times', () => {
    const reveal = createReveal(host)
    for (const text of ['a', 'a b', 'a b c', 'a b c d']) {
      reveal.update(text)
      expect(host.textContent).toBe(text)
    }
  })

  it('collapses finished words back into plain text', () => {
    const clock = createManualClock(0)
    const reveal = createReveal(host, { clock, durationMs: 100, staggerMs: 0 })
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
    const reveal = createReveal(host, { clock, durationMs: 380, staggerMs: 36 })
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
    const reveal = createReveal(host, { initialText: '' })
    reveal.update('brand new')
    expect(words(host)).toEqual(['brand', 'new'])
    expect(host.textContent).toBe('brand new')
  })

  it('accepts a non-empty initialText as already settled', () => {
    const reveal = createReveal(host, { initialText: 'already here' })
    expect(host.textContent).toBe('already here')
    reveal.update('already here and more')
    expect(words(host)).toEqual(['and', 'more'])
    expect(host.textContent).toBe('already here and more')
  })

  it('silently reseeds when the new text is not an extension of the old', () => {
    const reveal = createReveal(host)
    reveal.update('first answer')
    reveal.update('a completely different answer')
    expect(host.textContent).toBe('a completely different answer')
    expect(words(host)).toHaveLength(0)
  })

  it('creates no spans at all under reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
    const reveal = createReveal(host)
    reveal.update('')
    reveal.update('hello world')
    expect(words(host)).toHaveLength(0)
    expect(host.textContent).toBe('hello world')
    vi.unstubAllGlobals()
  })

  it('honours respectReducedMotion: false', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
    const reveal = createReveal(host, { respectReducedMotion: false })
    reveal.update('')
    reveal.update('hello world')
    expect(words(host)).toEqual(['hello', 'world'])
    vi.unstubAllGlobals()
  })

  it('flush() settles everything immediately', () => {
    const reveal = createReveal(host, { durationMs: 10000 })
    reveal.update('')
    reveal.update('hello world')
    reveal.flush()
    expect(words(host)).toHaveLength(0)
    expect(host.textContent).toBe('hello world')
  })

  it('reset() clears the host and seeds the given text', () => {
    const reveal = createReveal(host)
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
    const reveal = createReveal(host)
    reveal.update('')
    reveal.update('one two')
    const spaces = [...host.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent === ' ')
    expect(spaces).toHaveLength(1)
  })

  it('drops the block box when there is no shift to animate', () => {
    const reveal = createReveal(host, { translatePx: 0 })
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
    createReveal(host, { injectStyles: false })
    expect(document.querySelectorAll('style[data-smooth-stream-text]')).toHaveLength(0)
  })

  it('exposes every visual parameter as a custom property', () => {
    createReveal(host, { durationMs: 500, blurPx: 8, translatePx: 6, easing: 'linear' })
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

    const revealA = createReveal(a, { timeline, clock })
    const revealB = createReveal(b, { timeline, clock })
    revealA.update('')
    revealB.update('')
    revealA.update('one')
    revealB.update('two')

    const delayOf = (el: Element) => (el.querySelector('.sst-word') as HTMLElement).style.animationDelay
    expect(delayOf(a)).toBe('0ms')
    expect(delayOf(b)).toBe('40ms')
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

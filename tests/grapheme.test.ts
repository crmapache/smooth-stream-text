import { describe, expect, it } from 'vitest'
import { clampToGraphemeBoundary as clamp, lastClusterStart, splitClusters } from '../src/core/grapheme'

describe('clampToGraphemeBoundary', () => {
  it('leaves plain ascii positions alone', () => {
    expect(clamp('hello', 3)).toBe(3)
  })

  it('clamps the ends', () => {
    expect(clamp('hello', 0)).toBe(0)
    expect(clamp('hello', 99)).toBe(5)
    expect(clamp('hello', -1)).toBe(0)
  })

  it('never splits a surrogate pair', () => {
    const text = 'a\u{1F600}b' // a + emoji (two code units) + b
    expect(clamp(text, 2)).toBe(1)
    expect(clamp(text, 3)).toBe(3)
  })

  it('never splits a combining mark from its base', () => {
    const text = 'éx' // e + combining acute + x
    expect(clamp(text, 1)).toBe(0)
    expect(clamp(text, 2)).toBe(2)
  })

  it('never splits a ZWJ sequence', () => {
    const text = '\u{1F468}‍\u{1F4BB}' // man technologist
    expect(clamp(text, 2)).toBe(0)
    expect(clamp(text, 3)).toBe(0)
    expect(clamp(text, 5)).toBe(5)
  })

  it('never splits a skin tone modifier or a variation selector', () => {
    expect(clamp('\u{1F44B}\u{1F3FB}', 2)).toBe(0)
    expect(clamp('❤️', 1)).toBe(0)
  })

  it('never splits a keycap sequence', () => {
    const keycap = '1️⃣'
    expect(clamp(keycap, 1)).toBe(0)
    expect(clamp(keycap, 2)).toBe(0)
    expect(clamp(keycap, 3)).toBe(3)
  })

  it('never splits a flag (regional indicator pair)', () => {
    const flag = '\u{1F1FA}\u{1F1F8}' // US
    expect(clamp(flag, 2)).toBe(0)
    expect(clamp(flag, 4)).toBe(4)
  })

  it('lets a second flag start on its own boundary', () => {
    const two = '\u{1F1FA}\u{1F1F8}\u{1F1EB}\u{1F1F7}' // US then FR
    expect(clamp(two, 4)).toBe(4)
  })

  it('terminates on pathological input', () => {
    const nasty = 'a' + '́'.repeat(200)
    expect(clamp(nasty, 100)).toBeGreaterThanOrEqual(0)
  })
})

describe('clampToGraphemeBoundary against Unicode segmentation', () => {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const boundariesOf = (text: string) =>
    new Set([...segmenter.segment(text)].map((part) => part.index).concat(text.length))

  const cases: [string, string][] = [
    ['an Indic conjunct', 'क्षमा x'],
    ['Hangul jamo', '각x'],
    ['a tag-sequence flag', '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}x'],
    ['CRLF', 'a\r\nb'],
    ['a long run of combining marks', 'e' + '́'.repeat(200) + 'x'],
    ['a long run of flags', '\u{1F1FA}\u{1F1F8}'.repeat(40) + 'x'],
    ['ZWJ, skin tones and keycaps', '\u{1F468}‍\u{1F469}‍\u{1F467} \u{1F44D}\u{1F3FD} 1️⃣'],
  ]

  for (const [name, text] of cases) {
    it(`finds the largest real boundary for ${name}`, () => {
      const real = boundariesOf(text)
      for (let index = 0; index <= text.length; index++) {
        const got = clamp(text, index)
        expect(real.has(got)).toBe(true)
        for (let between = got + 1; between <= index; between++) expect(real.has(between)).toBe(false)
      }
    })
  }
})

describe('lastClusterStart', () => {
  it('points at the start of the final cluster', () => {
    expect(lastClusterStart('ab')).toBe(1)
    expect(lastClusterStart('a\u{1F600}')).toBe(1)
    expect(lastClusterStart('é')).toBe(0)
    expect(lastClusterStart('')).toBe(0)
  })
})

describe('splitClusters', () => {
  it('splits in one pass and round-trips', () => {
    const text = 'a\u{1F1FA}\u{1F1F8}é\u{1F468}‍\u{1F4BB}क्ष'
    const clusters = splitClusters(text)
    expect(clusters.join('')).toBe(text)
    expect(clusters).toEqual(['a', '\u{1F1FA}\u{1F1F8}', 'é', '\u{1F468}‍\u{1F4BB}', 'क्ष'])
  })
})

describe('a cluster longer than the window', () => {
  it('is never cut, wherever the window happens to open inside it', () => {
    const chain = Array.from({ length: 30 }, () => '\u{1F468}').join('‍')
    const text = `ab ${chain} c`
    const start = 3
    const end = start + chain.length
    // The runtime agrees this is one cluster, or the test proves nothing.
    expect([...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((s) => s.index)).toContain(
      end,
    )
    for (let index = start + 1; index < end; index++) {
      expect(clamp(text, index), `cut at ${index}`).toBe(start)
    }
  })
})

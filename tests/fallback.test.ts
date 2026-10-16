import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Engines without Intl.Segmenter still get grapheme-safe cuts and word stops,
// through the hand-written approximation.
describe('without Intl.Segmenter', () => {
  let mod: typeof import('../src/index')
  let split: typeof import('../src/reveal/split')

  beforeAll(async () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined })
    vi.resetModules()
    mod = await import('../src/index')
    split = await import('../src/reveal/split')
  })

  afterAll(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('still never splits a surrogate pair, a combining mark or a flag', () => {
    const clamp = mod.clampToGraphemeBoundary
    expect(clamp('a\u{1F600}b', 2)).toBe(1)
    expect(clamp('éx', 1)).toBe(0)
    expect(clamp('\u{1F1FA}\u{1F1F8}', 2)).toBe(0)
  })

  it('still stops between whole words', () => {
    const resolver = mod.createBoundaryResolver('markdown', 'word')
    expect(resolver.resolve('hello brave world', 9, false)).toBe(6)
  })

  it('lets a live run without spaces advance a character at a time', () => {
    const source = '今天天气很好我们一起去公园散步吧模型正在输出文本'
    const resolver = mod.createBoundaryResolver('markdown', 'word')
    for (let end = 1; end <= source.length; end++) {
      // Only the last character waits, as it would in any script.
      expect(resolver.resolve(source.slice(0, end), end, false, false)).toBe(end - 1)
    }
  })

  it('falls back to single characters in scripts without spaces', () => {
    const pieces = split.splitPieces('今天天气', 'word').map((piece) => piece.text)
    expect(pieces).toEqual(['今', '天', '天', '气'])
    expect(split.splitPieces('a\u{1F600}', 'char').map((piece) => piece.text)).toEqual(['a', '\u{1F600}'])
  })
})

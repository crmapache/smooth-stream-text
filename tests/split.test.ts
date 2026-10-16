import { describe, expect, it } from 'vitest'
import { splitPieces } from '../src/reveal/split'

describe('splitPieces', () => {
  it('keeps whitespace as separate, non-animatable pieces', () => {
    expect(splitPieces('a b', 'word')).toEqual([
      { text: 'a', animatable: true },
      { text: ' ', animatable: false },
      { text: 'b', animatable: true },
    ])
  })

  it('treats newlines as whitespace so line structure survives', () => {
    expect(splitPieces('a\n\nb', 'word').map((p) => p.text)).toEqual(['a', '\n\n', 'b'])
  })

  it('splits into grapheme clusters in char mode', () => {
    expect(splitPieces('a\u{1F600}', 'char').map((p) => p.text)).toEqual(['a', '\u{1F600}'])
  })

  it('keeps a ZWJ emoji together in char mode', () => {
    const family = '\u{1F468}‍\u{1F4BB}'
    expect(splitPieces(family, 'char').map((p) => p.text)).toEqual([family])
  })

  it('round-trips exactly', () => {
    const source = '  hello   world\n\ttab '
    expect(
      splitPieces(source, 'word')
        .map((p) => p.text)
        .join(''),
    ).toBe(source)
    expect(
      splitPieces(source, 'char')
        .map((p) => p.text)
        .join(''),
    ).toBe(source)
  })

  it('returns nothing for empty input', () => {
    expect(splitPieces('', 'word')).toEqual([])
  })

  it('splits a run in a script without spaces into words, punctuation attached', () => {
    const pieces = splitPieces('今天天气很好，我们去公园。', 'word').map((p) => p.text)
    expect(pieces.join('')).toBe('今天天气很好，我们去公园。')
    expect(pieces.length).toBeGreaterThan(2)
    for (const piece of pieces) expect('，。'.includes(piece[0])).toBe(false)
  })

  it('keeps a space-separated word whole, punctuation included', () => {
    expect(splitPieces('Hello, world!', 'word').map((p) => p.text)).toEqual(['Hello,', ' ', 'world!'])
  })

  it('splits flags and conjuncts as whole clusters in char mode', () => {
    expect(splitPieces('\u{1F1FA}\u{1F1F8}क्ष', 'char').map((p) => p.text)).toEqual(['\u{1F1FA}\u{1F1F8}', 'क्ष'])
  })
})

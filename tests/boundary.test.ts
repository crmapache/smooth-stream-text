import { describe, expect, it } from 'vitest'
import { createBoundaryResolver, type BoundaryMode } from '../src/core/boundary'

const at = (mode: BoundaryMode, source: string, desired: number, closed = false, unit: 'char' | 'word' = 'char') =>
  createBoundaryResolver(mode, unit).resolve(source, desired, closed)

describe("boundary 'char'", () => {
  it('allows any grapheme-safe position', () => {
    expect(at('char', 'hello world', 7)).toBe(7)
  })

  it('still refuses to split a cluster', () => {
    expect(at('char', 'a\u{1F600}b', 2)).toBe(1)
  })
})

describe("boundary 'word'", () => {
  it('backs up to the last completed word', () => {
    expect(at('word', 'hello world', 8)).toBe(6)
  })

  it('allows a position right after whitespace', () => {
    expect(at('word', 'hello world', 6)).toBe(6)
  })

  it('holds the trailing partial word while the stream is open', () => {
    expect(at('word', 'hello wor', 9)).toBe(6)
  })

  it('releases the final partial word once the stream is closed', () => {
    expect(at('word', 'hello wor', 9, true)).toBe(9)
  })
})

describe("boundary 'markdown' - atomic delimiters", () => {
  it('never stops between the two stars of an opener', () => {
    expect(at('markdown', '**bold** tail', 1)).toBe(0)
  })

  it('never stops inside a fence marker', () => {
    expect(at('markdown', 'x\n```js\ncode', 4)).toBe(2)
  })
})

describe("boundary 'markdown' - hold until closed", () => {
  it('holds unclosed emphasis', () => {
    expect(at('markdown', '**bold** ok', 4)).toBe(0)
  })

  it('releases emphasis once the closer is visible', () => {
    expect(at('markdown', '**bold** ok', 8)).toBe(8)
  })

  it('holds unclosed inline code', () => {
    expect(at('markdown', 'run `npm i` now', 7)).toBe(4)
    expect(at('markdown', 'run `npm i` now', 11)).toBe(11)
  })

  it('holds an unclosed link', () => {
    expect(at('markdown', 'see [docs](https://x.dev) now', 12)).toBe(4)
    expect(at('markdown', 'see [docs](https://x.dev) now', 25)).toBe(25)
  })

  it('treats a bracket with no url as ordinary text', () => {
    expect(at('markdown', 'an [aside] here', 11)).toBe(11)
  })

  it('holds a line-leading marker until its first word', () => {
    expect(at('markdown', 'a\n## Title here', 4)).toBe(2)
    expect(at('markdown', 'a\n## Title here', 10)).toBe(10)
  })

  it('holds a bullet marker but not the emphasis machinery', () => {
    expect(at('markdown', 'a\n- item here', 4)).toBe(2)
    expect(at('markdown', 'a\n- item here', 8)).toBe(8)
    expect(at('markdown', 'a\n* item here', 8)).toBe(8)
  })

  it('reads a star opening a line as emphasis unless a space follows it', () => {
    expect(at('markdown', '*italic* tail', 4)).toBe(0)
    expect(at('markdown', '*italic* tail', 12)).toBe(12)
    expect(at('markdown', 'a\n*italic* tail', 14)).toBe(14)
    expect(at('markdown', 'a\n* item here', 8)).toBe(8)
    expect(at('markdown', '*italic* tail', 12, false, 'word')).toBe(9)
  })

  it('holds a table row until its newline', () => {
    expect(at('markdown', 'a\n| x | y |\nb', 6)).toBe(2)
    expect(at('markdown', 'a\n| x | y |\nb', 12)).toBe(12)
  })

  it('never holds inside a fenced code body', () => {
    expect(at('markdown', 'a\n```\nlet x = **not emphasis\n', 20)).toBe(20)
  })

  it('respects backslash escapes', () => {
    expect(at('markdown', 'a \\* not emphasis', 9)).toBe(9)
  })

  it('releases everything when the stream is closed and we are at the end', () => {
    expect(at('markdown', 'tail **unclosed', 15, true)).toBe(15)
  })
})

describe('custom boundary function', () => {
  it('is used verbatim, after grapheme clamping', () => {
    const fn = (_source: string, desired: number) => Math.min(desired, 3)
    expect(at(fn, 'hello world', 9)).toBe(3)
  })
})

describe('resolver behaviour across calls', () => {
  it('never moves backwards on a growing source', () => {
    const resolver = createBoundaryResolver('markdown')
    const source = 'the **quick** brown `fox` jumps [over](x) it'
    let prev = 0
    for (let i = 1; i <= source.length; i++) {
      const got = resolver.resolve(source, i, false, false)
      expect(got).toBeGreaterThanOrEqual(prev)
      expect(got).toBeLessThanOrEqual(i)
      prev = got
    }
    // The last character of a live stream may still grow into a longer cluster; a
    // quiet producer releases it.
    expect(prev).toBe(source.length - 1)
    expect(resolver.resolve(source, source.length, false, true)).toBe(source.length)
  })

  it('reset() starts over', () => {
    const resolver = createBoundaryResolver('markdown')
    resolver.resolve('**bold** done', 13, false)
    resolver.reset()
    expect(resolver.resolve('**again**', 1, false)).toBe(0)
  })

  it('produces the same answer whether the source arrived at once or in pieces', () => {
    const source = '# Title\n\nSome **bold** and `code` and [a link](https://x.dev).\n\n```ts\nconst a = 1\n```\n'
    const incremental = createBoundaryResolver('markdown')
    for (let i = 1; i <= source.length; i++) {
      const stepwise = incremental.resolve(source, i, false)
      const fresh = createBoundaryResolver('markdown').resolve(source, i, false)
      expect(stepwise).toBe(fresh)
    }
  })
})

describe('the quiet argument', () => {
  it('keeps the 0.1 answers when the caller does not say whether the producer is quiet', () => {
    expect(createBoundaryResolver('char').resolve('hello', 5, false)).toBe(5)
    expect(createBoundaryResolver('markdown').resolve('hello', 5, false)).toBe(5)
    expect(createBoundaryResolver('word').resolve('hello world', 11, false)).toBe(6)
    // Right after whitespace a cut is final, whatever comes next.
    expect(createBoundaryResolver('word').resolve('hello ', 6, false)).toBe(6)
    expect(createBoundaryResolver('word').resolve('a\r\n', 3, false)).toBe(3)
    // One fix of 0.2 applies here too: half of a surrogate pair is never shown.
    expect(createBoundaryResolver('char').resolve('ab\uD83D', 3, false)).toBe(2)
  })

  it('never answers mid-word when asked about an earlier position again', () => {
    const resolver = createBoundaryResolver('word')
    expect(resolver.resolve('hello world foo', 15, false)).toBe(12)
    expect(resolver.resolve('hello world foo', 8, false)).toBe(6)
  })

  it('holds the last cluster only when told the producer is still talking', () => {
    expect(createBoundaryResolver('char').resolve('hello', 5, false, false)).toBe(4)
    expect(createBoundaryResolver('char').resolve('hello', 5, false, true)).toBe(5)
    expect(createBoundaryResolver('word').resolve('hello world', 11, false, true)).toBe(11)
  })
})

describe('questions asked out of order', () => {
  it('get the same answers as from a fresh resolver, in every mode', () => {
    const source = 'Some **bold words** and `code here`, then [a link](https://x.dev/a) and *more* text.'
    const modes: [BoundaryMode, 'char' | 'word'][] = [
      ['markdown', 'char'],
      ['markdown', 'word'],
      ['word', 'char'],
      ['char', 'word'],
    ]
    for (const [mode, unit] of modes) {
      const fresh = (desired: number) => createBoundaryResolver(mode, unit).resolve(source, desired, false, false)
      const reused = createBoundaryResolver(mode, unit)
      // Forward, back, forward again - the order a caller with its own cursor may ask in.
      for (const desired of [40, 12, 70, 3, 55, source.length, 20, 66]) {
        expect(reused.resolve(source, desired, false, false), `${mode}/${unit} at ${desired}`).toBe(fresh(desired))
      }
    }
  })

  it('answer a question from far behind, past what the scan remembers', () => {
    const source = 'word **bold** '.repeat(400)
    const fresh = (desired: number) => createBoundaryResolver('markdown').resolve(source, desired, false, false)
    const reused = createBoundaryResolver('markdown')
    for (const desired of [source.length, 9, source.length - 3, 2000]) {
      expect(reused.resolve(source, desired, false, false), `at ${desired}`).toBe(fresh(desired))
    }
  })
})

import { describe, expect, it } from 'vitest'
import { createBoundaryResolver, type BoundaryMode } from '../src/core/boundary'

const at = (mode: BoundaryMode, source: string, desired: number, closed = false) =>
  createBoundaryResolver(mode).resolve(source, desired, closed)

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

  it('holds a line-leading marker until its first content character', () => {
    expect(at('markdown', 'a\n## Title', 4)).toBe(2)
    expect(at('markdown', 'a\n## Title', 6)).toBe(6)
  })

  it('holds a bullet marker but not the emphasis machinery', () => {
    expect(at('markdown', 'a\n- item', 4)).toBe(2)
    expect(at('markdown', 'a\n- item', 6)).toBe(6)
    expect(at('markdown', 'a\n* item', 6)).toBe(6)
  })

  it('holds a table row until its newline', () => {
    expect(at('markdown', 'a\n| x | y |\nb', 6)).toBe(2)
    expect(at('markdown', 'a\n| x | y |\nb', 12)).toBe(12)
  })

  it('never holds inside a fenced code body', () => {
    expect(at('markdown', 'a\n```\nlet x = **not emphasis\n', 20)).toBe(20)
  })

  it('respects backslash escapes', () => {
    expect(at('markdown', 'a \\* not emphasis', 10)).toBe(10)
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
      const got = resolver.resolve(source, i, false)
      expect(got).toBeGreaterThanOrEqual(prev)
      expect(got).toBeLessThanOrEqual(i)
      prev = got
    }
    expect(prev).toBe(source.length)
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

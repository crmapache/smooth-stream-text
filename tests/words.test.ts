import { describe, expect, it } from 'vitest'
import { createBoundaryResolver, type BoundaryMode } from '../src/core/boundary'
import { createWordBoundaries } from '../src/core/words'

/** Every position a resolver stops at while the cursor walks a fully arrived source. */
function stops(mode: BoundaryMode, source: string, unit: 'char' | 'word' = 'char'): number[] {
  const resolver = createBoundaryResolver(mode, unit)
  const seen = new Set<number>()
  for (let desired = 0; desired <= source.length; desired++) seen.add(resolver.resolve(source, desired, false))
  return [...seen]
}

const words = new Intl.Segmenter(undefined, { granularity: 'word' })
const wordBoundaries = (text: string) => new Set([...words.segment(text)].map((part) => part.index))

describe('word boundaries in space-separated text', () => {
  it('stops only where whitespace begins or ends', () => {
    const source = "Hello, world! It's a test-case: see https://x.dev/a?b=c now."
    for (const at of stops('word', source)) {
      const edge = at === 0 || /\s/.test(source[at - 1]) || /\s/.test(source[at])
      expect(edge, `stopped at ${at}: ${JSON.stringify(source.slice(0, at))}`).toBe(true)
    }
  })

  it('keeps punctuation on its word', () => {
    expect(stops('word', 'Hello, world here')).not.toContain(5)
  })

  it('holds the last word of a live stream until the producer goes quiet', () => {
    const resolver = createBoundaryResolver('word')
    expect(resolver.resolve('hello world', 11, false)).toBe(6)
    expect(resolver.resolve('hello world', 11, false, true)).toBe(11)
  })

  it('gives the same answer whether the source arrived at once or in pieces', () => {
    const source = 'One two, three - four five; 中文测试很好。 six'
    const stepwise = createBoundaryResolver('word')
    for (let i = 1; i <= source.length; i++) {
      expect(stepwise.resolve(source, i, false)).toBe(createBoundaryResolver('word').resolve(source, i, false))
    }
  })
})

describe('word boundaries in scripts written without spaces', () => {
  it('advances through Chinese a word at a time instead of stalling', () => {
    const source = '今天天气很好，我们一起去公园散步吧。模型正在输出文本。'
    const at = stops('word', source).sort((a, b) => a - b)
    const real = wordBoundaries(source)
    for (const stop of at) expect(real.has(stop) || stop === 0).toBe(true)
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeLessThanOrEqual(5)
    // Closing punctuation stays on the word before it.
    for (const stop of at) expect('，。'.includes(source[stop])).toBe(false)
  })

  it('uses dictionary words for Thai, not every character', () => {
    // The space ends the run, so every word in it is final.
    const source = 'สวัสดีครับวันนี้อากาศดีมาก ok'
    const at = stops('word', source)
    const real = wordBoundaries(source)
    for (const stop of at) expect(real.has(stop)).toBe(true)
    expect(at.length).toBeGreaterThan(5)
    expect(at.length).toBeLessThan(source.length / 2)
  })

  it('never shows half a word while the text is still arriving', () => {
    for (const source of [
      'สวัสดีครับวันนี้อากาศดีมากเราจะไปเที่ยวทะเลกัน',
      'きょうはとてもいいてんきですね。こうえんにいきましょう。',
      '今天天气很好，我们一起去公园散步吧。模型正在输出文本。',
      // The prolonged sound mark belongs to no script, yet sits inside katakana words.
      'きのうはデパートでアイスクリームとコンピューターをかいましたがとてもたかかったです',
      // Runs longer than the window the dictionary is asked about.
      'นักวิทยาศาสตร์คอมพิวเตอร์กำลังศึกษาปัญญาประดิษฐ์ที่มหาวิทยาลัยและการเรียนรู้ของเครื่อง',
      'ភាសាខ្មែរគឺជាភាសាផ្លូវការរបស់ប្រទេសកម្ពុជាហើយមានអ្នកនិយាយច្រើនលាននាក់',
    ]) {
      const real = wordBoundaries(source)
      for (const resolver of [createBoundaryResolver('word'), createBoundaryResolver('markdown', 'word')]) {
        for (let end = 1; end <= source.length; end++) {
          const stop = resolver.resolve(source.slice(0, end), end, false, false)
          expect(real.has(stop) || stop === 0, `${JSON.stringify(source.slice(0, stop))} is half a word`).toBe(true)
        }
      }
    }
  })

  it('keeps moving through a long run without spaces while it is still arriving', () => {
    const source = 'ประเทศไทยมีประชากรประมาณเจ็ดสิบล้านคนและมีภาษาไทยเป็นภาษาราชการ'.repeat(3)
    const resolver = createBoundaryResolver('word')
    let stop = 0
    for (let end = 1; end <= source.length; end++) stop = resolver.resolve(source.slice(0, end), end, false, false)
    // Behind the live edge by the lookahead and one word at most, never stalled.
    expect(stop).toBeGreaterThan(source.length - 32 - 16)
    expect(wordBoundaries(source).has(stop)).toBe(true)
  })

  it('splits between a no-space script and a Latin word', () => {
    const boundaries = createWordBoundaries()
    expect(boundaries.isBoundary('使用React框架', 2, false)).toBe(true)
    expect(boundaries.isBoundary('使用React框架', 7, false)).toBe(true)
    expect(boundaries.isBoundary('使用React框架', 4, false)).toBe(false)
  })
})

describe("'markdown' by default", () => {
  it('stops at any character outside markup', () => {
    expect(stops('markdown', 'plain words here')).toContain(3)
  })

  it('becomes whole words when the unit is a word, in any mode but a custom function', () => {
    expect(stops('char', 'plain words here', 'word')).not.toContain(3)
  })
})

describe("'markdown' with unit 'word'", () => {
  it('never shows half a word', () => {
    const source = 'The **quick** brown `fox` jumps [over](https://x.dev) the lazy dog.\n\n## Done here\n'
    for (const at of stops('markdown', source, 'word')) {
      const edge = at === 0 || /\s/.test(source[at - 1]) || /\s/.test(source[at])
      expect(edge, `stopped at ${at}: ${JSON.stringify(source.slice(0, at))}`).toBe(true)
    }
  })
})

describe('the end of a live stream', () => {
  it('never shows half of a surrogate pair', () => {
    const resolver = createBoundaryResolver('char')
    expect(resolver.resolve('ab\uD83D', 3, false)).toBe(2)
    expect(resolver.resolve('ab\uD83D', 3, false, true)).toBe(2)
    expect(resolver.resolve('ab😀', 4, false, true)).toBe(4)
  })

  it('holds the glyph a trailing half pair may still change, wherever the cursor asks', () => {
    for (const source of ['hi \u{1F44B}\uD83C', 'hi \u{1F468}\u200D\uD83D']) {
      const resolver = createBoundaryResolver('char')
      for (let desired = 3; desired <= source.length; desired++) {
        expect(resolver.resolve(source, desired, false, false), `at ${desired}`).toBe(3)
      }
    }
  })

  it('does not hold a line break before a trailing half pair, since nothing joins one', () => {
    const resolver = createBoundaryResolver('char')
    expect(resolver.resolve('line\n\uD83D', 6, false, false)).toBe(5)
  })

  it('waits for a cluster that may still grow', () => {
    const resolver = createBoundaryResolver('char')
    expect(resolver.resolve('abe', 3, false, false)).toBe(2)
    expect(resolver.resolve('abé', 4, false, true)).toBe(4)
  })

  it('shows everything once the stream is closed', () => {
    expect(createBoundaryResolver('char').resolve('ab\uD83D', 3, true)).toBe(3)
    expect(createBoundaryResolver('markdown').resolve('half wor', 8, true)).toBe(8)
  })
})

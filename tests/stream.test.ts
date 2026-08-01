import { describe, expect, it } from 'vitest'
import { createManualClock, createSmoothStream, type PacingOptions } from '../src/index'

function run(options: PacingOptions = {}) {
  const clock = createManualClock(0)
  const stream = createSmoothStream({ clock, boundary: 'char', ...options })
  const frames = (count: number, ms = 16) => {
    for (let i = 0; i < count; i++) clock.advance(ms)
  }
  return { clock, stream, frames }
}

describe('createSmoothStream', () => {
  it('starts idle and empty', () => {
    const { stream } = run()
    expect(stream.getState()).toMatchObject({ text: '', cursor: 0, pending: 0, phase: 'idle' })
  })

  it('holds the display behind live text by roughly the target latency', () => {
    const { stream, clock } = run({ targetLatencyMs: 200, maxCharsPerSecond: 2000 })
    // 100 characters every 100 ms - a fast but steady producer
    for (let i = 0; i < 20; i++) {
      stream.push('x'.repeat(100))
      clock.advance(100)
    }
    const { pending } = stream.getState()
    expect(pending).toBeGreaterThan(20)
    expect(pending).toBeLessThan(400)
  })

  it('turns a burst into an acceleration, not a dump', () => {
    const { stream, clock } = run()
    stream.push('y'.repeat(600))
    clock.advance(16)
    expect(stream.getState().cursor).toBeGreaterThan(0)
    expect(stream.getState().cursor).toBeLessThan(30)
  })

  it('drains and stops after a long mid-stream pause', () => {
    const { stream, frames } = run()
    stream.push('hello world')
    frames(200)
    expect(stream.getState()).toMatchObject({ text: 'hello world', pending: 0, phase: 'streaming' })
  })

  it('finishes within the settle window once the producer closes', () => {
    const { stream, frames } = run({ settleMs: 400 })
    stream.push('a'.repeat(300))
    frames(3)
    expect(stream.getState().phase).toBe('streaming')
    stream.end()
    expect(stream.getState().phase).toBe('settling')
    frames(60) // ~960 ms, comfortably past settleMs * 2
    expect(stream.getState()).toMatchObject({ pending: 0, phase: 'done' })
  })

  it('meets the hard deadline even when the rate ceiling is punishingly low', () => {
    const { stream, frames } = run({ settleMs: 200, minCharsPerSecond: 1, maxCharsPerSecond: 2 })
    stream.push('a'.repeat(500))
    stream.end()
    frames(40) // 640 ms, past settleMs * 2
    expect(stream.getState()).toMatchObject({ pending: 0, phase: 'done' })
  })

  it('stays streaming when the producer is abandoned without end()', () => {
    const { stream, frames } = run()
    stream.push('abc')
    frames(200)
    expect(stream.getState().phase).toBe('streaming')
    expect(stream.getState().text).toBe('abc')
  })

  it('flush() reveals everything immediately', () => {
    const { stream } = run()
    stream.push('a'.repeat(5000))
    stream.flush()
    expect(stream.getState().cursor).toBe(5000)
  })

  it('reset() clears everything without animating', () => {
    const { stream, frames } = run()
    stream.push('old text')
    frames(50)
    stream.reset()
    expect(stream.getState()).toMatchObject({ text: '', source: '', cursor: 0, phase: 'idle' })
  })

  it('reset(text) starts fully revealed', () => {
    const { stream } = run()
    stream.reset('already here')
    expect(stream.getState().text).toBe('already here')
    expect(stream.getState().pending).toBe(0)
  })

  it('snaps instead of crawling when the backlog cannot drain sanely', () => {
    const { stream, clock } = run({ maxCharsPerSecond: 900, maxLatencyMs: 2000 })
    stream.push('z'.repeat(100000))
    clock.advance(16)
    expect(stream.getState().cursor).toBe(100000)
  })

  it('produces identical output whether fed deltas or a growing string', () => {
    const chunks = ['The ', 'quick brown ', 'fox jumps over ', 'the lazy dog.']
    const deltas = run()
    const growing = run()
    let full = ''
    for (const chunk of chunks) {
      deltas.stream.push(chunk)
      full += chunk
      growing.stream.setSource(full)
      deltas.clock.advance(50)
      growing.clock.advance(50)
      expect(deltas.stream.getState().text).toBe(growing.stream.getState().text)
    }
    deltas.frames(100)
    growing.frames(100)
    expect(deltas.stream.getState().text).toBe(full)
    expect(growing.stream.getState().text).toBe(full)
  })

  it('ignores setSource with an unchanged string', () => {
    const { stream, clock } = run()
    stream.setSource('same')
    clock.advance(50)
    const before = stream.getState().text
    stream.setSource('same')
    expect(stream.getState().text).toBe(before)
  })

  it('treats a shrinking source as a reset', () => {
    const { stream, frames } = run()
    stream.setSource('a long first answer')
    frames(100)
    stream.setSource('short')
    expect(stream.getState()).toMatchObject({ source: 'short', cursor: 0 })
  })

  it('treats a diverging source as a reset', () => {
    const { stream, frames } = run()
    stream.setSource('the first answer')
    frames(100)
    stream.setSource('a different answer entirely')
    expect(stream.getState()).toMatchObject({ source: 'a different answer entirely', cursor: 0 })
  })

  it('notifies subscribers and stops after unsubscribe', () => {
    const { stream, clock } = run()
    let calls = 0
    const off = stream.subscribe(() => {
      calls++
    })
    stream.push('hello')
    clock.advance(100)
    expect(calls).toBeGreaterThan(0)
    const seen = calls
    off()
    clock.advance(100)
    expect(calls).toBe(seen)
  })

  it('stops all work on destroy', () => {
    const { stream, frames } = run()
    stream.push('hello world')
    stream.destroy()
    const before = stream.getState().text
    frames(100)
    expect(stream.getState().text).toBe(before)
  })

  it('never lets the cursor move backwards', () => {
    const { stream, clock } = run({ boundary: 'markdown' })
    const source = 'A **bold** claim with `code`, a [link](https://x.dev) and more text after it.'
    let previous = 0
    for (let i = 1; i <= source.length; i++) {
      stream.setSource(source.slice(0, i))
      clock.advance(16)
      const { cursor } = stream.getState()
      expect(cursor).toBeGreaterThanOrEqual(previous)
      previous = cursor
    }
  })

  it('releases a markdown hold once the producer has gone quiet', () => {
    const clock = createManualClock(0)
    const stream = createSmoothStream({ clock, boundary: 'markdown', holdMs: 100 })
    stream.push('**this emphasis is never closed and just keeps going and going')
    for (let i = 0; i < 40; i++) clock.advance(16)
    expect(stream.getState().cursor).toBeGreaterThan(2)
  })

  it('keeps holding a link through a producer stall longer than the cap', () => {
    // The producer stalling mid-URL has not frozen anything we control, so
    // releasing would show exactly the half-written link the hold exists to hide.
    const clock = createManualClock(0)
    const stream = createSmoothStream({ clock, boundary: 'markdown' })
    const source = 'a half-written [link](https://github.com/crmapache/smooth-stream-text), or a broken emoji'

    let at = 0
    const feed = (count: number) => {
      for (let k = 0; k < count && at < source.length; k++) stream.push(source[at++])
      clock.advance(16)
    }

    while (at < source.indexOf('[') + 8) feed(3)
    // A 900 ms stall, right in the middle of the URL - longer than a settle window
    // and typical of a model pausing to think.
    for (let i = 0; i < 56; i++) clock.advance(16)
    expect(stream.getState().text).not.toContain('[')
    expect(stream.getState().text).not.toContain('http')

    while (at < source.length) feed(3)
    stream.end()
    for (let i = 0; i < 200; i++) clock.advance(16)
    expect(stream.getState().text).toBe(source)
  })

  it('still releases when the producer abandons the stream mid-link', () => {
    const clock = createManualClock(0)
    const stream = createSmoothStream({ clock, boundary: 'markdown', holdMs: 800 })
    stream.push('a half-written [link](https://example')
    for (let i = 0; i < 200; i++) clock.advance(16)
    // Nothing more is ever coming, so the text has to appear rather than hang.
    expect(stream.getState().text).toBe('a half-written [link](https://example')
  })

  it('releases a markdown hold once the length cap is reached', () => {
    const clock = createManualClock(0)
    const stream = createSmoothStream({ clock, boundary: 'markdown', holdMs: 100000, holdChars: 10 })
    stream.push('**' + 'x'.repeat(500))
    for (let i = 0; i < 40; i++) clock.advance(16)
    expect(stream.getState().cursor).toBeGreaterThan(2)
  })

  it('never shows half-written markdown across a whole realistic answer', () => {
    const source = [
      '## A heading',
      '',
      'A paragraph with **bold**, _italics_, `inline code` and [a link](https://x.dev) in it.',
      '',
      '- **Pacing.** Buffer what arrives and release it evenly.',
      '- **Reveal.** Let new words fade up rather than switch on.',
      '',
      '```ts',
      'const desired = pending / targetLatencyMs',
      '```',
      '',
      '| Case | Before | After |',
      '| --- | --- | --- |',
      '| Burst | dumps | accelerates |',
      '',
      'And a trailing sentence so the tail has somewhere to go.',
      '',
    ].join('\n')

    /** A visible prefix is broken when it stops inside a delimiter run the source continues. */
    const truncatedRun = (cut: number) => {
      if (cut <= 0 || cut >= source.length) return null
      const ch = source[cut - 1]
      if (!'*_~`'.includes(ch) || source[cut] !== ch) return null
      return ch
    }

    /** ...or when its last line is a bare marker, or has an unclosed span. */
    const unclosed = (shown: string) => {
      const line = shown.slice(shown.lastIndexOf('\n') + 1)
      if (/^\s*(?:```|~~~)/.test(line)) return null // a fence marker is not a code span
      if (/^\s*(?:[-*+>#]+|\d+[.)])\s*$/.test(line)) return 'bare marker'
      if (/\[[^\]\n]*$/.test(line)) return 'unclosed link text'
      if (/\]\($/.test(line)) return 'link url just opened'
      if ((line.match(/`/g) ?? []).length % 2 === 1) return 'unclosed code span'
      return null
    }

    // Several producer speeds, because the failure this pins down only appeared
    // when the producer was slower than the display could draw.
    for (const charsPerFrame of [1, 3, 10, 40]) {
      const clock = createManualClock(0)
      const stream = createSmoothStream({ clock, boundary: 'markdown' })
      const broken: string[] = []
      let at = 0

      for (let frame = 0; frame < 4000; frame++) {
        for (let k = 0; k < charsPerFrame && at < source.length; k++) stream.push(source[at++])
        if (at >= source.length) stream.end()
        clock.advance(16)

        const { text, cursor, phase } = stream.getState()
        const run = truncatedRun(cursor)
        if (run) broken.push(`x${charsPerFrame}: truncated ${run} at ${cursor}`)
        const reason = unclosed(text)
        if (reason) broken.push(`x${charsPerFrame}: ${reason} -> ${JSON.stringify(text.slice(-24))}`)
        if (phase === 'done') break
      }

      expect(broken).toEqual([])
      expect(stream.getState().text).toBe(source)
    }
  })

  it('does not show half-written markdown while the hold is in effect', () => {
    const clock = createManualClock(0)
    const stream = createSmoothStream({ clock, boundary: 'markdown' })
    stream.push('plain text then **bo')
    clock.advance(16)
    clock.advance(16)
    expect(stream.getState().text).not.toContain('*')
  })
})

describe('a producer that speaks again', () => {
  it('reopens the stream when text arrives after end, instead of dumping it', () => {
    // One long-lived stream per view is the normal shape: a chat panel keeps the
    // same instance across messages. Without reopening, everything after the
    // first answer lands past the settle deadline and jumps into place.
    const { stream, clock, frames } = run()
    stream.push('first answer')
    stream.end()
    frames(200)
    expect(stream.getState()).toMatchObject({ text: 'first answer', phase: 'done' })

    clock.advance(5_000)
    stream.push('second answer, streaming in')

    expect(stream.getState().phase).toBe('streaming')
    clock.advance(16)
    const shown = stream.getState().cursor
    expect(shown).toBeGreaterThan(0)
    expect(shown).toBeLessThan('second answer, streaming in'.length)

    frames(200)
    expect(stream.getState().text).toBe('first answersecond answer, streaming in')
  })

  it('reopens on setSource too, so both inputs stay interchangeable', () => {
    const { stream, frames, clock } = run()
    stream.setSource('first answer')
    stream.end()
    frames(200)

    clock.advance(5_000)
    stream.setSource('first answer and more to come')
    expect(stream.getState().phase).toBe('streaming')
    clock.advance(16)
    expect(stream.getState().pending).toBeGreaterThan(0)
  })
})

describe('pause and resume', () => {
  it('stops drawing while paused and picks up where it left off', () => {
    const { stream, frames } = run()
    stream.push('hello world')
    frames(2)
    const atPause = stream.getState().cursor
    stream.pause()

    frames(200)
    expect(stream.getState().cursor).toBe(atPause)

    stream.resume()
    frames(200)
    expect(stream.getState().text).toBe('hello world')
  })

  it('holds text fed while paused until it resumes', () => {
    const { stream, frames } = run()
    stream.pause()
    stream.push('written while nobody was watching')
    frames(200)
    expect(stream.getState().cursor).toBe(0)

    stream.resume()
    frames(200)
    expect(stream.getState().text).toBe('written while nobody was watching')
  })
})

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { reveal, smoothStream, smoothText } from '../src/svelte/index'
import { createManualClock, type ManualClock } from '../src/index'

const frames = (clock: ManualClock, count = 200) => {
  for (let i = 0; i < count; i++) clock.advance(16)
}

describe('smoothText action', () => {
  it('paces text onto the node', () => {
    const clock = createManualClock(0)
    const node = document.createElement('p')
    const action = smoothText(node, { clock, boundary: 'char', text: '' })

    action.update({ clock, boundary: 'char', text: 'hello world' })
    frames(clock)
    expect(node.textContent).toBe('hello world')
    action.destroy()
  })

  it('ends the stream exactly once', () => {
    const clock = createManualClock(0)
    const node = document.createElement('p')
    const action = smoothText(node, { clock, boundary: 'char', text: 'hi' })

    action.update({ clock, boundary: 'char', text: 'hi there', done: true })
    action.update({ clock, boundary: 'char', text: 'hi there', done: true })
    frames(clock)
    expect(node.textContent).toBe('hi there')
    action.destroy()
  })
})

describe('reveal action', () => {
  it('animates only appended text', () => {
    const node = document.createElement('p')
    const action = reveal(node, { text: 'one two', unit: 'word' })
    action.update({ text: 'one two three', unit: 'word' })
    expect([...node.querySelectorAll('.sst-word')].map((n) => n.textContent)).toEqual(['three'])
    action.destroy()
  })
})

describe('smoothStream store', () => {
  it('follows the svelte store contract', () => {
    const clock = createManualClock(0)
    const store = smoothStream({ clock, boundary: 'char' })
    const seen: string[] = []

    const unsubscribe = store.subscribe((state) => seen.push(state.text))
    expect(seen).toHaveLength(1) // svelte stores call the subscriber immediately
    expect(seen[0]).toBe('')

    store.push('hi')
    frames(clock, 100)
    expect(seen.at(-1)).toBe('hi')

    const count = seen.length
    unsubscribe()
    store.push(' more')
    frames(clock, 100)
    expect(seen).toHaveLength(count)
    store.destroy()
  })
})

describe('smoothText action across answers', () => {
  const slow = {
    boundary: 'char' as const,
    maxCharsPerSecond: 10,
    minCharsPerSecond: 10,
    settleMs: 100,
    maxLatencyMs: 1e9,
  }

  it('shows a message that is already done at once', () => {
    const node = document.createElement('p')
    smoothText(node, { clock: createManualClock(0), boundary: 'char', text: 'an old answer from history', done: true })
    expect(node.textContent).toBe('an old answer from history')
    expect(node.querySelectorAll('.sst-word')).toHaveLength(0)
  })

  it('closes a second answer on the same element', () => {
    const clock = createManualClock(0)
    const node = document.createElement('p')
    const action = smoothText(node, { ...slow, clock, text: '', done: false })
    action.update({ ...slow, clock, text: 'first', done: true })
    frames(clock, 100)
    action.update({ ...slow, clock, text: 'first', done: false })
    action.update({ ...slow, clock, text: 'first second answer that is long', done: true })
    // Closed, the slow tail meets the settle deadline instead of crawling at 10/s.
    frames(clock, 25)
    expect(node.textContent).toBe('first second answer that is long')
  })

  it('calls onSettled once per answer, after the wave', () => {
    const clock = createManualClock(0)
    const node = document.createElement('p')
    let settled = 0
    const onSettled = () => settled++
    const action = smoothText(node, { clock, boundary: 'char', text: '', onSettled })
    action.update({ clock, boundary: 'char', text: 'one', done: true, onSettled })
    frames(clock)
    expect(settled).toBe(1)
    action.update({ clock, boundary: 'char', text: 'one two', done: true, onSettled })
    frames(clock)
    expect(settled).toBe(2)
  })
})

describe('smoothStream store pause', () => {
  it('stops drawing while paused', () => {
    const clock = createManualClock(0)
    const store = smoothStream({ clock, boundary: 'char' })
    let text = ''
    store.subscribe((state) => (text = state.text))
    store.pause()
    store.push('hello')
    frames(clock, 50)
    expect(text).toBe('')
    store.resume()
    frames(clock, 100)
    expect(text).toBe('hello')
  })
})

describe('smoothStream store apply', () => {
  it('follows the shared rule: history at once, a late chunk closes again', () => {
    const clock = createManualClock(0)
    const store = smoothStream({ clock, boundary: 'char' })
    let state = { text: '', phase: '' } as { text: string; phase: string }
    store.subscribe((next) => (state = next))
    store.apply('an old answer', true)
    expect(state.text).toBe('an old answer')
    expect(state.phase).toBe('done')
    store.apply('an old answer, continued', true)
    frames(clock)
    expect(state.text).toBe('an old answer, continued')
    expect(state.phase).toBe('done')
  })
})

describe('settings passed to the actions', () => {
  it('returns a setting that is no longer passed to its default', () => {
    const node = document.createElement('p')
    const action = smoothText(node, { text: '', durationMs: 900 })
    expect(node.style.getPropertyValue('--sst-duration')).toBe('900ms')
    action.update({ text: '' })
    expect(node.style.getPropertyValue('--sst-duration')).toBe('380ms')
    action.destroy()

    const other = document.createElement('p')
    const revealAction = reveal(other, { text: '', durationMs: 900 })
    revealAction.update({ text: '' })
    expect(other.style.getPropertyValue('--sst-duration')).toBe('380ms')
    revealAction.destroy()
  })
})

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
    const action = reveal(node, { text: 'one two' })
    action.update({ text: 'one two three' })
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

import { describe, expect, it } from 'vitest'
import { clampToGraphemeBoundary as clamp } from '../src/core/grapheme'

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

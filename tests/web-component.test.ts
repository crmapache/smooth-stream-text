// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { SmoothStreamTextElement } from '../src/web-component/index'

afterEach(() => {
  document.body.innerHTML = ''
})

const create = () => {
  const el = document.createElement('smooth-stream-text') as SmoothStreamTextElement
  el.setAttribute('boundary', 'char')
  document.body.appendChild(el)
  return el
}

describe('<smooth-stream-text>', () => {
  it('registers itself on import', () => {
    expect(customElements.get('smooth-stream-text')).toBe(SmoothStreamTextElement)
  })

  it('renders its text attribute', () => {
    const el = create()
    el.setAttribute('text', 'hello world')
    el.flush()
    expect(el.textContent).toBe('hello world')
  })

  it('accepts pushed deltas and structured options', () => {
    const el = create()
    el.options = { targetLatencyMs: 50 }
    el.push('hello ')
    el.push('world')
    el.flush()
    expect(el.textContent).toBe('hello world')
  })

  it('reads scalar settings from attributes', () => {
    const el = create()
    el.setAttribute('duration', '500')
    el.setAttribute('translate', '0')
    el.setAttribute('text', 'a')
    el.flush()
    expect(el.style.getPropertyValue('--sst-duration')).toBe('500ms')
    expect(el.style.getPropertyValue('--sst-translate')).toBe('0px')
  })

  it('emits sst:done when the tail finishes', async () => {
    const el = create()
    const fired = new Promise<Event>((resolve) => el.addEventListener('sst:done', resolve, { once: true }))
    el.setAttribute('text', 'hi')
    el.setAttribute('done', '')
    el.flush()
    await expect(fired).resolves.toBeInstanceOf(CustomEvent)
  })

  it('tears down cleanly when removed', () => {
    const el = create()
    el.setAttribute('text', 'hello')
    el.remove()
    expect(el.state).toBeUndefined()
  })
})

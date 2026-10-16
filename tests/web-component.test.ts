// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { SmoothStreamTextElement, defineSmoothStreamTextElement } from '../src/web-component/index'
import { createManualClock, type ManualClock } from '../src/index'

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

  it('pauses when removed and carries on, text intact, when put back', () => {
    let scheduled = 0
    const clock = createManualClock(0)
    const counting = { now: clock.now, schedule: (cb: (now: number) => void) => (scheduled++, clock.schedule(cb)) }
    const el = document.createElement('smooth-stream-text') as SmoothStreamTextElement
    el.options = { clock: counting, boundary: 'char' }
    document.body.appendChild(el)
    el.push('hello world')
    frames(clock, 3)
    const shown = el.textContent
    el.remove()
    const before = scheduled
    frames(clock, 50)
    expect(scheduled).toBe(before)
    expect(el.textContent).toBe(shown)

    document.body.appendChild(el)
    frames(clock, 200)
    expect(el.textContent).toBe('hello world')
  })
})

const frames = (clock: ManualClock, count: number) => {
  for (let i = 0; i < count; i++) clock.advance(16)
}

describe('<smooth-stream-text> across answers and moves', () => {
  const make = (clock: ManualClock) => {
    const el = document.createElement('smooth-stream-text') as SmoothStreamTextElement
    el.options = { clock, boundary: 'char' }
    return el
  }

  it('keeps pushed text when a visual attribute changes', () => {
    const clock = createManualClock(0)
    const el = make(clock)
    document.body.appendChild(el)
    el.setAttribute('text', 'hello')
    el.push(' world')
    el.flush()
    el.setAttribute('duration', '500')
    expect(el.state?.source).toBe('hello world')
    expect(el.textContent).toBe('hello world')
  })

  it('moving the element neither loses nor replays its text', () => {
    const clock = createManualClock(0)
    const el = make(clock)
    el.setAttribute('text', 'an answer already on screen')
    el.setAttribute('done', '')
    document.body.appendChild(el)
    const other = document.createElement('div')
    document.body.appendChild(other)
    other.appendChild(el)
    expect(el.textContent).toBe('an answer already on screen')
    expect(el.querySelectorAll('.sst-word')).toHaveLength(0)
  })

  it('keeps text pushed before it was connected', () => {
    const clock = createManualClock(0)
    const el = make(clock)
    el.push('early text')
    document.body.appendChild(el)
    el.flush()
    expect(el.textContent).toBe('early text')
  })

  it('shows a finished answer at once, like history', () => {
    const el = make(createManualClock(0))
    el.setAttribute('text', 'an old answer from history')
    el.setAttribute('done', '')
    document.body.appendChild(el)
    expect(el.textContent).toBe('an old answer from history')
    expect(el.state?.phase).toBe('done')
  })

  it('closes and announces every answer, not just the first', () => {
    const clock = createManualClock(0)
    const el = make(clock)
    document.body.appendChild(el)
    let events = 0
    el.addEventListener('sst:done', () => events++)

    el.push('a')
    el.end()
    el.flush()
    el.push(' b')
    el.end()
    el.flush()
    expect(events).toBe(2)

    el.setAttribute('text', 'one')
    el.setAttribute('done', '')
    frames(clock, 100)
    el.removeAttribute('done')
    el.setAttribute('text', 'one two')
    el.setAttribute('done', '')
    frames(clock, 200)
    expect(el.state?.phase).toBe('done')
    expect(events).toBe(4)
  })

  it('announces only once the last word has finished animating', () => {
    const clock = createManualClock(0)
    const el = make(clock)
    el.options = { clock, boundary: 'char', durationMs: 1000 }
    document.body.appendChild(el)
    let spansAtDone = -1
    el.addEventListener('sst:done', () => (spansAtDone = el.querySelectorAll('.sst-word').length))
    el.setAttribute('text', '')
    el.setAttribute('text', 'hello world')
    el.setAttribute('done', '')
    frames(clock, 300)
    expect(spansAtDone).toBe(0)
  })

  it('returns a removed attribute to its default', () => {
    const el = make(createManualClock(0))
    document.body.appendChild(el)
    el.setAttribute('duration', '500')
    el.removeAttribute('duration')
    expect(el.style.getPropertyValue('--sst-duration')).toBe('380ms')
  })

  it('honours options set before the element was upgraded', () => {
    const el = document.createElement('lazy-smooth-text') as SmoothStreamTextElement
    ;(el as unknown as { options: object }).options = { durationMs: 999 }
    document.body.appendChild(el)
    defineSmoothStreamTextElement('lazy-smooth-text')
    expect(el.style.getPropertyValue('--sst-duration')).toBe('999ms')
  })

  it('registers under another tag as well', () => {
    expect(() => defineSmoothStreamTextElement('my-smooth-text')).not.toThrow()
    expect(customElements.get('my-smooth-text')).toBeDefined()
    expect(() => defineSmoothStreamTextElement('my-smooth-text')).not.toThrow()
  })

  it('reflects text and done as properties', () => {
    const el = make(createManualClock(0))
    document.body.appendChild(el)
    el.done = true
    el.text = 'via property'
    expect(el.getAttribute('text')).toBe('via property')
    expect(el.hasAttribute('done')).toBe(true)
    expect(el.textContent).toBe('via property')
  })
})

describe('<smooth-stream-text> settings', () => {
  it('returns a setting left out of a new options object to its default', () => {
    const el = create()
    // The easing has no attribute, so only the property can carry it.
    el.options = { easing: 'linear' }
    expect(el.style.getPropertyValue('--sst-easing')).toBe('linear')
    el.options = { targetLatencyMs: 50 }
    expect(el.style.getPropertyValue('--sst-easing')).toBe('cubic-bezier(.22,.61,.36,1)')
    el.options = { easing: 'ease-in' }
    el.options = undefined
    expect(el.style.getPropertyValue('--sst-easing')).toBe('cubic-bezier(.22,.61,.36,1)')
  })
})

describe('<smooth-stream-text> text property', () => {
  it('takes a missing value for no text yet, as frameworks bind one before the answer arrives', () => {
    const clock = createManualClock(0)
    // The clock is fixed when the element first starts, so it is set before that.
    const el = document.createElement('smooth-stream-text') as SmoothStreamTextElement
    el.options = { clock, boundary: 'char' }
    document.body.appendChild(el)
    for (const empty of [null, undefined]) {
      el.text = empty
      el.flush()
      expect(el.textContent).toBe('')
      expect(el.text).toBe('')
    }
    // The answer then streams in as a live one, not replayed.
    el.text = 'hello world'
    clock.advance(16)
    expect(el.textContent!.length).toBeLessThan('hello world'.length)
    for (let i = 0; i < 200; i++) clock.advance(16)
    expect(el.textContent).toBe('hello world')
  })
})

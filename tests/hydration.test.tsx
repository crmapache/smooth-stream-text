// @vitest-environment jsdom
import { act } from '@testing-library/react'
import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { createSSRApp, h } from 'vue'
import { renderToString as renderVue } from 'vue/server-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Reveal, RevealProvider, SmoothText, useSmoothText } from '../src/react/index'
import { SmoothText as VueSmoothText, Reveal as VueReveal, useSmoothStream } from '../src/vue/index'
import { createManualClock } from '../src/index'

// Server markup must hydrate without a mismatch, so Next, Nuxt and friends keep
// what the server sent.
afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function container(html: string) {
  const el = document.createElement('div')
  el.innerHTML = html
  document.body.appendChild(el)
  return el
}

describe('React hydration', () => {
  function History() {
    const { text } = useSmoothText('an answer from history', { done: true, clock: createManualClock(0) })
    return createElement('p', { id: 'hook' }, text)
  }
  const tree = () =>
    createElement(
      'div',
      null,
      createElement(SmoothText, {
        text: 'finished <b>answer</b>',
        done: true,
        as: 'p',
        id: 'a',
        clock: createManualClock(0),
      }),
      createElement(SmoothText, { text: 'still streaming', as: 'p', id: 'b', clock: createManualClock(0) }),
      createElement(Reveal, { as: 'span' }, 'reveal text'),
      createElement(RevealProvider, { resetKey: 1 }, createElement(Reveal, { as: 'em' }, 'shared wave')),
      createElement(History),
    )

  it('hydrates server markup without a mismatch and keeps the text', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const el = container(renderToString(tree()))
    expect(el.querySelector('#a')!.textContent).toBe('finished <b>answer</b>')
    expect(el.querySelector('#hook')!.textContent).toBe('an answer from history')
    const recoverable: unknown[] = []
    act(() => {
      hydrateRoot(el, tree(), { onRecoverableError: (error) => recoverable.push(error) })
    })
    expect(recoverable).toEqual([])
    expect(errors).not.toHaveBeenCalled()
    expect(el.querySelector('#a')!.textContent).toBe('finished <b>answer</b>')
    expect(el.querySelector('span')!.textContent).toBe('reveal text')
    expect(el.querySelector('em')!.textContent).toBe('shared wave')
  })
})

describe('Vue hydration', () => {
  const app = () =>
    createSSRApp({
      setup() {
        const history = useSmoothStream(() => 'history in a hook', { done: true })
        return () =>
          h('div', [
            h(VueSmoothText, { text: 'finished answer', done: true, as: 'p' }),
            h(VueReveal, { text: 'reveal text' }),
            h('i', history.text.value),
          ])
      },
    })

  it('hydrates server markup without a mismatch and keeps the text', async () => {
    const html = await renderVue(app())
    const el = container(html)
    const warnings: string[] = []
    const client = app()
    client.config.warnHandler = (message) => warnings.push(message)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    client.mount(el)
    expect(warnings).toEqual([])
    expect(errors).not.toHaveBeenCalled()
    expect(el.textContent).toBe('finished answerreveal texthistory in a hook')
    client.unmount()
  })
})

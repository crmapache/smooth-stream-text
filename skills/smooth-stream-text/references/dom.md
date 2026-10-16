<!-- Generated from website/dom.md by scripts/build-skill.mjs. Edit the docs page, not this file. -->

# Plain JavaScript and Web Component

> Pace and reveal streamed text without a framework using createSmoothText, or with the <smooth-stream-text> custom element in plain HTML, Angular, Solid, Astro or any framework that renders custom elements.
>
> smooth-stream-text 0.2.1. HTML version: https://smooth-stream-text.vercel.app/docs/dom

Two ways to use the package without React, Vue or Svelte: the imperative DOM handle,
and a custom element that wraps the same handle.

## createSmoothText

```ts
import { createSmoothText } from 'smooth-stream-text/dom'

const element = document.querySelector('#answer')!
const answer = createSmoothText(element)

answer.onSettled(() => showActions())

try {
  for await (const delta of stream) answer.push(delta)
} finally {
  // Finished, stopped or failed: close the answer, and the paced tail drains.
  answer.end()
}
```

The handle owns the element's children from the moment it is created; give it an empty
element. It paces what you push and fades new characters in. `onSettled` fires once
per answer, when the last character has finished its fade-in.

The rest of the handle:

- `setText(fullText)` instead of `push`, if your transport gives you the growing string.
- `flush()` shows everything received so far. For a "Show all" button that should skip
  the delay for the rest of the answer, call it again after every later `push`.
- `reset(text?)` starts over; with `text`, that text is already fully shown.
- `pause()` and `resume()` for an element that is hidden or detached. Nothing is lost.
- `subscribe(listener)` gives you the pacing state (`text`, `phase`, `pending`) on every
  change, for example to keep a `data-phase` attribute up to date.
- `destroy()` when the element goes away for good. The text stays where it is.

Finished history needs no handle at all: put the text in the element as plain text. A
handle leaves nothing but plain text behind once an answer is done.

### Pacing your own markup

If you render the text yourself, for example Markdown into several elements, use the
core for pacing and `createReveal` for the fade-in on each piece:

```ts
import { createReveal, createSmoothStream, createWaveTimeline, resolveRevealOptions } from 'smooth-stream-text/dom'

const stream = createSmoothStream()
const timeline = createWaveTimeline(resolveRevealOptions())
const paragraph = createReveal(element, { timeline })

stream.subscribe((state) => paragraph.update(state.text))
```

`update(fullVisibleText)` takes the whole visible text of that piece and animates only
what was appended. A shared `timeline` keeps the stagger continuous across pieces. The
[playground](https://smooth-stream-text.vercel.app) renders Markdown this way in about
200 lines of TypeScript.

## The Web Component

```html
<script type="module">
  import 'smooth-stream-text/web-component'
</script>

<smooth-stream-text text="A finished answer from history." done></smooth-stream-text>
```

Importing the module registers `<smooth-stream-text>`. With both `text` and `done` set
before the element joins the page, the text appears at once: that is how history is
rendered. A live answer is an empty element that you feed:

```ts
const element = document.createElement('smooth-stream-text')
element.addEventListener('sst:done', () => announce('Answer complete'))
list.append(element)

for await (const delta of stream) element.push(delta)
element.end()
```

`sst:done` bubbles and fires once per answer, when it is fully on screen. Settings are
attributes (`target-latency`, `unit`, `duration`, `min-cps`, `max-cps` and others; see
the [API reference](https://smooth-stream-text.vercel.app/docs/api.md#web-component)) or, for anything structured, the `options`
property. `text` and `done` are also properties, for frameworks that bind properties.

The stream belongs to the element, not to its place in the page. Moving it or taking
it out and putting it back pauses and resumes it with nothing lost or replayed, and
text pushed before the element is in the page is kept. An element removed for good
needs no cleanup.

The element does not dispatch an event for each phase change. Read `element.state`
when you need the current phase, or treat the answer as streaming from the first
`push` until `sst:done`.

Importing the module on a server does not throw, so pages rendered on the server can
import it directly. To use another tag name, call `defineSmoothStreamTextElement('my-tag')`.

### In frameworks without their own binding

Any framework that renders custom elements can use it: Angular (add
`CUSTOM_ELEMENTS_SCHEMA`), Solid, Qwik, Lit, Astro and server-rendered HTML. Bind
`text` and `done` as properties or attributes, and listen for `sst:done`.

## Complete example

[`examples/vanilla`](https://github.com/crmapache/smooth-stream-text/tree/main/examples/vanilla)
puts both on one page, fed by the same simulated stream, with Stop, Show all and Clear
chat. The imperative panel:

`examples/vanilla/src/imperative-panel.js`:

````js
import { createSmoothText } from 'smooth-stream-text/dom'
import { history } from './answers.js'
import { createChatPanel } from './chat-panel.js'
import { simulateStream } from './simulated-stream.js'

/** @param {HTMLElement} section */
export function mountImperativePanel(section) {
  const panel = createChatPanel(section)
  const { buttons } = panel
  /** Every handle on screen, so that Clear chat can release them. */
  const handles = new Set()
  /** The newest answer: its handle, and whether Show all was pressed for it. */
  let current = null
  /** The open transport, while there is one. */
  let transport = null

  for (const turn of history) {
    panel.addMessage('user', turn.question)
    // Finished text needs no handle: plain text is all a handle leaves on
    // screen once an answer is done.
    const body = panel.addMessage('assistant', turn.answer)
    body.dataset.phase = 'done'
  }

  function updateButtons() {
    buttons.send.disabled = transport !== null || !panel.input.value.trim()
    buttons.stop.disabled = transport === null
    buttons.showAll.hidden = !current || current.showAll || current.handle.state.phase === 'done'
  }

  panel.form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const question = panel.input.value.trim()
    if (!question || transport) return

    const answer = panel.nextAnswer()
    panel.addMessage('user', question)
    const body = panel.addMessage('assistant', '')
    // The handle owns `body` from here on: it paces what is pushed and fades it in.
    const handle = createSmoothText(body)
    const active = { handle, showAll: false }
    handles.add(handle)
    current = active

    body.dataset.phase = handle.state.phase
    handle.subscribe(({ phase }) => {
      if (body.dataset.phase === phase) return
      body.dataset.phase = phase
      updateButtons()
    })
    // Once per answer, when its last character has finished fading in.
    handle.onSettled(() => panel.announce('Answer complete'))
    panel.announce('')

    const controller = new AbortController()
    transport = controller
    updateButtons()
    try {
      for await (const chunk of simulateStream(answer, { signal: controller.signal })) {
        handle.push(chunk)
        // After Show all, the rest of this answer is shown as it lands.
        if (active.showAll) handle.flush()
      }
    } finally {
      // Finished, stopped or failed: close the answer, and the paced tail drains.
      handle.end()
      if (transport === controller) transport = null
      updateButtons()
    }
  })

  panel.input.addEventListener('input', updateButtons)

  buttons.stop.addEventListener('click', () => transport?.abort())

  buttons.showAll.addEventListener('click', () => {
    if (!current) return
    current.showAll = true
    current.handle.flush()
    updateButtons()
  })

  buttons.clear.addEventListener('click', () => {
    transport?.abort()
    // The elements are going away, so their handles go too: destroy() stops
    // every frame and timer they had scheduled.
    for (const handle of handles) handle.destroy()
    handles.clear()
    current = null
    panel.list.replaceChildren()
    panel.announce('')
    updateButtons()
  })

  updateButtons()
}
````
The Web Component panel:

`examples/vanilla/src/web-component-panel.js`:

````js
// Registers <smooth-stream-text>.
import 'smooth-stream-text/web-component'
import { history } from './answers.js'
import { createChatPanel } from './chat-panel.js'
import { simulateStream } from './simulated-stream.js'

/** @param {HTMLElement} section */
export function mountWebComponentPanel(section) {
  const panel = createChatPanel(section)
  const { buttons } = panel
  /** The newest answer: its element, and whether Show all was pressed for it. */
  let current = null
  /** The open transport, while there is one. */
  let transport = null

  for (const turn of history) {
    panel.addMessage('user', turn.question)
    // The same as <smooth-stream-text text="..." done> in HTML. Both are set
    // before the element joins the page, so it shows the text at once.
    const element = document.createElement('smooth-stream-text')
    element.setAttribute('text', turn.answer)
    element.setAttribute('done', '')
    element.dataset.phase = 'done'
    panel.addMessage('assistant', element)
  }

  function updateButtons() {
    buttons.send.disabled = transport !== null || !panel.input.value.trim()
    buttons.stop.disabled = transport === null
    buttons.showAll.hidden = !current || current.showAll || current.element.dataset.phase === 'done'
  }

  panel.form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const question = panel.input.value.trim()
    if (!question || transport) return

    const answer = panel.nextAnswer()
    panel.addMessage('user', question)
    const element = document.createElement('smooth-stream-text')
    const active = { element, showAll: false }
    current = active

    // The element reports no phase changes, only `sst:done`, once per answer
    // when its last character has finished fading in.
    element.dataset.phase = 'streaming'
    element.addEventListener('sst:done', () => {
      element.dataset.phase = 'done'
      panel.announce('Answer complete')
      updateButtons()
    })
    panel.addMessage('assistant', element)
    panel.announce('')

    const controller = new AbortController()
    transport = controller
    updateButtons()
    try {
      for await (const chunk of simulateStream(answer, { signal: controller.signal })) {
        element.push(chunk)
        // After Show all, the rest of this answer is shown as it lands.
        if (active.showAll) element.flush()
      }
    } finally {
      // Finished, stopped or failed: close the answer, and the paced tail drains.
      element.end()
      if (transport === controller) transport = null
      updateButtons()
    }
  })

  panel.input.addEventListener('input', updateButtons)

  buttons.stop.addEventListener('click', () => transport?.abort())

  buttons.showAll.addEventListener('click', () => {
    if (!current) return
    current.showAll = true
    current.element.flush()
    updateButtons()
  })

  buttons.clear.addEventListener('click', () => {
    transport?.abort()
    // Nothing to release by hand: an element taken out of the page pauses
    // itself, and one that never comes back is simply garbage collected.
    current = null
    panel.list.replaceChildren()
    panel.announce('')
    updateButtons()
  })

  updateButtons()
}
````

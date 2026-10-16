---
title: Plain JavaScript and Web Component
description: Pace and reveal streamed text without a framework using createSmoothText, or with the <smooth-stream-text> custom element in plain HTML, Angular, Solid, Astro or any framework that renders custom elements.
---

# Plain JavaScript and Web Component

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
the [API reference](/api#web-component)) or, for anything structured, the `options`
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

<<< @/../examples/vanilla/src/imperative-panel.js

The Web Component panel:

<<< @/../examples/vanilla/src/web-component-panel.js

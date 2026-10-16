---
title: React
description: Pace streamed LLM text in React with useSmoothText and keep react-markdown or any other renderer. Hooks, the SmoothText component, the optional reveal, history, Show all and StrictMode.
---

# React

```ts
import { useSmoothText, useSmoothStream, useSmoothStreamController, SmoothText, Reveal, RevealProvider } from 'smooth-stream-text/react'
```

React 18 and 19. The entry point starts with `'use client'`, so client components
in the Next.js App Router can import it directly. Server components cannot use the
hooks, as with any hook.

## useSmoothText: the usual path

Most chat UIs already parse Markdown and render it with their own components. Those
only need the paced string:

```tsx
import ReactMarkdown from 'react-markdown'
import { useSmoothText } from 'smooth-stream-text/react'

function Answer({ answer, streaming }: { answer: string; streaming: boolean }) {
  const { text, phase, flush } = useSmoothText(answer, { done: !streaming })
  return <ReactMarkdown>{text}</ReactMarkdown>
}
```

`answer` is the text received so far. `streaming` is your own flag for "the
transport may still add to this answer". `text` is a prefix of `answer` that grows
at an even rate. Parse and render it exactly as before.

The hook re-renders only when `text` or `phase` changes. While an answer appears,
that is at most once per animation frame, which can be more often than chunks arrive:
in the [browser benchmark](/benchmarks#rendering-cost-in-a-browser) a recorded answer
was rendered about twice as often when paced as when rendered once per chunk. If your Markdown rendering is
expensive, `unit: 'word'` changes the visible text only at word boundaries and renders
less often, and memoizing finished blocks helps as it would without pacing.

Pacing options go in the same object: `useSmoothText(answer, { done, targetLatencyMs: 120 })`.
They can change between renders.

It returns `text`, `phase` and three controls: `flush()` shows everything received
so far, `reset(text?)` starts over (with `text` already fully shown), and
`setOptions(partial)` changes settings at runtime.

### History, new answers and one hook per message

The usual layout is one `Answer` component per assistant message, each with its
own hook. Pass `done: true` for every message except the one that is still arriving:

```tsx
messages.map((message, index) => (
  <Answer
    key={message.id}
    answer={message.text}
    // Only the newest answer can still be streaming; everything above it is history.
    streaming={index === messages.length - 1 && isStreaming}
  />
))
```

A message that is already done on its first render is history: it appears at once
and never animates, so loading a conversation is instant. When the transport closes
the newest answer, `done` turns true and the remaining backlog drains within about a
second. `done` may flip before the last chunk lands; the late chunk is still shown.

One hook can also serve a whole conversation: text that does not continue the
previous text is treated as another answer. Separate hooks per message are simpler
to reason about and are what the examples use.

### Show all

`flush()` shows everything received so far. Text that arrives afterwards is paced
again, because the stream is still open. A "Show all" button usually means "no more
delay for this answer", so keep flushing until it ends:

```tsx
const [skipped, setSkipped] = useState(false)
const { text, phase, flush } = useSmoothText(answer, { done: !streaming })

useEffect(() => {
  if (skipped) flush()
}, [skipped, answer, flush])
```

### Knowing when an answer is on screen

`phase` goes `idle`, then `streaming`, then `settling` once the transport has closed
and the tail is draining, then `done`. `done` is the moment to show copy buttons or
announce the answer to screen readers. History starts out `done`, so if you react to
the transition rather than the value, loaded messages stay quiet:

```tsx
const previous = useRef(phase)
useEffect(() => {
  if (phase === 'done' && previous.current !== 'done') onComplete()
  previous.current = phase
}, [phase, onComplete])
```

## useSmoothStream: the full state

Same arguments as `useSmoothText`, but it returns the whole state on every change:
`text`, `cursor`, `source`, `pending` (characters received but not shown yet),
`phase` and `charsPerSecond`. It re-renders more often; use it for debugging, charts
or a custom indicator.

## useSmoothStreamController: when you have deltas

If your transport hands you chunks and you would rather not accumulate them yourself:

```tsx
const { text, phase, push, end, reset } = useSmoothStreamController()

// push(delta) for every chunk, end() when the stream closes,
// reset() before the next answer, reset(fullText) to show a finished one.
```

## SmoothText: pacing and reveal in one element

For plain text, without your own renderer, `SmoothText` paces the text and fades new
characters in:

```tsx
import { SmoothText } from 'smooth-stream-text/react'

<SmoothText text={answer} done={!streaming} as="p" onSettled={showActions} />
```

`onSettled` fires once per answer, when the last character has finished animating.
An answer unmounted before then is never announced; one hidden by `<Activity>` is
announced when it is shown again. Every pacing and [reveal option](/api#reveal-options)
is a prop. `className` styles the host, `unitClassName` goes on every animating unit,
and other props (`id`, `aria-*`, `style`, a `ref`) go to the host element.

## Reveal: the fade-in on your own markup

The reveal is a separate layer, so it can sit on the pieces your renderer produces:

```tsx
import { Reveal, RevealProvider, useSmoothText } from 'smooth-stream-text/react'

function Answer({ answer, streaming, messageId }) {
  const { text } = useSmoothText(answer, { done: !streaming })
  const blocks = parseMarkdown(text) // your parser

  return (
    <RevealProvider resetKey={messageId}>
      {blocks.map((block, i) =>
        block.type === 'paragraph' ? (
          <Reveal key={i} as="p">
            {block.text}
          </Reveal>
        ) : (
          <CodeBlock key={i} {...block} />
        ),
      )}
    </RevealProvider>
  )
}
```

This snippet is a sketch: `parseMarkdown` and `CodeBlock` stand for your own code.

`RevealProvider` shares one wave across everything below it, so the stagger stays
continuous when an answer is split into blocks. `Reveal` takes a **string** and
animates only what was appended since its last render. Two rules make it safe with a
parser that rebuilds its tree:

- A freshly mounted `Reveal` treats its text as already on screen, so a recreated
  node does not replay. Pass `initialText=""` when you create an element for text
  that is genuinely new and want it to animate.
- If the text is no longer an extension of what was shown (the parser re-split a
  paragraph), it reseeds silently instead of animating text the reader already saw.

If your renderer animates new words itself, as Streamdown can, skip the reveal and
use only the pacing. Two layers animating the same words fight each other.

## Lifecycle

The stream is created once per component instance and paused, not destroyed, when the
component unmounts. That is what makes React StrictMode's mount, unmount, mount
sequence and an `<Activity>` boundary harmless: the second mount carries on where the
first stopped. A paused stream draws nothing and keeps its buffer.

On the server, hooks return the text that is already done (history) on the first
render, so it is in the server HTML; `Reveal` and `SmoothText` render their text as
ordinary markup. Nothing is scheduled on the server.

## Complete example

[`examples/react-markdown`](https://github.com/crmapache/smooth-stream-text/tree/main/examples/react-markdown)
is a runnable Vite app with a simulated stream, history, Stop and Show all. The whole
integration is this component:

<<< @/../examples/react-markdown/src/Answer.tsx

And the part of the app that owns the transport:

<<< @/../examples/react-markdown/src/App.tsx#transport

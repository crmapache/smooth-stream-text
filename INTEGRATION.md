# Integrating smooth-stream-text

A short guide that ships inside the package, for people and coding assistants working
offline. It covers version 0.2.2. The full documentation, with a page per framework and
runnable examples, is at https://smooth-stream-text.vercel.app/docs/ (plain Markdown:
https://smooth-stream-text.vercel.app/llms.txt).

## What it does

It paces streamed text on the client. You pass the text received so far and whether
the answer is done; it returns a prefix that grows at an even, adaptive rate. You render
that prefix with the renderer you already use. It is not a transport, a Markdown parser
or a sanitizer, and it works with any provider because it only sees text.

Use it when text arrives in uneven bursts and you want to keep your renderer. Skip it
for static Markdown, for transport problems (retries, reconnects), for a CSS typing
effect, or when another layer (such as the AI SDK's `smoothStream()` on the server)
already paces the text well enough: two layers add their delays.

## Install

Use the project's package manager:

```sh
npm install smooth-stream-text
```

No runtime dependencies. React (18+) and Vue (3.2+) are optional peers.

## Pick the entry point

| Stack | Import | Main API |
| --- | --- | --- |
| React, Next.js client components | `smooth-stream-text/react` | `useSmoothText(text, { done })` |
| Vue, Nuxt | `smooth-stream-text/vue` | `useSmoothStream(() => text, { done: () => done })` |
| Svelte 4/5, SvelteKit | `smooth-stream-text/svelte` | `smoothStream()` store, `apply(text, done)` |
| Plain DOM | `smooth-stream-text/dom` | `createSmoothText(element)` |
| Any framework via custom elements | `smooth-stream-text/web-component` | `<smooth-stream-text>` |
| No DOM (Node, workers, tests) | `smooth-stream-text` | `createSmoothStream()` |

## The pattern

React:

```tsx
import { useSmoothText } from 'smooth-stream-text/react'

function Answer({ text, streaming }: { text: string; streaming: boolean }) {
  const { text: visible, phase } = useSmoothText(text, { done: !streaming })
  return <Markdown>{visible}</Markdown>
}
```

Render one such component per assistant message. Pass `streaming` true only for the
newest message while the transport is still open. With the AI SDK's `useChat`:
`streaming = isLast && (status === 'submitted' || status === 'streaming')`, and the text
is the message's text parts joined.

Vue:

```ts
import { useSmoothStream } from 'smooth-stream-text/vue'

const { text, phase } = useSmoothStream(() => props.text, { done: () => !props.streaming })
```

Svelte 5:

```svelte
<script lang="ts">
  import { smoothStream } from 'smooth-stream-text/svelte'
  import { onDestroy } from 'svelte'

  let { text, streaming } = $props()
  const smooth = smoothStream()
  const sync = () => smooth.apply(text, !streaming)
  sync() // effects do not run on the server; this puts finished text in the server HTML
  $effect(sync)
  onDestroy(smooth.destroy)
</script>

{$smooth.text}
```

Plain DOM:

```ts
import { createSmoothText } from 'smooth-stream-text/dom'

const answer = createSmoothText(element)
try {
  for await (const delta of stream) answer.push(delta)
} finally {
  answer.end()
}
```

## Rules every binding follows

- Text that is already done the first time it is passed is history: it appears at once.
- When `done` becomes true, the rest drains within about a second (twice `settleMs`).
- Text that does not continue the previous text is another answer: shown at once if
  done, paced from the start if not.
- `phase` is `idle`, `streaming`, `settling`, then `done`. Use the change to `done` to
  show actions or announce the answer; history starts out `done`.

## Mistakes to avoid

- Passing only the latest delta to `useSmoothText`. It takes the accumulated text; for
  deltas use `useSmoothStreamController()` and call `push(delta)` and `end()`.
- Never setting `done`. The text still drains after a pause, but `phase` never reaches
  `done`.
- Passing history with `done: false`. It then replays as if it were streaming.
- Adding `smoothStream()` on the server as well. Pace in one layer.
- Using `SmoothText` or `Reveal` together with a renderer that animates words itself
  (Streamdown's `animated`). Keep one animation layer; with Streamdown, use only
  `useSmoothText` and set `isAnimating={phase !== 'done'}`.
- Calling the hooks in React Server Components. The React entry is client-only.
- Expecting `flush()` to skip the rest of an answer. It shows what has arrived; call it
  again as more text arrives if "Show all" should last.
- Putting `aria-live` on the growing text. Announce the finished answer instead.
- Importing from `smooth-stream-text/src/...` or `dist/...`. Use the entry points above.
- Installing `smooth-stream` or `use-smooth-text`. Those are different, unrelated
  packages; `use-smooth-text` even has a hook with the same name, `useSmoothText`, so
  check that the import comes from `smooth-stream-text/react`.

## Options worth knowing

| Option | Default | Effect |
| --- | --- | --- |
| `targetLatencyMs` | `180` | How far the display runs behind the received text. |
| `maxCharsPerSecond` | `900` | Ceiling on the rate. Raise it for faster models. |
| `settleMs` | `400` | How long the tail takes once the answer is done. |
| `unit` | `'char'` | `'word'` adds whole words only. |
| `boundary` | `'markdown'` | Never ends the visible text inside `**`, a link or an emoji. |

Counts are UTF-16 code units, like JavaScript string lengths. All options:
https://smooth-stream-text.vercel.app/docs/api

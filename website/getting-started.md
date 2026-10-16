---
title: Getting started
description: Install smooth-stream-text, feed it the text your stream has received, and render the paced text it returns. React, Vue, Svelte, plain JavaScript and the headless core.
---

# Getting started

## Install

Use the package manager your project already uses:

```sh
npm install smooth-stream-text
# pnpm add smooth-stream-text
# yarn add smooth-stream-text
```

The package has no runtime dependencies. React (18 or newer) and Vue (3.2 or newer)
are optional peer dependencies: nothing extra is installed, and you only need the
framework you import from. It ships ES modules, CommonJS and TypeScript types for
every entry point.

## The one idea

Every integration works the same way. On each change you hand over two things:

- the **whole text received so far** for the current answer, and
- whether that answer is **done**, meaning the transport has closed it.

You get back the **visible text**: a prefix of what you handed over that grows at an
even rate, and a `phase` of `'idle'`, `'streaming'`, `'settling'` or `'done'`.

Three rules follow from that, and they hold in every binding:

1. Text that is already done the first time you hand it over is **history**. It
   appears at once, without pacing or animation, so a loaded conversation does not
   replay.
2. Text that does not continue the previous text is a **different answer**. If it is
   already done, it is shown at once; if it is still streaming (a regenerated
   answer, say), it is paced from the start.
3. `done` closes whichever answer is current. The rest of the backlog then drains to
   the end within about a second (twice `settleMs`, 400 ms by default), even if the
   last chunk arrives after `done` was set.

## React

```tsx
import { useSmoothText } from 'smooth-stream-text/react'

function Answer({ answer, streaming }: { answer: string; streaming: boolean }) {
  const { text, phase } = useSmoothText(answer, { done: !streaming })
  return <Markdown>{text}</Markdown>
}
```

`useSmoothText` re-renders only when the visible text or the phase changes: at
most once per animation frame while text is appearing. The entry point is marked
`'use client'`, so it can be imported from Next.js App Router client components.
More in the [React guide](/react).

## Vue

```vue
<script setup lang="ts">
import { useSmoothStream } from 'smooth-stream-text/vue'

const props = defineProps<{ answer: string; streaming: boolean }>()
const { text } = useSmoothStream(() => props.answer, { done: () => !props.streaming })
</script>

<template>
  <MyMarkdown :source="text" />
</template>
```

More in the [Vue and Nuxt guide](/vue).

## Svelte

```svelte
<script lang="ts">
  import { smoothStream } from 'smooth-stream-text/svelte'
  import { onDestroy } from 'svelte'

  let { answer, streaming } = $props()
  const smooth = smoothStream()
  $effect(() => smooth.apply(answer, !streaming))
  onDestroy(smooth.destroy)
</script>

<p>{$smooth.text}</p>
```

More in the [Svelte and SvelteKit guide](/svelte).

## Plain JavaScript

When the text is plain, the DOM handle does pacing and the fade-in reveal in one
element:

```ts
import { createSmoothText } from 'smooth-stream-text/dom'

const answer = createSmoothText(document.querySelector('#answer')!)
for await (const delta of stream) answer.push(delta)
answer.end()
```

The [plain JavaScript guide](/dom) also covers the `<smooth-stream-text>` Web
Component, which works in Angular, Solid, Astro and any other framework that renders
custom elements.

## Without a DOM

The core is plain logic. It runs in Node 18 and newer, in workers and in tests:

```ts
import { createSmoothStream } from 'smooth-stream-text'

const stream = createSmoothStream()
stream.subscribe((state) => render(state.text))

for await (const delta of response) stream.push(delta)
stream.end()
```

`push` takes deltas and `setSource` takes the growing full string; use whichever your
transport gives you. See the [API reference](/api#core).

## Settings that matter first

Defaults are chosen so that most chats need none. The ones worth knowing:

| Option | Default | What it changes |
| --- | --- | --- |
| `targetLatencyMs` | `180` | How far behind the live text the display runs. Lower feels more immediate, higher is smoother. |
| `unit` | `'char'` | `'word'` adds only whole words, in every script. |
| `maxCharsPerSecond` | `900` | Ceiling on the rate, so a burst is never dumped at once. |
| `settleMs` | `400` | How long the tail takes to drain once the answer is done. |

All of them, and the reveal settings, are in the [API reference](/api#pacing-options).

## Next

- Wire it into your stack: [AI SDK](/integrations/ai-sdk), [Next.js](/integrations/nextjs),
  [Streamdown](/integrations/streamdown).
- Understand what pacing costs in time: [latency and completion](/concepts/latency).
- See where the visible text may end: [text boundaries](/concepts/text-boundaries).

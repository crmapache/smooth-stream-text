<!-- Generated from website/vue.md by scripts/build-skill.mjs. Edit the docs page, not this file. -->

# Vue and Nuxt

> Pace streamed LLM text in Vue 3 and Nuxt with useSmoothStream and keep your own Markdown rendering. Refs and getters, the SmoothText component, KeepAlive, and server-rendered history in Nuxt.
>
> smooth-stream-text 0.2.1. HTML version: https://smooth-stream-text.vercel.app/docs/vue

```ts
import { useSmoothStream, SmoothText, Reveal, RevealProvider } from 'smooth-stream-text/vue'
```

Vue 3.2 or newer. Verified with Vue 3.5 and Nuxt 4.6.

## useSmoothStream: the headless path

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useSmoothStream } from 'smooth-stream-text/vue'

const props = defineProps<{ text: string; streaming: boolean }>()

const { text, phase, flush } = useSmoothStream(() => props.text, { done: () => !props.streaming })
const html = computed(() => renderMarkdown(text.value)) // your renderer
</script>

<template>
  <div :data-phase="phase" v-html="html" />
</template>
```

The source can be a ref or a getter; so can `done`, which also accepts a plain
boolean. A getter is the natural way to pass props. `text` and `phase` are computed
refs, and `state` is a ref of the full state (`pending`, `charsPerSecond` and the
rest). Pacing options go in the same object as `done` and can be changed later with
`setOptions`.

If your renderer accepts raw HTML from the model, sanitize it there, exactly as
without pacing; the example uses `marked` with `isomorphic-dompurify`.

The same rules hold as everywhere: a message that is already done when it first
arrives is history and appears at once; when `done` turns true, the rest drains within
about a second; text that does not continue the previous text starts a new answer.

### Show all

`flush()` shows everything received so far. Text that arrives later would be paced
again, so to skip the delay for the rest of the answer, keep flushing while text is
pending:

```ts
watchEffect(() => {
  if (props.showAll && state.value.pending > 0) flush()
})
```

### Knowing when an answer is on screen

Watch `phase`. History starts out `done` and never changes, so a watcher on the
change to `done` fires only for answers that were actually paced:

```ts
watch(phase, (next) => {
  if (next === 'done') emit('done')
})
```

## SmoothText: pacing and reveal in one element

For plain text without your own renderer:

```vue
<SmoothText :text="answer" :done="!streaming" :options="{ targetLatencyMs: 150 }" @settled="showActions" />
```

`settled` is emitted once per answer, when its last character has finished fading in.
`as` sets the host element (`div` by default) and `className` its class.

For Markdown you render yourself, `RevealProvider` and `Reveal` add the fade-in to your
own elements; see the [React guide](https://smooth-stream-text.vercel.app/docs/react.md#reveal-the-fade-in-on-your-own-markup) for
how the reveal behaves, which is the same in Vue.

## Lifecycle

Pacing starts once the component is mounted, so server rendering schedules nothing.
Inside `<KeepAlive>`, the stream pauses while the component is deactivated and
continues when it is shown again. The stream is destroyed with the component's scope.

## Nuxt

Load the conversation so that it is part of the server render, for example with
`useFetch`, and pass finished messages with `streaming: false`. Their text is in the
server HTML, complete, and hydration does not replay it. Only the answer that is still
streaming is paced, on the client.

`smooth-stream-text/vue` can be imported in components directly; no Nuxt module is
needed.

## Complete example

[`examples/nuxt`](https://github.com/crmapache/smooth-stream-text/tree/main/examples/nuxt)
is a Nuxt 4 app with a server route streaming Server-Sent Events, history loaded with
`useFetch`, Stop and Show all. The assistant message:

`examples/nuxt/app/components/AssistantMessage.vue`:

````vue
<script setup lang="ts">
import { useSmoothStream } from 'smooth-stream-text/vue'
import { renderMarkdown } from '~/utils/markdown'

const props = defineProps<{
  text: string
  streaming: boolean
  /** Reveal the rest of this answer without pacing. */
  showAll?: boolean
}>()

const emit = defineEmits<{
  /** The answer is completely on screen. Never emitted for history, which starts that way. */
  done: []
}>()

// `text` is an evenly growing prefix of `props.text`. A message that is already
// finished on its first render, like history, is shown at once, also on the server.
const { text, phase, state, flush } = useSmoothStream(() => props.text, { done: () => !props.streaming })
const html = computed(() => renderMarkdown(text.value))

// flush() reveals what has arrived so far. While the answer is still arriving,
// keep flushing, so that "Show all" also covers the text that comes after it.
watchEffect(() => {
  if (props.showAll && state.value.pending > 0) flush()
})

watch(phase, (next) => {
  if (next === 'done') emit('done')
})
</script>

<template>
  <div class="answer" data-testid="assistant-message" :data-phase="phase" v-html="html" />
</template>
````

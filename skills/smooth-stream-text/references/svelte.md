<!-- Generated from website/svelte.md by scripts/build-skill.mjs. Edit the docs page, not this file. -->

# Svelte and SvelteKit

> Pace streamed LLM text in Svelte 4 and 5 and SvelteKit with the smoothStream store or the smoothText action. Runes, cleanup, Show all, and server-rendered history.
>
> smooth-stream-text 0.2.1. HTML version: https://smooth-stream-text.vercel.app/docs/svelte

```ts
import { smoothStream, smoothText, reveal } from 'smooth-stream-text/svelte'
```

Nothing is imported from Svelte, so the store and the actions work in Svelte 4 and 5.
Verified with Svelte 5.57 and SvelteKit 3.1.

## The store: the headless path

```svelte
<script lang="ts">
  import { smoothStream } from 'smooth-stream-text/svelte'
  import { onDestroy } from 'svelte'

  let { text, streaming } = $props()

  const smooth = smoothStream()
  const sync = () => smooth.apply(text, !streaming)
  // Effects do not run on the server. Apply once during setup too, so the server
  // HTML of a finished message already holds its text.
  sync()
  $effect(sync)
  onDestroy(smooth.destroy)
</script>

<div data-phase={$smooth.phase}>{@html renderMarkdown($smooth.text)}</div>
```

`smoothStream(options?)` is a readable store of the pacing state (`text`, `phase`,
`pending` and the rest). `apply(text, done)` hands over the latest text and whether it
is finished, on every change, and follows the same rules as the other bindings: text
that is already done the first time is history and appears at once; `done` closes the
answer and the rest drains within about a second. `destroy` releases it.

If your renderer accepts raw HTML from the model, sanitize it there, exactly as without
pacing.

In Svelte 4, use a reactive statement instead of the effect:

```svelte
<script>
  export let text = ''
  export let streaming = true

  const smooth = smoothStream()
  $: smooth.apply(text, !streaming)
  onDestroy(smooth.destroy)
</script>
```

### Show all

`flush()` shows everything received so far; text arriving later would be paced again.
To skip the delay for the rest of the answer, keep flushing while text is pending:

```svelte
$effect(() => {
  if (showAll && $smooth.pending > 0) smooth.flush()
})
```

### Knowing when an answer is on screen

History starts out `done`. React to the change to `done`, not to the value, so that only
answers that were paced report finishing; the example below does this with a flag.

## The action: pacing and reveal in one element

For plain text, without your own renderer:

```svelte
<p use:smoothText={{ text: answer, done: !streaming, onSettled: showActions }}></p>
```

The action owns the element's content, paces the text and fades new characters in.
`onSettled` is called once per answer, when it is fully on screen. Any pacing or reveal
option can go in the same object.

`use:reveal={{ text }}` adds only the fade-in to an element whose text you pace
yourself.

Actions do not run on the server, so an element with an action is empty in the server
output and fills in on the client. For server-rendered history, use the store.

## Complete example

[`examples/sveltekit`](https://github.com/crmapache/smooth-stream-text/tree/main/examples/sveltekit)
is a SvelteKit 3 app with Svelte 5 runes, a server route streaming Server-Sent Events,
history loaded in `+page.server.ts`, Stop and Show all. The assistant message:

`examples/sveltekit/src/lib/AssistantMessage.svelte`:

````svelte
<script lang="ts">
  import { smoothStream } from 'smooth-stream-text/svelte'
  import { onDestroy } from 'svelte'
  import { renderMarkdown } from '#lib/markdown.ts'

  interface Props {
    text: string
    streaming: boolean
    /** Reveal the rest of this answer without pacing. */
    showAll?: boolean
    /** The answer is completely on screen. Never called for history, which starts that way. */
    ondone?: () => void
  }

  let { text, streaming, showAll = false, ondone }: Props = $props()

  // `$smooth.text` is an evenly growing prefix of `text`. A message that is already
  // finished when it first arrives, like history, is shown at once.
  const smooth = smoothStream()
  const sync = () => smooth.apply(text, !streaming)
  // Effects do not run on the server: apply once during setup as well, so the
  // server HTML of a finished message holds its full text.
  sync()
  $effect(sync)
  onDestroy(smooth.destroy)

  // flush() reveals what has arrived so far. While the answer is still arriving,
  // keep flushing, so that "Show all" also covers the text that comes after it.
  $effect(() => {
    if (showAll && $smooth.pending > 0) smooth.flush()
  })

  // History starts done, so only an answer that was drawn reports finishing.
  let drawing = $smooth.phase !== 'done'
  $effect(() => {
    if (drawing && $smooth.phase === 'done') {
      drawing = false
      ondone?.()
    }
  })
</script>

<div class="answer" data-testid="assistant-message" data-phase={$smooth.phase}>
  {@html renderMarkdown($smooth.text)}
</div>
````

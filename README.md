# smooth-stream-text

<p align="center">
  <img
    src="https://raw.githubusercontent.com/crmapache/smooth-stream-text/main/docs/demo.gif"
    alt="The same answer streamed twice, side by side. On the left chunks land as they arrive and the text stutters; on the right it flows at an even rate with new words fading in."
    width="760" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/smooth-stream-text"><img src="https://img.shields.io/npm/v/smooth-stream-text.svg" alt="npm version" /></a>
  <a href="https://bundlephobia.com/package/smooth-stream-text"><img src="https://img.shields.io/bundlephobia/minzip/smooth-stream-text" alt="minzipped size" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/smooth-stream-text.svg" alt="MIT license" /></a>
</p>

When a language model answers, the chunks arrive **unevenly**: one word, then twenty
at once, then a pause while the server thinks. Rendering each chunk the moment it
lands means the text stutters, and the eye reads the stutter before it reads the
words.

`smooth-stream-text` buffers what arrives and releases it at a visually even rate,
then reveals new text as a soft left-to-right wave.

- **A real pacing controller.** Not a fixed characters-per-second you tune per
  model - the rate follows from holding a constant distance behind the live text,
  so it adapts to whatever is feeding it.
- **Headless first.** Take the smoothed string and render it however you already
  do. The ready-made component is a convenience, not the only way in.
- **Zero runtime dependencies.** The core is pure logic and runs in Node, which is
  why its timing is tested without a browser and without waiting.
- **Every framework.** React, Vue, Svelte and a `<smooth-stream-text>` Web
  Component - which also covers Angular, Solid, Qwik, Astro and plain HTML. Each
  framework is an _optional_ peer dependency.
- **Careful about the text itself.** The cursor never stops inside a `**`, a
  half-written link, or an emoji, so a markdown renderer downstream never flashes
  broken syntax.

## Install

```sh
npm install smooth-stream-text
```

## Quick start - headless (the main path)

Most chat UIs parse markdown themselves and render it with their own components.
Those only need the smoothed string:

```tsx
import { useSmoothStream } from 'smooth-stream-text/react'

function Answer({ answer, streaming }: { answer: string; streaming: boolean }) {
  const { text } = useSmoothStream(answer, { done: !streaming })

  // `text` is a prefix of `answer` that grows evenly. Parse and render it exactly
  // as you did before.
  return <Markdown>{text}</Markdown>
}
```

That is the whole integration. Feed it your accumulated answer, render what comes
back.

If your transport hands you deltas and you would rather not accumulate them:

```tsx
import { useSmoothStreamController } from 'smooth-stream-text/react'

const { text, push, end } = useSmoothStreamController()
// push(delta) on each chunk, end() when the stream closes
```

## Adding the wave to your own markup

The reveal is a separate layer, so you can hang it on the pieces your renderer
produces - paragraphs, list items, headings, table cells:

```tsx
import { Reveal, RevealProvider } from 'smooth-stream-text/react'

function Answer({ answer, streaming, messageId }) {
  const { text } = useSmoothStream(answer, { done: !streaming })
  const blocks = parseMarkdown(text) // whatever you already use

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

`RevealProvider` shares one wave across everything beneath it, so the stagger stays
continuous when an answer is split into separate blocks. `Reveal` takes a **string**
and animates only what was appended since the last render.

Two behaviours make this safe with a parser that rebuilds its tree:

- **Mounting seeds, it does not animate.** A freshly created `Reveal` treats its
  text as already settled, so a recreated node shows its text instantly instead of
  replaying it.
- **A non-extension is a silent reseed.** If the text is no longer an extension of
  what was shown - the parser re-split a paragraph, or moved text between blocks -
  it reseeds rather than re-animating text the reader already saw.

## Ready-made component

When you are rendering plain text and want both layers in one element:

```tsx
import { SmoothText } from 'smooth-stream-text/react'

<SmoothText text={answer} done={!streaming} as="p" onSettled={showActions} />
```

## Without React

<details>
<summary><b>Plain JavaScript</b></summary>

```ts
import { createSmoothText } from 'smooth-stream-text/dom'

const handle = createSmoothText(document.getElementById('answer')!)

handle.push('Hello ')
handle.push('there')
handle.end()

// later
handle.destroy()
```

The element is owned entirely by the handle - give it a host with no other
children.

</details>

<details>
<summary><b>Vue 3</b></summary>

```vue
<script setup lang="ts">
import { SmoothText, useSmoothStream } from 'smooth-stream-text/vue'
import { computed, ref } from 'vue'

const answer = ref('')
const streaming = ref(true)
const finished = computed(() => !streaming.value)

// headless: `text` and `phase` are refs
const { text, phase } = useSmoothStream(answer, { done: finished })
</script>

<template>
  <p>{{ text }}</p>

  <!-- or the ready-made component -->
  <SmoothText :text="answer" :done="finished" :options="{ targetLatencyMs: 150 }" />
</template>
```

</details>

<details>
<summary><b>Svelte</b></summary>

```svelte
<script lang="ts">
  import { smoothStream, smoothText } from 'smooth-stream-text/svelte'
  import { onDestroy } from 'svelte'

  export let answer = ''
  export let streaming = true

  // headless: a plain readable store you feed yourself
  const stream = smoothStream()
  $: stream.setSource(answer)
  $: if (!streaming) stream.end()
  onDestroy(stream.destroy)
</script>

<p>{$stream.text}</p>

<!-- or the action, which owns the element -->
<p use:smoothText={{ text: answer, done: !streaming }}></p>
```

Both the actions and the store are plain objects - nothing is imported from Svelte,
so the package never appears in your bundle twice.

</details>

<details>
<summary><b>Web Component (Angular, Solid, Qwik, Astro, plain HTML)</b></summary>

```html
<script type="module">
  import 'smooth-stream-text/web-component'
</script>

<smooth-stream-text text="Hello there" done></smooth-stream-text>
```

```ts
const el = document.querySelector('smooth-stream-text')
el.options = { targetLatencyMs: 150 }
el.push(' more text')
el.addEventListener('sst:done', () => console.log('finished'))
```

Attributes: `text`, `done`, `unit`, `duration`, `stagger`, `blur`, `translate`,
`target-latency`, `min-cps`, `max-cps`, `boundary`. Anything structured goes
through the `options` property.

</details>

## How the pacing works

Every frame the controller asks for the rate that would drain the current backlog
over the target latency, then eases the current rate towards it:

```ts
const desired = pending / targetLatencyMs
const alpha = 1 - Math.exp(-dt / adaptMs)
rate += (desired - rate) * alpha
```

That is the whole idea, and it is why there is no speed to configure per model:

- A fast producer builds a bigger backlog and gets drained faster; a slow one is
  drained slower.
- A twenty-word burst becomes a visible acceleration over a couple of tenths of a
  second instead of a wall of text, because the **rate** is smoothed, not the
  backlog.
- When the producer stops - closed outright, or silent past the grace period - the
  target decays to zero across the settle window, so the tail accelerates gently
  into a stop instead of stalling three characters from the end.
- If the backlog grows past what can be drawn sanely (a tab returning from the
  background, a whole message handed over at once) the display jumps rather than
  crawling.

Because the stream is already even, only a word or two arrives per frame, so the
stagger between neighbouring words is a garnish rather than the source of the wave.
Its real job is the occasional genuine batch.

## Where it is allowed to cut

`boundary: 'markdown'` (the default) means the visible prefix is never something a
markdown parser would render wrongly:

- Never inside a delimiter run - `**`, `~~`, `` ``` ``, the `](` of a link. A lone
  `*` where the author wrote `**` is exactly the flicker being removed.
- Never while an inline construct is open - emphasis, inline code, a link, a
  line-leading `#`/`-`/`>`/`1.` before its first content character, a table row
  before its newline.
- **Never** inside a fenced code block's body. Holding one to its closing fence
  would stall the stream for thousands of characters; only the fence marker itself
  is atomic.
- Two safety valves: a hold that lasts longer than `holdMs` or withholds more than
  `holdChars` characters is released anyway. A briefly literal `**` beats a frozen
  stream.

Grapheme safety applies in **every** mode, including `'char'`: a cut never splits a
surrogate pair, a combining mark, a flag, or a ZWJ emoji sequence.

Other modes: `'char'` (anywhere), `'word'` (only at whitespace), or your own
function `(source, desired, closed) => number` returning the largest allowed index.

## Options

### Pacing

| Option | Default | Meaning |
| --- | --- | --- |
| `targetLatencyMs` | `180` | How far behind the live text the display runs. The main feel knob. |
| `adaptMs` | `250` | Time constant for smoothing the rate. Larger means lazier acceleration. |
| `minCharsPerSecond` | `12` | Floor. |
| `maxCharsPerSecond` | `900` | Ceiling. What keeps a burst from becoming a dump. |
| `settleMs` | `400` | How long the tail takes to drain once the producer stops. |
| `idleGraceMs` | `200` | Silence tolerated before the tail drains anyway, on a still-open stream. |
| `maxLatencyMs` | `2000` | Above this projected lag the display jumps instead of catching up. |
| `maxFrameMs` | `100` | Per-tick clamp on elapsed time, so a stalled frame cannot cause one big jump. |
| `boundary` | `'markdown'` | Where the cursor may stop. |
| `holdMs` | `400` | Longest a boundary may hold the cursor before it is released anyway. |
| `holdChars` | `120` | Most characters a boundary may hold back before it is released anyway. |
| `clock` | rAF | Injected time source. See [testing](#testing-your-own-pacing). |

### Reveal

| Option | Default | Meaning |
| --- | --- | --- |
| `unit` | `'word'` | What animates as one unit: `'word'` or `'char'`. |
| `durationMs` | `380` | How long one unit takes to appear. |
| `staggerMs` | `36` | Delay between neighbouring units. |
| `blurPx` | `4` | Starting blur. |
| `translatePx` | `3` | Starting upward shift. `0` keeps the spans `display: inline`, for zero layout impact. |
| `easing` | `cubic-bezier(.22,.61,.36,1)` | Timing function. |
| `maxWaveLagMs` | `240` | Above this queue depth the stagger compresses, so a batch cannot queue a long wave. |
| `respectReducedMotion` | `true` | Under `prefers-reduced-motion` no spans are created at all. |
| `injectStyles` | `true` | Set to `false` to skip the built-in stylesheet and supply your own. |
| `className` | - | Extra class on every animating unit. |

Every option can be changed at runtime through `setOptions`.

## Details worth knowing

**Copying stays clean.** A word lives in a `<span>` only while it is animating;
once finished it collapses back into the surrounding text node. A long answer is a
flat text node plus a handful of spans, not thousands of them, and a selection
copies exactly the characters on screen.

**No CSS file to import.** One small `<style>` is injected on first use, and every
visual parameter is a CSS custom property (`--sst-duration`, `--sst-blur`,
`--sst-translate`, `--sst-easing`) set on the host - so you can restyle `.sst-word`
entirely from your own CSS, or pass `injectStyles: false` and write it yourself.

**Reduced motion** produces no spans at all: the text is simply extended.

**A hidden tab** needs no special handling. `requestAnimationFrame` stops while the
tab is hidden, and on return the backlog trips the `maxLatencyMs` jump, so the
reader sees the finished answer rather than a replay.

**Server rendering.** `Reveal` renders its text as ordinary markup on the server
pass, so SSR output and hydration contain the real text; the imperative renderer
only takes over after mount. A message that is already `done` on first render
appears instantly, with no animation - which is what makes rendering an existing
conversation cheap.

## Testing your own pacing

Time is injected, so anything built on this can be tested without waiting:

```ts
import { createManualClock, createSmoothStream } from 'smooth-stream-text'

const clock = createManualClock(0)
const stream = createSmoothStream({ clock })

stream.push('hello world')
stream.end()
for (let i = 0; i < 100; i++) clock.advance(16)

stream.getState() // { text: 'hello world', phase: 'done', ... }
```

## Playground

The playground is a stream simulator with adjustable speed, chunk size, jitter and
stalls, a raw-versus-smoothed comparison, live controls for every option, and a
chart of the backlog and draw rate. It is the fastest way to find settings you like:

```sh
git clone https://github.com/crmapache/smooth-stream-text
cd smooth-stream-text && npm install && npm run dev
```

## Limitations

- No markdown parsing or syntax highlighting. That is what forces heavy
  dependencies on similar packages; bring your own renderer and use `Reveal` on its
  output.
- No transport helpers. The package takes text, not connections.
- The markdown boundary scanner is a pragmatic approximation, not a CommonMark
  parser. Inline state resets at every newline, which bounds each hold to one line;
  a false positive costs a brief hold and nothing else.

## License

MIT

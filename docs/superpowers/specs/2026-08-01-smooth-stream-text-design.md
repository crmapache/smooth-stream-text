# smooth-stream-text - design

Date: 2026-08-01
Status: approved, ready for implementation planning

## 1. Problem

LLM output arrives in uneven bursts: one word, then twenty at once, then a pause.
Rendering deltas as they arrive makes the UI stutter. Two things are needed:

1. **Pacing.** Buffer incoming text and release it at a visually even rate that
   adapts itself to the producer, with a graceful finish when the stream ends.
2. **Reveal.** New text fades in left-to-right, per word, from transparent to
   visible with a slight blur and micro-shift, staggered - so text *emerges*
   rather than being typed.

Reference feel: the desktop Claude client. Reference package in the niche:
`flowtoken`.

### What flowtoken actually does (source read, v1.0.40)

No pacing at all. It splits whatever string it is handed into words and attaches
a CSS animation to each. Twenty words arriving in one chunk animate
simultaneously. Additionally: `react-markdown` + `react-syntax-highlighter` are
hard dependencies, a CSS file import is mandatory, every word stays a permanent
`<span>` (thousands of nodes on a long answer), there is no headless mode, no
`prefers-reduced-motion` handling, no hidden-tab handling, and its npm keywords
do not match how people search.

Our differentiator is the pacing controller, a headless-first API, zero runtime
dependencies, and wrappers for every popular framework.

## 2. Architecture

Four layers, each usable on its own:

```
1. Pacing core      pure logic, no DOM, no framework   ->  `.`
2. Wave timeline    shared reveal scheduler (tiny)     ->  internal
3. DOM reveal       imperative renderer, no framework  ->  `./dom`
4. Wrappers         React / Vue / Svelte / WC          ->  `./react` `./vue` `./svelte` `./web-component`
```

Every wrapper, React included, sits on the DOM reveal renderer. That is safe
because `Reveal` is a leaf over plain text: it renders a host element with no
React children, so the renderer owning that host never fights React's tree. The
result is one implementation of the wave instead of two. What React does get
natively is the pacing hooks, since those are pure state.

Layer 1 is the only layer that must run in Node (it is where all pacing tests
live). Layers 2-4 are browser-only.

## 3. Layer 1 - pacing core

### 3.1 Public API (entry `.`)

```ts
createSmoothStream(options?: PacingOptions): SmoothStream

interface SmoothStream {
  push(delta: string): void          // append a delta
  setSource(text: string): void      // or hand over the growing full string
  end(): void                        // producer closed the stream
  reset(text?: string): void         // instant, no animation (new message / regenerate)
  flush(): void                      // reveal everything right now
  getState(): SmoothState
  subscribe(listener: (s: SmoothState) => void): () => void
  destroy(): void
}

interface SmoothState {
  text: string            // the smoothed visible prefix
  cursor: number          // visible character count
  source: string          // everything received so far
  pending: number         // source.length - cursor
  phase: 'idle' | 'streaming' | 'settling' | 'done'
  charsPerSecond: number  // current controller rate (demo / debug)
}
```

`push` and `setSource` are two views of the same buffer and must be
interchangeable: feeding the same content either way produces byte-identical
output at identical times. This is a test.

Phase semantics:

- `idle` - nothing received yet.
- `streaming` - producer is open (whether or not it is currently silent).
- `settling` - draining to a stop, because `end()` was called **or** the
  producer has been silent longer than `idleGraceMs`. New input during
  `settling` returns to `streaming`.
- `done` - `end()` was called and `cursor === source.length`.

### 3.2 The controller

Every tick:

1. `desiredRate = pending / targetLatencyMs` (chars per ms). The target is a
   *constant lag behind live text*, not a fixed speed. This is what makes the
   package self-tuning: a fast producer builds a bigger backlog and is drained
   faster, a slow one is drained slower, with no per-model configuration.
2. `rate += (desiredRate - rate) * (1 - exp(-dt / adaptMs))`. Exponential
   smoothing of the *rate*, not the backlog. This is what removes the jerk: a
   20-word burst becomes a visible acceleration over ~250 ms instead of a dump.
3. Clamp to `[minCharsPerSecond, maxCharsPerSecond]`.
4. Advance a fractional cursor by `rate * dt`, carrying the remainder, so low
   rates do not lose characters to rounding.
5. Snap the integer cursor back to the nearest allowed boundary (section 4).

Finish behaviour:

- **Producer closed** (`end()`): `targetLatencyMs` decays linearly to 0 across
  `settleMs`, so the tail accelerates gently and stops. A hard deadline at
  `settleMs * 2` guarantees arrival even under pathological input.
- **Producer silent** for longer than `idleGraceMs` but not closed: same drain,
  so the display never sits holding the last three characters. Returns to
  normal pacing the moment new input arrives.
- **Backlog too large to drain sanely**: if `pending / maxCharsPerSecond`
  exceeds `maxLatencyMs`, jump straight to the end. This covers returning from a
  hidden tab and rendering an already-complete message from history.

`dt` is clamped to `maxFrameMs` (100 ms) per tick so a stalled frame does not
produce one giant jump; the leftover is caught up over subsequent ticks (or by
the `maxLatencyMs` snap).

A shrinking `source` (regeneration produced a shorter answer) is treated as an
implicit `reset`.

### 3.3 Pacing options

| Option | Default | Meaning |
|---|---|---|
| `targetLatencyMs` | 180 | how far behind live text we run |
| `adaptMs` | 250 | rate smoothing time constant |
| `minCharsPerSecond` | 12 | floor |
| `maxCharsPerSecond` | 900 | ceiling |
| `settleMs` | 400 | tail drain window after the producer closes |
| `idleGraceMs` | 200 | silence before the tail drains anyway |
| `maxLatencyMs` | 2000 | above this, snap instantly |
| `maxFrameMs` | 100 | per-tick `dt` clamp |
| `boundary` | `'markdown'` | where the cursor may stop (section 4) |
| `holdMs` | 400 | cap on how long a boundary may hold the cursor |
| `holdChars` | 120 | cap on how much text a boundary may hold back |
| `clock` | rAF clock | injected time source |

### 3.4 Injected time

```ts
interface Clock {
  now(): number
  schedule(cb: (now: number) => void): () => void  // returns cancel
}
```

Default: `requestAnimationFrame` with `performance.now`, falling back to a
`setTimeout` clock where rAF is absent. Exported alongside
`createManualClock()`, which drives time by hand (`advance(ms)`) so every pacing
test is deterministic and instant.

Hidden-tab handling: rAF stops on its own when the tab is hidden. On the next
tick the controller sees an oversized gap; combined with `maxLatencyMs` this
naturally results in "show everything" on return, and the reveal layer suppresses
the wave for that batch.

## 4. Cut boundaries

The cursor may not stop just anywhere. Three rules, in order:

### 4.1 Grapheme safety - always on, regardless of mode

Never cut inside a surrogate pair, a combining sequence, a regional-indicator
pair, or a ZWJ emoji sequence. Otherwise a broken glyph flashes for a frame.

Implemented as a bounded backward scan rather than `Intl.Segmenter`: segmenting
the whole string every frame is O(n) per tick, while the scan is O(1),
deterministic across runtimes, and enough to guarantee "never cut a visible
cluster".

### 4.2 Atomic delimiters - `'markdown'` mode

Never stop *inside* a multi-character markdown delimiter: `**`, `__`, `~~`,
```` ``` ````, `` `` ``, and the `](` join of a link. Showing a single `*` where
the source has `**` is exactly the flicker we are removing.

### 4.3 Hold-until-closed - `'markdown'` mode, capped

Hold back an unclosed **inline** construct until it closes:

- emphasis (`*`, `_`, `**`, `__`), strikethrough (`~~`)
- inline code (`` ` ``, `` `` ``)
- link / image (`[` ... `](` ... `)`)
- a line-leading block marker (`#`, `-`, `*`, `+`, `1.`, `>`, `|`) until the
  marker plus its first content character are all available
- a table row (line starting with `|`) until its newline

**Never** applied to fenced code blocks - only the fence marker itself is atomic,
the body flows freely. Holding a fence to its closer would stall the stream for
thousands of characters.

Two safety valves, enforced by the engine rather than by the boundary function:
if a hold has lasted longer than `holdMs` or is withholding more than
`holdChars` characters, the boundary is ignored for that tick and the text is
released. A slightly literal `**` beats a frozen stream.

When the producer is closed and the desired cut is the end of the source, all
holds are released - nothing more is coming.

### 4.4 Modes

```ts
type BoundaryMode = 'char' | 'word' | 'markdown' | BoundaryFn
type BoundaryFn = (source: string, desired: number, closed: boolean) => number
```

A `BoundaryFn` returns the largest allowed index `<= desired`. It stays pure; the
hold caps live in the engine. Default `'markdown'`.

## 5. Layer 2 - wave timeline

A tiny scheduler shared by the DOM and React reveal implementations. It owns one
number: the timestamp of the next free stagger slot.

- `claim(n)` returns `n` start timestamps: each is `max(now, nextSlot)`, and
  `nextSlot` advances by `staggerMs` per word.
- Because the slot is global, the wave stays continuous across chunk and
  paragraph boundaries even though no component knows its position in the
  overall text.
- If `nextSlot - now` exceeds `maxWaveLagMs`, the stagger is compressed so a
  large batch cannot queue up a multi-second wave.
- After a gap of silence, `now` wins and the queue self-heals.
- `reset()` clears the queue (new message).

It also resolves `prefers-reduced-motion` once (with a change listener) and owns
the one-time stylesheet injection.

**Key insight:** with a good pacing controller, roughly 0-2 words arrive per
frame, so the wave comes from the pacing itself. The stagger is a garnish
(~36 ms) that only matters for genuine batches (tab return, dropped frames).
flowtoken needs a large stagger precisely because it has no pacing.

## 6. Layer 3 - DOM reveal (entry `./dom`)

```ts
createSmoothText(el: HTMLElement, options?: SmoothTextOptions): SmoothTextHandle
createReveal(el: HTMLElement, options?: RevealOptions): RevealHandle

interface SmoothTextHandle {
  push(delta: string): void
  setText(text: string): void
  end(): void
  reset(text?: string): void
  flush(): void
  setOptions(next: Partial<SmoothTextOptions>): void
  destroy(): void
  readonly state: SmoothState
}

interface RevealHandle {
  update(fullVisibleText: string): void   // diffing is internal
  flush(): void
  reset(text?: string): void
  destroy(): void
}

type SmoothTextOptions = PacingOptions & RevealOptions
```

`createSmoothText` is pacing + reveal wired together - the one-liner for vanilla
users. `createReveal` is the reveal alone, for consumers who already have their
own pacing.

### 6.1 Rendering strategy

The element holds a plain text node for settled text, followed by one `<span>`
per currently-animating word. When a word's animation window ends
(`durationMs` after its slot), a single per-batch timer merges it back into the
settled text node.

This is the differentiator over flowtoken: the DOM stays flat (roughly ten spans
at any time, not thousands), and selection and copy over finished text are
exactly plain-text clean.

Word spans use `display: inline-block` (required for `transform`) with
`white-space: pre-wrap`. If `translatePx` is 0 the span stays `display: inline`,
since opacity and blur both work on inline boxes - this is the zero-layout-risk
configuration.

### 6.2 Styles

One `<style data-smooth-stream-text>` element injected once on first use
(`injectStyles: false` to opt out). It defines two keyframes and a `.sst-word`
class; every visual parameter is a CSS custom property set on the host, so
consumers can restyle entirely from their own CSS without touching JS. No CSS
file import is ever required.

`prefers-reduced-motion: reduce` disables wrapping altogether: plain text, no
spans, no animation.

### 6.3 Reveal options

| Option | Default | Meaning |
|---|---|---|
| `unit` | `'word'` | reveal granularity, `'word'` or `'char'` |
| `durationMs` | 380 | per-word animation length |
| `staggerMs` | 36 | delay between neighbouring words |
| `blurPx` | 4 | starting blur |
| `translatePx` | 3 | starting upward shift |
| `easing` | `cubic-bezier(.22,.61,.36,1)` | timing function |
| `maxWaveLagMs` | 240 | compress the stagger past this queue depth |
| `respectReducedMotion` | `true` | |
| `injectStyles` | `true` | |
| `className` | - | extra class on word spans |

## 7. Layer 4 - framework wrappers

### 7.1 React (`./react`)

```tsx
// headless - the primary path
useSmoothStream(source: string, options?: PacingOptions & { done?: boolean })
  : SmoothState & { flush(): void; reset(text?: string): void }

// headless, push style
useSmoothStreamController(options?: PacingOptions)
  : SmoothState & { push(d: string): void; end(): void; flush(): void; reset(t?: string): void }

// wave over your own markup
<RevealProvider {...RevealOptions} resetKey?={string | number}>
<Reveal offset?={number} as?={ElementType} className?={string}>{chunk}</Reveal>
useReveal(): RevealApi

// batteries included
<SmoothText text done? as? className? {...PacingOptions} {...RevealOptions} />
```

`Reveal` is a leaf over plain text, so it renders a host element and lets the
imperative renderer from section 6 own that host's children. React never manages
those children, so there is no conflict - and React and every other framework end
up sharing one implementation of the wave.

Two rules give the remount-safety that design review asked for, without the
`offset` prop that was originally sketched:

- **Mounting seeds, it does not animate.** A freshly created handle treats the
  text it is given as already settled. So when the markdown parser recreates a
  node, the remounted `Reveal` shows its text instantly rather than replaying it.
- **A non-extension is a silent reseed.** If the new text is not an extension of
  the current text - the parser re-split a paragraph, or moved text between
  chunks - the renderer reseeds instead of animating text that was already
  visible.

Before mount (server render and the first client pass) `Reveal` renders its text
as ordinary React children, so SSR output and hydration contain the real text.

`RevealProvider` supplies options, the shared wave timeline and the resolved
reduced-motion decision. `resetKey` clears the wave when a new message starts.

`useSmoothStream` handles the history case: when `done` is already `true` on the
first render, the stream starts fully revealed with no animation. This is what
makes re-rendering an existing conversation instant instead of replaying every
message.

`SmoothText` takes an `onSettled` callback for the common "enable the action
buttons once the answer has finished appearing" need; the hooks expose `phase`
for the same purpose.

The provider is intentionally decoupled from the smoother: the panel takes the
smoothed string from `useSmoothStream`, parses it as it already does, and wraps
its own text pieces in `Reveal`.

There is deliberately **no** markdown component. That is what forces flowtoken's
heavy dependencies, and the primary consumer parses markdown itself.

### 7.2 Vue (`./vue`)

```ts
useSmoothStream(source: Ref<string> | (() => string), options?)  // composable, returns refs
SmoothText   // defineComponent, wraps createSmoothText on a host element
Reveal       // defineComponent, wraps createReveal for own markup
```

Built with `defineComponent` + `h()`, no SFC, so tsup compiles it directly.

### 7.3 Svelte (`./svelte`)

```ts
smoothText(node, options)   // action: use:smoothText={{ text, done, ...opts }}
reveal(node, { text })      // action, for own markup
smoothStream(options)       // store factory: { subscribe, push, setSource, end, flush, reset, destroy }
```

Plain actions and a plain store contract (an object with `subscribe`) - **zero
Svelte runtime dependency**, nothing to compile.

### 7.4 Web component (`./web-component`)

```html
<smooth-stream-text text="..." done unit="word" duration="380"></smooth-stream-text>
```

Attributes for scalars (`text`, `done`, `unit`, `duration`, `stagger`, `blur`,
`translate`, `target-latency`, `min-cps`, `max-cps`, `boundary`); properties for
objects (`options`); methods `push`, `end`, `flush`, `reset`; a `sst:done` event
when the tail finishes. `defineSmoothStreamTextElement(tag?)` registers it and
auto-runs on import (this entry is the package's only side effect).

This single element covers Angular, Solid, Qwik, Astro and plain HTML.

## 8. Package shape

```
name         smooth-stream-text
version      0.1.0
author       Maksim Zolotoi
license      MIT
repository   github.com/crmapache/smooth-stream-text
homepage     smooth-stream-text.vercel.app  (live playground; deploy is a
             separate, explicitly confirmed step - the field is only filled in
             once the deployment exists)
sideEffects  ["**/web-component/**"]
```

Exports: `.`, `./dom`, `./react`, `./vue`, `./svelte`, `./web-component`,
`./package.json`. The root entry ships ESM + CJS (it can run in Node); every
other entry is ESM-only, since their consumers are always bundler-based.
`typesVersions` mirrors the export map for older resolvers.

Peer dependencies: `react >=18` and `vue >=3`, both **optional**, so no consumer
pulls in a framework they do not use. Runtime dependencies: none.

npm keywords aimed at real searches: `streaming-text`, `smooth-streaming`,
`stream-text`, `llm`, `llm-ui`, `ai-chat-ui`, `ai-ui`, `typewriter`,
`text-reveal`, `streaming-markdown`, `token-streaming`, `headless`, `react`,
`vue`, `svelte`, `web-component`, `animation`.

Tooling mirrors prosody-mask: tsup (two build groups), vitest, TypeScript strict,
ESLint flat config, Prettier (no semicolons, single quotes, width 120).

## 9. Testing

Layer 1, environment `node`, manual clock - no waiting, fully deterministic:

1. Steady stream - lag stays near `targetLatencyMs`.
2. Bursty stream - rate rises smoothly, no single-tick dump.
3. Long mid-stream pause - the tail finishes and stops, no leftover stub.
4. Producer closes - arrives within the settle window, and by the hard deadline
   in the worst case.
5. Producer abandoned without `end()` - stays `streaming`, buffer still drained.
6. `flush()` - everything immediately, phase correct.
7. `reset()` - clean restart, no animation carry-over.
8. Huge dump / `maxLatencyMs` - snaps instead of crawling.
9. Rate clamps - never below min, never above max.
10. Boundaries - grapheme safety, atomic delimiters, hold-until-closed, both
    caps releasing, fenced code never held, `'char'` and `'word'` modes, custom
    function.
11. `push` and `setSource` produce identical output at identical times.
12. Idempotent `setSource` with an unchanged string.
13. Shrinking source behaves as a reset.

Layer 3 and 4, environment `jsdom`:

- reveal wraps only new words; settled words collapse back into a text node
- `textContent` always equals the visible prefix exactly (copy safety)
- reduced motion produces no spans at all
- wave timeline: continuity across chunks, stagger compression under load
- one wrapper test per framework (React, Vue, Svelte action, custom element)

## 10. Playground

Vanilla TypeScript + Vite, consuming `src/dom` through an alias so it always
previews the working tree (same arrangement as prosody-mask).

- Two columns: raw stream exactly as received vs smoothed with the wave.
- Stream simulator: base rate, burst-size jitter, pause probability, pause
  length, chunk size, plus a canned markdown sample to exercise the boundary
  rules.
- Live sliders for every package option.
- A small chart of current lag and current rate, so the controller can be tuned
  by eye instead of by guesswork.
- Deployable to Vercel as a static site (`vercel.json`, same as prosody-mask).

This is the primary tuning instrument; the defaults in this document are
starting points to be adjusted there.

## 11. README

English. Hero image and a demo GIF recorded from the playground, live playground
link, npm / bundle-size / license badges. Honest examples for both paths -
headless (take the smoothed string, render it yourself) and the ready-made
component - plus one snippet per framework, and full option tables.

The GIF is captured by driving the playground with a headless browser and
assembling the frames with ffmpeg. If ffmpeg is unavailable the fallback is a
static hero screenshot plus the live playground link; the README must never
reference an asset that was not actually produced.

## 12. Out of scope

- No markdown parsing or syntax highlighting (that is flowtoken's dependency
  trap).
- No streaming transport helpers (SSE / fetch parsing) - the package takes text,
  not connections.
- No virtualisation or scroll management.

<!-- Generated from website/api.md by scripts/build-skill.mjs. Edit the docs page, not this file. -->

# API reference

> Complete API reference for smooth-stream-text 0.2 - entry points, the headless core, pacing and reveal options with defaults, the DOM handle, React hooks and components, Vue, Svelte and the Web Component.
>
> smooth-stream-text 0.2.2. HTML version: https://smooth-stream-text.vercel.app/docs/api

This page documents version 0.2.2, the current release on npm.

## Entry points

| Import | Contains | Needs |
| --- | --- | --- |
| `smooth-stream-text` | The core: pacing, clocks, boundaries, source sync | Nothing. No DOM, runs in Node 18+ |
| `smooth-stream-text/dom` | The reveal and the DOM handle, plus everything from the root | A DOM |
| `smooth-stream-text/react` | Hooks and components, plus the DOM and root exports | React 18 or 19 |
| `smooth-stream-text/vue` | Composable and components, plus the DOM and root exports | Vue 3.2+ |
| `smooth-stream-text/svelte` | Store and actions, plus the DOM and root exports | Nothing from Svelte is imported |
| `smooth-stream-text/web-component` | `<smooth-stream-text>`, plus the DOM and root exports | Custom elements |
| `smooth-stream-text/styles.css` | The reveal stylesheet, for `injectStyles: false` | |

Every entry ships ES modules, CommonJS and type declarations. The React entry starts
with `'use client'`. Importing the Web Component entry on a server does not throw.

Positions, lengths and rates count **UTF-16 code units**, the way JavaScript string
lengths do, not visible characters or tokens.

## Core

```ts
import { createSmoothStream } from 'smooth-stream-text'

const stream = createSmoothStream({ targetLatencyMs: 150 })
```

### createSmoothStream(options?): SmoothStream

Creates one stream. A stream can serve any number of answers: `end()` closes the
current answer, and text that arrives later reopens it.

| Method | What it does |
| --- | --- |
| `push(delta)` | Appends a delta. |
| `setSource(text)` | Hands over the growing full text. Text that does not start with the current source counts as a new answer and starts over. |
| `end()` | The producer closed the answer: the tail drains and the phase reaches `done`. |
| `reset(text?)` | Starts over. With `text`, starts with it fully visible. For finished history, follow with `end()`, or the phase stays open until text arrives. |
| `flush()` | Shows everything received so far, at once. Later input is paced again. |
| `pause()` | Stops drawing without losing anything. Input may still arrive and waits in the buffer. |
| `resume()` | Draws again from where it stopped. |
| `setOptions(partial)` | Changes settings at runtime. A key passed as `undefined` returns to its default. `clock` is fixed at creation. |
| `getState()` | The current `SmoothState`. |
| `subscribe(listener)` | Calls `listener(state)` on every change. Returns an unsubscribe function. |
| `destroy()` | Releases the stream for good. Later calls do nothing. |

`push` and `setSource` are interchangeable; use whichever your transport gives you.

### SmoothState

| Field | Type | Meaning |
| --- | --- | --- |
| `text` | `string` | The visible prefix. Render this. |
| `cursor` | `number` | How much of `source` is visible. |
| `source` | `string` | Everything received for the current answer. |
| `pending` | `number` | `source.length - cursor`. |
| `phase` | `StreamPhase` | `'idle'`, `'streaming'`, `'settling'` or `'done'`. |
| `charsPerSecond` | `number` | The controller's current rate. |

`settling` means the producer has stopped (closed, or silent past `idleGraceMs`) and
the tail is draining. `done` means the answer is closed and fully visible.

### Pacing options

| Option | Default | Meaning |
| --- | --- | --- |
| `targetLatencyMs` | `180` | How far behind the live text the display runs, in ms. The main feel setting. |
| `adaptMs` | `250` | Time constant for smoothing the rate. Larger means lazier acceleration; `0` means none. |
| `minCharsPerSecond` | `12` | Floor on the rate; `0` means none. |
| `maxCharsPerSecond` | `900` | Ceiling on the rate. Keeps a burst from being dumped at once. |
| `settleMs` | `400` | How long the tail takes to drain once the producer stops. The hard deadline is twice this. |
| `idleGraceMs` | `200` | Silence tolerated on an open stream before the tail drains anyway. |
| `maxLatencyMs` | `2000` | Above this projected lag the display jumps instead of catching up. |
| `maxFrameMs` | `100` | Per-tick clamp on elapsed time, so one stalled frame cannot cause a jump. |
| `boundary` | `'markdown'` | Where the visible text may end: `'markdown'`, `'char'`, `'word'` or a function. See [text boundaries](https://smooth-stream-text.vercel.app/docs/concepts/text-boundaries.md). |
| `unit` | `'char'` | `'char'` or `'word'`: what appears as one piece. The reveal reads the same key. |
| `holdMs` | `1500` | How long the producer must be silent before a held construct or a half-arrived word is released. |
| `holdChars` | `120` | Most characters a boundary may hold back before releasing them anyway. |
| `clock` | rAF | The time source. `requestAnimationFrame` where it exists, a 16 ms timer otherwise. |

A value that cannot work (`NaN`, a ceiling of zero or below, a floor above the
ceiling) falls back to its default or is clamped, so the stream never freezes.
`resolvePacingOptions(options)` returns the full, checked set; `defaultPacing` holds
the defaults.

### Clocks and testing

`createManualClock(startMs?)` returns a clock you advance by hand, so pacing can be
tested without waiting:

```ts
import { createManualClock, createSmoothStream } from 'smooth-stream-text'

const clock = createManualClock(0)
const stream = createSmoothStream({ clock })
stream.push('hello world')
stream.end()
for (let i = 0; i < 100; i++) clock.advance(16)
stream.getState().text // 'hello world'
```

A `Clock` is `{ now(): number; schedule(callback): cancel }`. `defaultClock` is the
built-in one. `ManualClock` adds `advance(ms)` and `setNow(ms)`.

### createSourceSync(target)

The rule every binding uses to turn a `(text, done)` pair, as a component receives it
on each render, into stream calls. `apply(text, done)`:

- the first pair that is already done is history: `reset(text)` and `end()`;
- text that continues the source is handed over and paced; `done` closes the answer,
  including when a chunk arrives after `done` was set;
- text that replaces the source is shown at once if done, or paced from the start if
  not.

Use it when you write a binding for another framework. `SyncTarget` is the shape it
drives: `getState`, `setSource`, `reset` and `end`.

### Lower-level helpers

These are exported for custom pipelines and are what the stream itself uses.

| Export | Purpose |
| --- | --- |
| `createBoundaryResolver(mode, unit?)` | Returns `{ resolve(source, desired, closed, quiet?), reset() }`, the largest allowed cut at or before `desired`. |
| `clampToGraphemeBoundary(text, index)` | Moves an index back to the nearest grapheme cluster boundary. |
| `createPacerState(options, cursor?)`, `stepPacer(state, input, options)`, `effectiveTargetLatency(input, options)` | The rate controller, one tick at a time. |

Types: `BoundaryFn`, `BoundaryMode`, `BoundaryResolver`, `TextUnit`, `PacerInput`,
`PacerState`, `SourceSync`, `SyncTarget`, `Clock`, `ManualClock`, `PacingOptions`,
`ResolvedPacing`, `SmoothState`, `SmoothStream`, `StreamPhase`.

## Reveal options

The reveal fades newly visible text in. It is used by `SmoothText`, `Reveal`,
`createSmoothText`, `createReveal` and the Web Component.

| Option | Default | Meaning |
| --- | --- | --- |
| `unit` | `'char'` | What animates as one unit: `'char'` or `'word'`. Shared with pacing. |
| `durationMs` | `380` | How long one unit takes to appear. |
| `staggerMs` | `36` | Delay between neighbouring units of one batch. |
| `blurPx` | `4` | Starting blur. |
| `translatePx` | `3` | Starting upward shift. `0` keeps units `display: inline`, with no layout impact. |
| `easing` | `cubic-bezier(.22,.61,.36,1)` | Timing function. |
| `maxWaveLagMs` | `240` | Above this queue depth the stagger compresses, so a batch cannot queue a long wave. |
| `maxAnimatedUnits` | `64` | Most units one update animates. Anything before them in a bigger batch appears at once. |
| `respectReducedMotion` | `true` | Under `prefers-reduced-motion` no spans are created at all. `false` animates anyway. |
| `injectStyles` | `true` | `false` skips the built-in stylesheet; import `smooth-stream-text/styles.css` or copy `REVEAL_CSS` instead. |
| `className` | | Extra class on every animating unit. |

The stylesheet is a constructed stylesheet in the cascade layer `smooth-stream-text`,
adopted by the document or the shadow root the element is in, so a Content Security
Policy without `'unsafe-inline'` does not block it and any rule of yours wins.
Visual settings are CSS custom properties on the host: `--sst-duration`, `--sst-blur`,
`--sst-translate`, `--sst-easing`.

## DOM

```ts
import { createSmoothText, createReveal } from 'smooth-stream-text/dom'
```

### createSmoothText(element, options?): SmoothTextHandle

Pacing and reveal in one element, for plain text. The handle owns the element's
children; give it an element with no other content. `options` takes pacing options,
reveal options, a shared `timeline`, a `clock` and `initialText`.

| Member | What it does |
| --- | --- |
| `push(delta)`, `setText(text)` | Hand over a delta, or the full growing text. |
| `end()` | Closes the current answer. |
| `reset(text?)` | Starts over, with `text` already fully shown. |
| `flush()` | Shows everything received, at once. |
| `pause()`, `resume()` | Stop and continue drawing, for an element that is hidden or detached. |
| `setOptions(partial)` | Changes pacing or reveal settings at runtime. |
| `subscribe(listener)` | The pacing state on every change. |
| `onSettled(listener)` | Called once per answer when it is closed, fully paced and no unit is still animating. Returns an unsubscribe function. |
| `settled` | Whether the current answer is completely on screen. |
| `state` | The current pacing state. |
| `destroy()` | Releases everything. The text stays on screen. |

### createReveal(element, options?): RevealHandle

The reveal alone, for text you pace yourself. `update(fullVisibleText)` hands over
the whole visible text; the diff against what is shown is computed inside, and only
appended text animates. Also `flush()`, `reset(text?)`, `setOptions(partial)`,
`animating`, `onIdle(listener)` and `destroy()`.

`createWaveTimeline(options)` creates a timeline that several reveals can share, so
the stagger stays continuous across paragraphs. Pass it as `timeline`.

Also exported: `defaultReveal`, `resolveRevealOptions`, `splitPieces`, `REVEAL_CSS`,
`WORD_CLASS` (`'sst-word'`), `FLAT_CLASS` (`'sst-flat'`), `FORCE_MOTION_CLASS`
(`'sst-motion'`), `ensureStyles(target)`, `applyRevealVars(element, options)`,
`prefersReducedMotion()`, and the types `Piece`, `ResolvedReveal`, `RevealDeps`,
`RevealHandle`, `RevealOptions`, `WaveTimeline`, `SmoothTextHandle`,
`SmoothTextOptions`.

## React

```ts
import { useSmoothText, useSmoothStream, useSmoothStreamController, SmoothText, Reveal, RevealProvider, useReveal } from 'smooth-stream-text/react'
```

| Export | Signature | Returns |
| --- | --- | --- |
| `useSmoothText` | `(source, options?: PacingOptions & { done?: boolean })` | `{ text, phase, flush, reset, setOptions }`. Re-renders only when `text` or `phase` changes. |
| `useSmoothStream` | same | The full `SmoothState` plus `flush`, `reset`, `setOptions`. |
| `useSmoothStreamController` | `(options?: PacingOptions)` | The full state plus `push`, `setSource`, `end`, `flush`, `reset`, `setOptions`. |
| `SmoothText` | props: `text`, `done?`, `as?`, `className?`, `unitClassName?`, `onSettled?`, every pacing and reveal option, any HTML attribute | A host element that paces and reveals its text. |
| `RevealProvider` | props: every reveal option, `resetKey?` | Shares one wave timeline with the `Reveal`s below it. Renders no DOM. |
| `Reveal` | props: `children: string`, `as?`, `initialText?`, any HTML attribute | Animates appended text in its host element. |
| `useReveal` | `()` | The surrounding provider's `{ options, timeline }`. |

Types: `SmoothStreamControls`, `SmoothStreamController`, `SmoothTextState`,
`SmoothTextProps`, `RevealProps`, `RevealProviderProps`, `RevealContextValue`.
The React entry also re-exports everything from the DOM and root entries.

## Vue

```ts
import { useSmoothStream, SmoothText, Reveal, RevealProvider } from 'smooth-stream-text/vue'
```

| Export | Signature | Returns |
| --- | --- | --- |
| `useSmoothStream` | `(source: Ref<string> \| (() => string), options?: PacingOptions & { done?: Ref<boolean> \| (() => boolean) \| boolean })` | `{ state, text, phase, flush, reset, pause, resume, setOptions }`; `text` and `phase` are computed refs. |
| `SmoothText` | props: `text`, `done`, `as` (default `'div'`), `className`, `options`; emits `settled` | Paces and reveals plain text. Also the default export. |
| `RevealProvider` | props: `options`, `resetKey` | Shares one wave with the `Reveal`s in its slot. |
| `Reveal` | props: `text`, `as` (default `'span'`), `className`, `options` | Animates appended text. |

Pacing starts once the component is mounted, so server rendering schedules nothing;
text that is already done is in the server output. Inside `<KeepAlive>` everything
pauses while deactivated. The Vue entry re-exports the DOM and root entries.

## Svelte

```ts
import { smoothStream, smoothText, reveal } from 'smooth-stream-text/svelte'
```

| Export | Kind | What it does |
| --- | --- | --- |
| `smoothStream(options?)` | readable store of `SmoothState` | Adds `apply(text, done)`, `push`, `setSource`, `end`, `flush`, `reset`, `pause`, `resume`, `setOptions`, `destroy`. |
| `smoothText` | action | `use:smoothText={{ text, done, onSettled, ...options }}` paces and reveals into the element. |
| `reveal` | action | `use:reveal={{ text, ...revealOptions }}` animates appended text in the element. |

Nothing is imported from Svelte, so these work in Svelte 4 and 5. Actions do not run
on the server. Types: `SvelteAction`, `SmoothTextActionOptions`,
`RevealActionOptions`, `SmoothStreamStore`.

## Web Component

```ts
import 'smooth-stream-text/web-component'
```

Importing the module defines `<smooth-stream-text>`. `defineSmoothStreamTextElement(tag?)`
defines it under another name; `SmoothStreamTextElement` is the class.

| Attribute | Option |
| --- | --- |
| `text` | the text (also a property) |
| `done` | closes the answer (also a property) |
| `unit` | `unit` |
| `duration` | `durationMs` |
| `stagger` | `staggerMs` |
| `blur` | `blurPx` |
| `translate` | `translatePx` |
| `target-latency` | `targetLatencyMs` |
| `min-cps` | `minCharsPerSecond` |
| `max-cps` | `maxCharsPerSecond` |
| `boundary` | `boundary` |

Properties: `text`, `done`, `options` (any pacing or reveal option; removing an
attribute brings back the option or default underneath it) and the read-only `state`.
Methods: `push(delta)`, `end()`, `flush()`, `reset(text?)`.

The element dispatches `sst:done` (bubbling) once per answer, when it is completely on
screen. The stream belongs to the element: moving it or taking it out of the page and
back pauses and resumes it, and text pushed before the element is connected is kept.

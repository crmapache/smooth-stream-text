<!-- Generated from website/concepts/latency.md by scripts/build-skill.mjs. Edit the docs page, not this file. -->

# Latency and completion

> What pacing costs in time, how the tail of an answer drains, the difference between transport done, pacing done and reveal settled, background tabs, Show all, and why two smoothing layers add up.
>
> smooth-stream-text 0.2.2. HTML version: https://smooth-stream-text.vercel.app/docs/concepts/latency

Pacing trades a small, steady delay for an even flow. This page explains where that
delay comes from, how long the end of an answer takes, and how to control both.
The [benchmarks](https://smooth-stream-text.vercel.app/docs/benchmarks.md) put numbers on it for recorded streams.

## How the rate is chosen

Every frame the controller computes the rate that would drain the current backlog
over the target latency, then eases the actual rate towards it:

```ts
const desired = pending / targetLatencyMs
const alpha = 1 - Math.exp(-dt / adaptMs)
rate += (desired - rate) * alpha
```

So the display runs roughly `targetLatencyMs` (180 ms by default) behind the text
that has arrived. A fast producer builds a bigger backlog and is drained faster; a
slow one is drained slower. A twenty-word burst becomes a short acceleration rather
than a wall of text, because the rate is smoothed, not the backlog. The rate is held
between `minCharsPerSecond` (12) and `maxCharsPerSecond` (900).

Pacing never makes the model faster. It decides how much of what already arrived is
visible.

## Three different "done"s

| Moment | Who knows | What it means |
| --- | --- | --- |
| Transport done | Your code | The last chunk has arrived. Pass `done: true` (or call `end()`). |
| Pacing done | `phase === 'done'` | All received text is visible. |
| Reveal settled | `onSettled`, `settled`, `sst:done` | The last unit has finished its fade-in. Only with the reveal. |

They happen in that order, a little apart. Show copy buttons or the next prompt on
pacing done when you render text yourself, or on settled when you use `SmoothText`,
`createSmoothText` or the Web Component.

## The tail

When the transport closes the answer, the target latency decays to zero over
`settleMs` (400 ms), so the tail accelerates into a stop instead of crawling the last
few words. An answer is complete at most twice `settleMs` after it was closed; past
that deadline the rest is shown at once.

The same happens on a stream that is still open but silent: after `idleGraceMs`
(200 ms) without input the tail drains, so text never sits waiting for a chunk that
is slow to come. When input resumes, pacing resumes.

`done` may be set before the last chunk arrives. That chunk is still shown and paced,
then the answer closes again.

## Big backlogs jump

If the backlog could not be drawn within `maxLatencyMs` (2000 ms) even at the
maximum rate, the display jumps to the end instead of catching up slowly. This covers
two common cases:

- A whole message handed over at once, for example a cached answer.
- A background tab that was away long enough. Browsers stop `requestAnimationFrame`
  in hidden tabs. When the reader comes back, a backlog of more than about 1,800
  characters (two seconds at 900 per second) jumps to the end; a smaller one is caught
  up at the maximum rate, which takes at most two seconds. With the reveal, only the
  last `maxAnimatedUnits` (64) units of a big batch animate.

## Show all

`flush()` shows everything received so far, at once. On a stream that is still open,
text that arrives afterwards is paced again. If a "Show all" button should remove the
delay for the rest of the answer, flush on every new chunk until the answer ends; the
[React guide](https://smooth-stream-text.vercel.app/docs/react.md#show-all) has the pattern.

## Two smoothing layers add up

Server-side smoothing such as the AI SDK's `smoothStream()` delays chunks before they
leave the server. Client-side pacing then holds the display behind what arrives. With
both, the reader waits for both. Pick one layer. The [comparison](https://smooth-stream-text.vercel.app/docs/comparisons.md) helps
decide which.

## Tuning

- Snappier: lower `targetLatencyMs` (for example 100). Bursts are then less smooth.
- Smoother: raise `targetLatencyMs` (for example 250) or `adaptMs`.
- Whole words instead of characters: `unit: 'word'`.
- Faster tail: lower `settleMs`.

Every option can change at runtime with `setOptions`, or as new props in React and
Vue. `useSmoothStream` (React) and `subscribe` (core) expose `pending` and
`charsPerSecond` if you want to watch the controller work; the
[playground](https://smooth-stream-text.vercel.app) charts both live.

---
title: Benchmarks
description: Reproducible measurements of what smooth-stream-text costs and changes - latency, evenness, broken text, rendering work and bundle size - on recorded and synthetic LLM streams, next to rendering as received, fixed-rate typing and the AI SDK's smoothStream().
---

# Benchmarks

What pacing costs and what it changes, measured on the same streams for every
approach. The code, the streams and the raw results are in
[`benchmarks/`](https://github.com/crmapache/smooth-stream-text/tree/main/benchmarks)
in the repository; the tables below are generated from those results.

## Method

**Streams.** Two answers were recorded from a real model (Claude, through Claude
Code's streaming output) with the time each chunk reached the client. Nine synthetic
scenarios reuse the recorded text with arrival patterns chosen to stress one thing
each: steady, bursty, a long stall, a fast model, a final burst, a long answer,
chunks cut inside emoji and surrogate pairs, chunks cut inside Markdown constructs,
and a hidden tab. They are generated from fixed seeds, so every run sees the same
streams.

**Approaches.**

- *as received*: every chunk is shown the moment it arrives.
- *fixed 60 cps* and *fixed 240 cps*: a hand-written typing effect, a timer that shows
  one more character of `text.slice(0, count)` at a constant rate.
- *AI SDK smoothStream()*: the real transform from `ai` 7.0, with its defaults (word
  chunks, 10 ms delay), and once with `Intl.Segmenter` word chunks as its docs suggest
  for languages without spaces. It is run on the stream before it reaches the client.
- *smooth-stream-text*: the core with default settings, and with `boundary: 'char'`
  and `unit: 'word'` to show what those settings change.
- *smoothStream() then smooth-stream-text*: both layers stacked.

**Pacing metrics** are measured in virtual time on a 60 Hz frame clock, so they are
exact and repeatable: when each character becomes visible, how evenly the text grows,
how long the end takes, and whether any frame shows text a renderer would draw wrongly.
Lag and the size of a character are counted in UTF-16 code units, like JavaScript
strings. **Rendering cost** is measured separately, in headless Chromium, replaying
streams in real time and rendering Markdown with marked. **Bundle size** is measured
with esbuild, per import.

## What the numbers say

The cost is a steady delay. With the defaults, the first text appeared 0.08 to 0.15 s
after the first chunk of the recorded answers, and half the characters were shown
within about 0.2 s of arriving. That is the `targetLatencyMs` of 180 ms at work. After
the stream closed, the rest drained within a second in every scenario.

On the two recorded answers, text grows more evenly than as received: the evenness
figure (lower is better) falls by 40 to 55 percent, and the largest amount of text
appearing in a single frame drops, from 186 to 105 characters on one answer and from
225 to 16 on the other. The largest remaining step on the English answer is a
table row, which the Markdown rules hold until its line is complete.

No frame across all eleven streams ended inside a grapheme cluster. One frame ended
inside an open Markdown construct: after the three-second stall, the `holdMs` safety
valve released a held construct, as it is designed to. Rendering as received produced
hundreds of such frames, and so did fixed-rate typing.

Pacing does not hide long network pauses. In the bursty scenario, where nothing
arrives for up to 0.9 s, the reader still sees most of those pauses: once the backlog
has drained, there is nothing left to show. A fixed slow rate hides them better, at
the price of falling far behind.

Above 900 characters per second, the default ceiling, the display falls behind and
then jumps (the fast scenario). Raise `maxCharsPerSecond` if your model is faster.

The Markdown rules cost some evenness. With `boundary: 'char'` the text grows more
evenly, but frames with broken syntax appear. The default favours intact syntax.

The AI SDK's `smoothStream()` evens out the recorded English answer about as well, with
less lag. With its default word chunks, text in Chinese or Japanese waits for the next
space, so the multilingual answer showed nothing for 0.8 s. With `Intl.Segmenter`
chunks, one segment per 10 ms fell behind on every stream, by up to several seconds. It also
produced frames with broken Markdown. Its rows here assume its output reaches the
browser exactly as it leaves the transform; in practice it crosses the network again,
which can bunch chunks back together.

Fixed-rate typing falls behind real model output by seconds at 240 characters per
second and by tens of seconds at 60.

Rendering is the main runtime cost. A paced answer changes on every frame while it
appears, so a Markdown renderer runs up to 60 times a second: about twice as often as
rendering once per chunk on the recorded answer, and more total rendering time.
`unit: 'word'` changes the text less often. With the reveal, the spans still animating
peak at a few hundred on a fast stream and are gone once the answer settles.

These benchmarks found a bug: after a pause inside a held construct, the next chunk
appeared all at once. It is fixed in 0.2.1 (see the [changelog](/changelog)), and the
results below include the fix.

## Results

<!--@include: ../benchmarks/results/summary.md-->

## Limits of this benchmark

- Two recorded answers from one model and one network path. Other providers and
  networks produce other rhythms. Record your own with
  `node scripts/record-claude-trace.mjs` or write a trace file by hand.
- Synthetic scenarios are designed, not sampled from traffic. Use them to see how an
  approach reacts to a pattern, not as typical numbers.
- "Broken Markdown" is a heuristic on the last visible line (unclosed inline code,
  emphasis, strikethrough or link). It does not run a full parser.
- Browser numbers depend on the machine. Compare rows from the same run.
- Pacing runs in virtual time: it measures the controller, not timer jitter in a busy
  page.

## Reproduce

```sh
git clone https://github.com/crmapache/smooth-stream-text
cd smooth-stream-text && npm install && npm run build
cd benchmarks && npm install
npm run traces     # rebuilds the synthetic streams from fixed seeds
npm run bench      # pacing, browser, size, then results/summary.md
```

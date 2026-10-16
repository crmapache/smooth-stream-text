---
title: Choosing an approach
description: Server-side transforms, renderers with built-in animation, React output libraries, other pacing controllers and a hook of your own, compared by what each one controls, so you can decide whether you need smooth-stream-text at all.
---

# Choosing an approach

Several tools make streamed text look calmer, and they work at different layers.
This page compares them by what each one controls and where it runs, so you can pick
the layer that fits your app. In several cases the right answer is not this package.

This page is written by the author of smooth-stream-text. Facts about other projects
come from their own documentation and npm metadata for the versions listed, checked
on 16 October 2026. It says what each tool is documented to do and does not claim a
tool lacks something unless that was checked in its source. If something here is
wrong or out of date, please [open an issue](https://github.com/crmapache/smooth-stream-text/issues).

## The layers

| Layer | What it controls | Examples |
| --- | --- | --- |
| Server transform | The chunks that leave the server and the delay between them | AI SDK `smoothStream()` |
| Renderer with animation | How newly rendered words look as they mount | Streamdown `animated`, FlowToken |
| Markdown repair | Closing unfinished Markdown so a partial answer renders cleanly | remend |
| Output library | Parsing, throttling and rendering of LLM output in one package | llm-ui |
| Client pacing controller | How much of the received text is visible at each moment | smooth-stream-text, markstream-core, falconstream, use-smooth-text |
| Your own hook | Whatever you write | a timer and a slice |

Pacing and animation are different jobs. A renderer's animation decides how a word
appears once it is rendered; a pacing controller decides when it is rendered. They
combine well when exactly one layer animates.

## The tools

### AI SDK smoothStream()

`ai` 7.0. A transform for `streamText` that re-chunks model output (by word by
default, or line, regular expression, `Intl.Segmenter` or a custom detector) and
waits a fixed delay between chunks, 10 ms by default. It runs where `streamText` runs,
usually in a server route, and works with any client and renderer.

Choose it when you already use the AI SDK and evening out the model's own output is
enough. It cannot see what the network does to the chunks after they leave the server,
and its delay is fixed rather than following the backlog. Do not stack it with
client-side pacing: the delays add up. See [AI SDK](/integrations/ai-sdk).

### Streamdown

`streamdown` 2.7.0, React 18 and 19, a drop-in replacement for react-markdown built
for streaming. Its `animated` option wraps words (or characters) in spans that fade,
blur or slide in as they mount; per its
[animation docs](https://streamdown.ai/docs/animation), it does not buffer or delay
incoming chunks.

Choose it alone when its rendering is what you want and the arrival rhythm of your
streams already looks fine. If chunks arrive in uneven bursts, keep Streamdown for
rendering and animation and add pacing in front of it with the animation left to
Streamdown. See [Streamdown](/integrations/streamdown).

### remend

`remend` 1.4.0 (September 2026), part of the Streamdown project and used inside it. It
completes unfinished Markdown in a string, closing `**bold`, inline code, links,
strikethrough and math, so a partial answer renders as formatted text. It has no
dependencies and works with any renderer.

It solves the broken-syntax problem from the other side: smooth-stream-text holds the
visible text back until a construct is complete, remend closes it early. Choose remend
when you want partial formatting to show immediately and do not need the rhythm evened
out. The two can be combined (pacing with `boundary: 'char'`, then remend before
rendering); this combination has not been tested here.

### llm-ui

`@llm-ui/react` 0.13.3 (last published February 2025), React 18 as a peer
dependency. Documented features: removes broken Markdown syntax while streaming,
custom components in LLM output, throttling that smooths pauses, rendering at frame
rate, and Shiki code blocks, with your own styles.

Choose it when you want one React package to handle parsing, throttling and rendering
of LLM output, including custom blocks. It is a broader tool than a pacing layer.

### FlowToken

`flowtoken` 1.0.40 (last published May 2025). React components with CSS animations
(fade, blur-in, drop-in, typewriter and more). `AnimatedMarkdown` renders Markdown
through react-markdown with syntax highlighting and animates it, and the README
mentions options to control the speed of text appearance.

Choose it when you want a ready-made animated Markdown component in React and are
happy to render through it.

### markstream-core

`markstream-core` 2.0.19 (published October 2026). A framework-agnostic pacing
controller (`createSmoothMarkdownStream`) with `enqueue`, `finish`, `flush`, `pause`
and `resume`, documented options for minimum and maximum speed, a target latency
(900 ms by default), a catch-up mode, a commit rate cap and a start delay. It is the
shared core of the Markstream renderers for Vue, React, Angular and Svelte, and also
ships Shiki helpers.

Choose it when you use or plan to use a Markstream renderer: it is the pacing that
renderer family is built around.

### falconstream

`falconstream` 0.2.0 (August 2026). Headless React hooks: `useSmoothStream` (60
characters per second by default, speeding up under a backlog), a stick-to-bottom
hook for the scroll container, a copy hook, and a Markdown component on top of
react-markdown.

Choose it when you want a few small React helpers for a chat view, auto-scroll
included, in one package.

### use-smooth-text

`use-smooth-text` 0.1.1 (June 2026), a React hook for React 18 and newer with no
dependencies. `useSmoothText(fullText, { done })` takes the accumulated text and returns
a smoothly revealed slice of it, independent of the backend.

Its hook has the same name as this package's `useSmoothText`, but the packages are
unrelated; check the import path. Choose it when you only need a React hook and its API
and options fit.

### smooth-stream (a different package)

`smooth-stream` 1.0.6 (July 2024) is an unrelated library with a similar name. It
releases text with a fixed delay per character or word through a `SmoothStreamer`
class. If you meant this package, the name is `smooth-stream-text`.

### A hook of your own

When answers are short, plain text and arrive at a steady rate, a timer may be all you
need:

```ts
function useTyped(text: string, charsPerSecond = 60) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (count >= text.length) return
    const timer = setTimeout(() => setCount((c) => c + 1), 1000 / charsPerSecond)
    return () => clearTimeout(timer)
  }, [count, text.length, charsPerSecond])
  return text.slice(0, count)
}
```

What it leaves to you: a fixed rate falls behind a fast model and crawls on a slow
one; `slice` can cut an emoji or a surrogate pair in half and can end inside `**` or a
link; history replays on every mount; StrictMode and background tabs need handling;
and every visible step parses the Markdown again. If none of that matters for your
app, you do not need a dependency.

## Where smooth-stream-text fits

`smooth-stream-text` 0.2.2 is a client-side pacing controller that keeps your
renderer. Its rate follows the backlog to hold a target latency (180 ms by default)
instead of a fixed speed; its cuts respect grapheme clusters and open Markdown
constructs; it treats finished text as history; and it has bindings for React, Vue,
Svelte and a Web Component, with no runtime dependencies. The fade-in reveal is
optional.

It is a reasonable choice when you have a renderer you want to keep, streams that
arrive unevenly, and more than one framework or a framework other than React. It is
not a renderer, a transport or a scroll helper.

## Quick decision

- Rendering only, no streaming: a Markdown renderer.
- AI SDK on the server and the output already looks even: `smoothStream()`, nothing
  else.
- Streamdown and the rhythm looks fine: Streamdown's own animation, nothing else.
- Uneven arrival and a renderer you want to keep: a client pacing controller, such as
  this package, with at most one animation layer.
- Broken partial Markdown is the only problem: remend.
- One React package for parsing, throttling and custom blocks: llm-ui.
- A Markstream renderer: markstream-core comes with it.

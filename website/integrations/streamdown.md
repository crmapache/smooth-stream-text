---
title: Streamdown
description: Use smooth-stream-text for pacing and Streamdown for rendering and animation, with exactly one animation layer. When Streamdown alone is enough, reduced motion, and the Tailwind setup Streamdown needs.
---

# Streamdown

[Streamdown](https://streamdown.ai) renders Markdown for streaming and can fade words in
as they mount. Its documentation describes the animation as purely visual: it does not
buffer or delay incoming chunks. When chunks arrive in uneven bursts, put pacing in
front of it and let Streamdown keep the animation. Verified with Streamdown 2.7.0,
React 19.3 and smooth-stream-text 0.2.0.

## The integration

```tsx
import { Streamdown } from 'streamdown'
import { useSmoothText } from 'smooth-stream-text/react'

function Answer({ text, streaming }: { text: string; streaming: boolean }) {
  const { text: visible, phase } = useSmoothText(text, { done: !streaming })
  return (
    <Streamdown animated isAnimating={phase !== 'done'}>
      {visible}
    </Streamdown>
  )
}
```

One layer decides how much text is visible (the pacing) and one decides how new words
look (Streamdown). Do not add this package's `Reveal` or `SmoothText` here: two layers
animating the same words fight each other.

`isAnimating` follows the pacing phase rather than your transport status, so Streamdown
keeps animating while the paced tail drains after the stream has closed. History is
done on its first render, so it renders without animation.

## Details worth knowing

- When `isAnimating` turns false, Streamdown removes its animation wrappers, so the last
  few words skip the rest of their fade. With the default 150 ms animation this is
  barely visible.
- Streamdown's fade does not check `prefers-reduced-motion`. Add a rule for readers who
  ask for less motion; the example uses
  `@media (prefers-reduced-motion: reduce) { [data-sd-animate] { animation: none } }`.
  The pacing keeps running.
- Streamdown's components are styled with Tailwind utilities. With Tailwind 4, point it
  at Streamdown's files with `@source` and define the color tokens its classes use, as
  the example's `src/index.css` does.

## When Streamdown alone is enough

If your streams already arrive at a fairly even rhythm (some providers and the AI SDK's
`smoothStream()` on the server produce that), Streamdown's animation alone may look
right, and you do not need this package. The pacing earns its place when chunks arrive
in bursts and pauses, which the reader otherwise sees as text jumping forward.

## Complete example

[`examples/react-streamdown`](https://github.com/crmapache/smooth-stream-text/tree/main/examples/react-streamdown)
is a Vite app with a simulated stream, history, Stop and Show all:

<<< @/../examples/react-streamdown/src/AssistantMessage.tsx

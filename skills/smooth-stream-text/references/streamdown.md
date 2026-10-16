<!-- Generated from website/integrations/streamdown.md by scripts/build-skill.mjs. Edit the docs page, not this file. -->

# Streamdown

> Use smooth-stream-text for pacing and Streamdown for rendering and animation, with exactly one animation layer. When Streamdown alone is enough, reduced motion, and the Tailwind setup Streamdown needs.
>
> smooth-stream-text 0.2.1. HTML version: https://smooth-stream-text.vercel.app/docs/integrations/streamdown

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

`examples/react-streamdown/src/AssistantMessage.tsx`:

````tsx
import { useEffect, useState } from 'react'
import { useSmoothText } from 'smooth-stream-text/react'
import { Streamdown } from 'streamdown'

interface AssistantMessageProps {
  /** Everything received so far. */
  text: string
  /** Whether the transport is still sending this answer. */
  streaming: boolean
  /** Called once, when an answer that started live is completely on screen. */
  onComplete: () => void
}

export function AssistantMessage({ text, streaming, onComplete }: AssistantMessageProps) {
  // The pacing. `shown` is a prefix of `text` that grows at an even rate. A
  // message that is already finished on its first render is history: it comes
  // back complete, with phase 'done', and never animates.
  const { text: shown, phase, flush } = useSmoothText(text, { done: !streaming })
  const [startedLive] = useState(streaming)
  const [showAll, setShowAll] = useState(false)

  // flush() shows everything received so far. Repeating it as more arrives
  // keeps the rest of this answer unpaced too.
  useEffect(() => {
    if (showAll) flush()
  }, [showAll, text, flush])

  useEffect(() => {
    if (startedLive && phase === 'done') onComplete()
  }, [startedLive, phase, onComplete])

  return (
    <>
      <div data-testid="assistant-message" data-phase={phase}>
        {/* Streamdown owns the fade. It animates only while the answer is being paced. */}
        <Streamdown animated isAnimating={phase !== 'done'}>
          {shown}
        </Streamdown>
      </div>
      {phase !== 'done' && !showAll && (
        <button type="button" className="button mt-3" onClick={() => setShowAll(true)}>
          Show all
        </button>
      )}
    </>
  )
}
````

/**
 * A realistic answer. Paragraphs are single lines so the pane wraps them itself,
 * and it deliberately contains every construct the markdown-safe boundary has to
 * handle - emphasis, inline code, a link, a heading, a bullet list, a fenced
 * block and a table - so the rules can be watched, not just tested.
 */
export const SAMPLE = `## Why streamed text feels jumpy

When a model answers, the chunks arrive **unevenly**: one word, then twenty at once, then a pause while the server thinks. Rendering each chunk the moment it lands means the text stutters, and the eye reads the stutter before it reads the words.

Two things fix it, and they are independent:

- **Pacing.** Buffer what arrives and release it at an even rate. That rate is not a constant you tune per model - it follows from holding a fixed distance behind the live text.
- **Reveal.** Let new words fade up rather than switch on, so the edge of the text is soft instead of a hard boundary that jumps.

The controller is small. Each frame it asks for the rate that would drain the current backlog over the target latency, then eases the current rate towards it:

\`\`\`ts
const desired = pending / targetLatencyMs
const alpha = 1 - Math.exp(-dt / adaptMs)
rate += (desired - rate) * alpha
\`\`\`

That is the whole idea. A fast producer builds a bigger backlog and gets drained faster; a slow one is drained slower. Call \`end()\` and the target decays to zero, so the tail accelerates gently into a stop instead of stalling three characters from the end.

| Situation | Without pacing | With pacing |
| --- | --- | --- |
| Twenty words at once | All twenty appear | Speed rises for a moment |
| A two second stall | Text freezes mid-word | Tail finishes and waits |
| Stream closes | Last chunk snaps in | Tail eases to a stop |

Notice what never happens on the right: a lone \`**\` before its partner arrives, a half-written [link](https://github.com/crmapache/smooth-stream-text), or a broken emoji. The cursor is not allowed to stop in those places.
`

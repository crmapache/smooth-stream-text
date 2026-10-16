<!-- Generated from website/integrations/ai-sdk.md by scripts/build-skill.mjs. Edit the docs page, not this file. -->

# AI SDK

> Pace answers from the Vercel AI SDK's useChat in the browser with smooth-stream-text. Message parts, tool calls, status, stop, errors, history, and how it relates to smoothStream().
>
> smooth-stream-text 0.2.2. HTML version: https://smooth-stream-text.vercel.app/docs/integrations/ai-sdk

The [AI SDK](https://ai-sdk.dev) streams an assistant message into `useChat` as a list
of parts. This page shows how to pace that message in the browser while keeping
your renderer. Verified with `ai` 7.0, `@ai-sdk/react` 4.0, Next.js 16.4 and
smooth-stream-text 0.2.0.

## The short version

For a message that has only text, join its text parts and pace the result:

```tsx
import { useChat } from '@ai-sdk/react'
import ReactMarkdown from 'react-markdown'
import { useSmoothText } from 'smooth-stream-text/react'

function Answer({ text, streaming }: { text: string; streaming: boolean }) {
  const { text: visible } = useSmoothText(text, { done: !streaming })
  return <ReactMarkdown>{visible}</ReactMarkdown>
}

export function Chat() {
  const { messages, status } = useChat()
  const busy = status === 'submitted' || status === 'streaming'

  return messages.map((message, index) => {
    const text = message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('')
    if (message.role !== 'assistant') return <p key={message.id}>{text}</p>
    // Only the newest answer can still be streaming; everything above it is history.
    return <Answer key={message.id} text={text} streaming={index === messages.length - 1 && busy} />
  })
}
```

`streaming` is what matters. It is true only for the last assistant message, and
only while `status` is `submitted` or `streaming`. When the stream finishes, fails or
is stopped with `stop()`, `status` leaves those values, `done` becomes true and the
rest of the paced text drains within about a second. Messages passed to `useChat`
as initial history are done on their first render and appear at once.

## Messages with several parts

A message that calls tools has more than one text part, with tool parts between
them. Pacing each text part separately would start the second part while the first
is still being shown. Laying the text parts end to end and pacing that one string
keeps a single cursor for the whole message. Each part renders its own slice, and a
tool part shows up once the reader has reached it:

`examples/next-ai-sdk/app/assistant-message.tsx`:

````tsx
'use client'

import { getToolName, isToolUIPart, type DynamicToolUIPart, type ToolUIPart, type UIMessage } from 'ai'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSmoothText } from 'smooth-stream-text/react'

type ToolPart = ToolUIPart | DynamicToolUIPart
type Segment = { kind: 'text'; start: number; end: number } | { kind: 'tool'; at: number; part: ToolPart }

/**
 * Lays the message's text parts end to end, so one cursor paces the whole answer
 * however many parts it has. A tool part sits where the text before it ends and
 * shows up once the reader gets there.
 */
function layout(message: UIMessage) {
  let source = ''
  const segments: Segment[] = []
  for (const part of message.parts) {
    if (part.type === 'text') {
      // A blank line between parts keeps the markdown boundary rules from joining them.
      if (source) source += '\n\n'
      const start = source.length
      source += part.text
      segments.push({ kind: 'text', start, end: source.length })
    } else if (isToolUIPart(part)) {
      segments.push({ kind: 'tool', at: source.length, part })
    }
  }
  return { source, segments }
}

function ToolCard({ part }: { part: ToolPart }) {
  const name = getToolName(part)
  if (part.state === 'output-available') {
    const { city, temperatureC, conditions } = part.output as { city: string; temperatureC: number; conditions: string }
    return (
      <p className="tool">
        {name}: {city}, {temperatureC} °C, {conditions}
      </p>
    )
  }
  if (part.state === 'output-error') return <p className="tool">{name} failed: {part.errorText}</p>
  return <p className="tool">Running {name}…</p>
}

interface AssistantMessageProps {
  message: UIMessage
  /** True while the transport may still add to this message. */
  streaming: boolean
  onComplete?: () => void
}

export function AssistantMessage({ message, streaming, onComplete }: AssistantMessageProps) {
  const { source, segments } = layout(message)
  // A message that is already done on its first render (history) appears at once.
  const { text, phase, flush } = useSmoothText(source, { done: !streaming })

  // `flush` shows what has arrived; after "Show all" every later chunk is flushed too.
  const [skipped, setSkipped] = useState(false)
  useEffect(() => {
    if (skipped) flush()
  }, [skipped, source, flush])

  const previous = useRef(phase)
  useEffect(() => {
    if (phase === 'done' && previous.current !== 'done') onComplete?.()
    previous.current = phase
  }, [phase, onComplete])

  return (
    <article className="assistant" data-testid="assistant-message" data-phase={phase}>
      {segments.map((segment, index) => {
        if (segment.kind === 'tool') return text.length >= segment.at ? <ToolCard key={index} part={segment.part} /> : null
        const visible = text.slice(segment.start, segment.end)
        return visible ? (
          <ReactMarkdown key={index} remarkPlugins={[remarkGfm]}>
            {visible}
          </ReactMarkdown>
        ) : null
      })}
      {phase !== 'done' && phase !== 'idle' && !skipped && (
        <button type="button" className="show-all" onClick={() => setSkipped(true)}>
          Show all
        </button>
      )}
    </article>
  )
}
````
The blank line between parts keeps the Markdown boundary rules from treating the end
of one part and the start of the next as one line. Offsets are string indices, the
same UTF-16 units the visible text uses, so slicing is exact.

## Stop, errors and retries

- `stop()` ends the stream. `status` becomes `ready`, `done` turns true, and what had
  arrived drains to the end. To show all of it at once instead, call `flush()` when
  the user presses Stop.
- On an error, `status` is `error`; the message is done and keeps what arrived.
  `regenerate()` replaces the last answer. The new text does not continue the old
  one, so the stream starts over and paces it from the beginning.

## smoothStream() on the server

The AI SDK has its own [`smoothStream()`](https://ai-sdk.dev/docs/reference/ai-sdk-core/smooth-stream)
transform for `streamText`. It re-chunks the model output (into words by default,
or lines, or chunks you define) and waits a fixed delay between chunks, 10 ms by
default. It runs wherever `streamText` runs, which in most apps is a server route.

The two are different layers, and using both adds both delays. They differ in where
they see the stream:

- `smoothStream()` evens out what the model produced. What the network then does to
  the chunks between server and browser (proxies buffering, a slow mobile link) still
  reaches the page unevenly.
- smooth-stream-text paces what actually arrived in the browser, and its rate follows
  the backlog instead of a fixed delay, so a fast model is shown faster.

If `smoothStream()` already gives you the result you want, you do not need this
package. If you add this package, remove `experimental_transform: smoothStream()` from
the route so pacing happens once. See [choosing an approach](https://smooth-stream-text.vercel.app/docs/comparisons.md).

## Complete example

[`examples/next-ai-sdk`](https://github.com/crmapache/smooth-stream-text/tree/main/examples/next-ai-sdk)
is a Next.js App Router chat with a route handler, a tool, server-rendered history,
Stop, Show all and a retry button. It runs without an API key using an offline model
that streams with realistic timing, and uses OpenAI when `OPENAI_API_KEY` is set on
the server. The route:

`examples/next-ai-sdk/app/api/chat/route.ts`:

````ts
import { convertToModelMessages, createUIMessageStreamResponse, stepCountIs, streamText, toUIMessageStream, type UIMessage } from 'ai'
import { chatModel } from '@/lib/model'
import { tools } from '@/lib/tools'

export const maxDuration = 30

export async function POST(request: Request) {
  const { messages }: { messages: UIMessage[] } = await request.json()

  // No smoothStream() transform here: pacing happens once, in the browser.
  // Two smoothing layers would add their delays together.
  const result = streamText({
    model: chatModel(),
    instructions: 'You are a helpful assistant for web developers. Answer in Markdown.',
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(3),
    abortSignal: request.signal,
  })

  return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) })
}
````
For the server-rendering side, see [Next.js](https://smooth-stream-text.vercel.app/docs/integrations/nextjs.md).

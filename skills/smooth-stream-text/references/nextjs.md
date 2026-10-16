<!-- Generated from website/integrations/nextjs.md by scripts/build-skill.mjs. Edit the docs page, not this file. -->

# Next.js

> Use smooth-stream-text in the Next.js App Router. Client boundaries, server-rendered conversation history that does not replay, Cache Components, hydration and remounts.
>
> smooth-stream-text 0.2.1. HTML version: https://smooth-stream-text.vercel.app/docs/integrations/nextjs

Verified with Next.js 16.4 (App Router, Cache Components on) and React 19.3.

## Where the hooks go

`smooth-stream-text/react` starts with `'use client'`, so a client component imports
it like any other client library:

```tsx
'use client'

import { useSmoothText } from 'smooth-stream-text/react'
```

The root entry, `smooth-stream-text`, has no directive and no DOM access. Server code
can import its helpers and types (for example in a route handler or a test) without
turning anything into a client component.

## History from the server

Load the conversation in a server component and pass it to the client component that
renders the chat. Finished messages arrive with `done: true` on their first render,
so:

- they are in the server HTML, already complete, because the hook returns finished
  text during the server render;
- hydration matches, because the client's first render returns the same text;
- they never animate, on the server or after hydration.

Only an answer that is still streaming is paced, and that only happens on the client.

## Cache Components

With `cacheComponents: true` (the default in new Next.js 16 apps), a page is
prerendered at build time unless it reads request-time data. A chat page is usually
per visitor, and `useChat` generates ids with random values while it renders, which
Next.js refuses to bake into a prerender. Render the conversation per request:

```tsx
import { connection } from 'next/server'
import { Suspense } from 'react'

async function Conversation() {
  // The conversation belongs to the visitor, so it is rendered per request.
  await connection()
  const messages = await loadConversation()
  return <Chat initialMessages={messages} />
}

export default function Page() {
  return (
    <Suspense fallback={<main />}>
      <Conversation />
    </Suspense>
  )
}
```

This is about `useChat` and per-user data, not about smooth-stream-text: the hooks
schedule nothing during a server render.

## Remounts

The stream behind each hook pauses on unmount instead of being destroyed. StrictMode
in development mounts every component twice, and an `<Activity>` boundary hides and
shows components without losing state; in both cases the answer continues where it
was, with nothing replayed.

Navigating away and back creates new components. The conversation then comes back as
history (done on first render) and appears at once.

## Route handler

Keep the route as you have it. Do not add `smoothStream()` to `streamText` as well;
two smoothing layers add their delays together. The [AI SDK page](https://smooth-stream-text.vercel.app/docs/integrations/ai-sdk.md)
explains the difference.

## Complete example

[`examples/next-ai-sdk`](https://github.com/crmapache/smooth-stream-text/tree/main/examples/next-ai-sdk)
is the full app: route handler, offline model, tool calls, server-rendered history and
the client chat. The page:

`examples/next-ai-sdk/app/page.tsx`:

````tsx
import { connection } from 'next/server'
import { Suspense } from 'react'
import { loadConversation } from '@/lib/history'
import { Chat } from './chat'

async function Conversation() {
  // The conversation belongs to the visitor, so it is rendered per request.
  await connection()
  const messages = await loadConversation()
  return <Chat initialMessages={messages} />
}

export default function Page() {
  return (
    <Suspense fallback={<main className="chat" />}>
      <Conversation />
    </Suspense>
  )
}
````
The client chat:

`examples/next-ai-sdk/app/chat.tsx`:

````tsx
'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { useCallback, useState, type SubmitEvent } from 'react'
import { AssistantMessage } from './assistant-message'

const transport = new DefaultChatTransport({ api: '/api/chat' })

const textOf = (message: UIMessage) => message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('')

export function Chat({ initialMessages }: { initialMessages: UIMessage[] }) {
  const { messages, sendMessage, status, stop, error, regenerate } = useChat({ messages: initialMessages, transport })
  const [draft, setDraft] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const busy = status === 'submitted' || status === 'streaming'

  const announce = useCallback(() => setAnnouncement('Answer complete'), [])

  function send(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    setAnnouncement('')
    sendMessage({ text })
  }

  return (
    <main className="chat">
      <h1>Assistant</h1>
      <ol className="messages">
        {messages.map((message, index) => (
          <li key={message.id} className={message.role}>
            {message.role === 'assistant' ? (
              <AssistantMessage
                message={message}
                // Only the newest answer can still be streaming; everything above it is history.
                streaming={index === messages.length - 1 && busy}
                onComplete={announce}
              />
            ) : (
              <p>{textOf(message)}</p>
            )}
          </li>
        ))}
      </ol>

      {error && (
        <p className="error" role="alert">
          The answer was interrupted.{' '}
          <button type="button" onClick={() => regenerate()}>
            Retry
          </button>
        </p>
      )}

      <form className="composer" onSubmit={send}>
        <label htmlFor="question">Your question</label>
        <input id="question" value={draft} onChange={(event) => setDraft(event.target.value)} autoComplete="off" />
        {busy ? (
          <button type="button" onClick={() => stop()}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!draft.trim()}>
            Send
          </button>
        )}
      </form>

      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </main>
  )
}
````

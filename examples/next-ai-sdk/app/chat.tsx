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

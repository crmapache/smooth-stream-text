import { useCallback, useRef, useState, type SubmitEvent } from 'react'
import { Answer } from './Answer'
import { answers } from './answers'
import { history } from './history'
import { simulateStream } from './simulated-stream'
import type { Message } from './types'

export function App() {
  const [messages, setMessages] = useState<Message[]>(history)
  const [draft, setDraft] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const controller = useRef<AbortController | null>(null)
  const asked = useRef(0)

  const streaming = messages.some((message) => message.streaming)

  const update = (id: string, change: (message: Message) => Message) =>
    setMessages((list) => list.map((message) => (message.id === id ? change(message) : message)))

  // #region transport
  async function send(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const question = draft.trim()
    if (!question || streaming) return

    const id = crypto.randomUUID()
    setDraft('')
    setAnnouncement('')
    setMessages((list) => [
      ...list,
      { id: crypto.randomUUID(), role: 'user', text: question, streaming: false },
      { id, role: 'assistant', text: '', streaming: true },
    ])

    controller.current = new AbortController()
    const answer = answers[asked.current++ % answers.length]
    try {
      for await (const delta of simulateStream(answer, { signal: controller.current.signal })) {
        update(id, (message) => ({ ...message, text: message.text + delta }))
      }
    } catch {
      // Stopped by the user: keep what arrived.
    } finally {
      // Closing the answer lets the paced text drain to the end within about a second.
      update(id, (message) => ({ ...message, streaming: false }))
      controller.current = null
    }
  }
  // #endregion transport

  const announce = useCallback(() => setAnnouncement('Answer complete'), [])

  return (
    <main className="chat">
      <h1>Assistant</h1>
      <ol className="messages">
        {messages.map((message) => (
          <li key={message.id} className={message.role}>
            {message.role === 'assistant' ? (
              <Answer message={message} onComplete={announce} />
            ) : (
              <p>{message.text}</p>
            )}
          </li>
        ))}
      </ol>

      <form className="composer" onSubmit={send}>
        <label htmlFor="question">Your question</label>
        <input id="question" value={draft} onChange={(event) => setDraft(event.target.value)} autoComplete="off" />
        {streaming ? (
          <button type="button" onClick={() => controller.current?.abort()}>
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

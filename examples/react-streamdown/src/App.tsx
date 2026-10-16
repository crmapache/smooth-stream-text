import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { AssistantMessage } from './AssistantMessage'
import { answers, history, questions } from './answers'
import { simulateStream } from './simulated-stream'
import { stickToBottom } from './stick-to-bottom'

interface Message {
  id: number
  role: 'user' | 'assistant'
  text: string
}

const initialMessages: Message[] = history.flatMap((turn, index): Message[] => [
  { id: index * 2, role: 'user', text: turn.question },
  { id: index * 2 + 1, role: 'assistant', text: turn.answer },
])

export function App() {
  const [messages, setMessages] = useState(initialMessages)
  const [question, setQuestion] = useState(questions[0])
  /** The answer whose transport is still open; every other message is finished. */
  const [streamingId, setStreamingId] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const nextId = useRef(initialMessages.length)
  const turn = useRef(0)
  const transport = useRef<AbortController | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLOListElement>(null)

  useEffect(() => stickToBottom(scroller.current!, list.current!), [])

  const announceComplete = useCallback(() => setStatus('Answer complete'), [])

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = question.trim()
    if (!text || transport.current) return

    const answer = answers[turn.current % answers.length]
    turn.current += 1
    const userId = nextId.current++
    const answerId = nextId.current++
    setMessages((current) => [
      ...current,
      { id: userId, role: 'user', text },
      { id: answerId, role: 'assistant', text: '' },
    ])
    setStreamingId(answerId)
    setQuestion(questions[turn.current % questions.length])
    setStatus('')
    scroller.current!.scrollTop = scroller.current!.scrollHeight

    const controller = new AbortController()
    transport.current = controller
    try {
      for await (const chunk of simulateStream(answer, { signal: controller.signal })) {
        setMessages((current) =>
          current.map((message) => (message.id === answerId ? { ...message, text: message.text + chunk } : message)),
        )
      }
    } finally {
      // Finished, stopped or failed: the answer is closed either way, and what
      // is still paced drains on its own.
      transport.current = null
      setStreamingId(null)
    }
  }

  const streaming = streamingId !== null

  return (
    <main className="flex h-dvh flex-col">
      <header className="mx-auto w-full max-w-2xl px-4 pt-8 pb-4">
        <h1 className="text-xl font-semibold">smooth-stream-text with Streamdown</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Answers are canned and replayed with uneven timing, so no server or API key is needed.
        </p>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <ol ref={list} aria-label="Conversation" className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-4">
          {messages.map((message) =>
            message.role === 'user' ? (
              <li key={message.id} className="ml-auto max-w-[85%] rounded-2xl bg-muted px-4 py-2">
                <p className="text-xs font-medium text-muted-foreground">You</p>
                <p className="whitespace-pre-wrap">{message.text}</p>
              </li>
            ) : (
              <li key={message.id}>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Assistant</p>
                <AssistantMessage
                  text={message.text}
                  streaming={message.id === streamingId}
                  onComplete={announceComplete}
                />
              </li>
            ),
          )}
        </ol>
      </div>

      <form onSubmit={ask} className="mx-auto w-full max-w-2xl border-t border-border px-4 py-4">
        <label htmlFor="question" className="mb-1 block text-sm font-medium">
          Your question
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="question"
            autoComplete="off"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border px-3 py-2 hover:border-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          />
          <button type="submit" className="button button-primary" disabled={streaming || !question.trim()}>
            Send
          </button>
          <button type="button" className="button" disabled={!streaming} onClick={() => transport.current?.abort()}>
            Stop
          </button>
        </div>
      </form>

      <p role="status" className="sr-only">
        {status}
      </p>
    </main>
  )
}

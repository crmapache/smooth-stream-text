import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSmoothText } from 'smooth-stream-text/react'
import type { Message } from './types'

interface AnswerProps {
  message: Message
  onComplete?: () => void
}

export function Answer({ message, onComplete }: AnswerProps) {
  // `text` is a prefix of `message.text` that grows at an even rate. A message that
  // is already finished on its first render is history and appears at once.
  const { text, phase, flush } = useSmoothText(message.text, { done: !message.streaming })

  // `flush` shows what has arrived so far; later text would be paced again. After
  // "Show all" the reader wants no delay at all, so every new chunk is flushed too.
  const [skipped, setSkipped] = useState(false)
  useEffect(() => {
    if (skipped) flush()
  }, [skipped, message.text, flush])

  // Announce the moment a new answer is fully on screen; history starts out done and stays quiet.
  const previous = useRef(phase)
  useEffect(() => {
    if (phase === 'done' && previous.current !== 'done') onComplete?.()
    previous.current = phase
  }, [phase, onComplete])

  return (
    <article className="answer" data-testid="assistant-message" data-phase={phase}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      {phase !== 'done' && phase !== 'idle' && !skipped && (
        <button type="button" className="show-all" onClick={() => setSkipped(true)}>
          Show all
        </button>
      )}
    </article>
  )
}

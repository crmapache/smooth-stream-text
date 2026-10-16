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

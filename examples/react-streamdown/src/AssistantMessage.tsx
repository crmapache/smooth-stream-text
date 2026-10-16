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

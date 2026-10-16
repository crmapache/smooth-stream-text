/**
 * Posts a question to the chat route and hands every piece of the answer to
 * `onDelta` as it arrives. Resolves when the answer is complete; rejects with an
 * AbortError once `signal` is aborted.
 */
export async function streamChat(question: string, onDelta: (delta: string) => void, signal: AbortSignal) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question }),
    signal,
  })
  if (!response.ok || !response.body) throw new Error(`Chat request failed with status ${response.status}`)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })

    // Events end with a blank line; whatever follows the last one is incomplete.
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''
    for (const event of events) {
      for (const line of event.split('\n')) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice('data: '.length)
        if (data === '[DONE]') return
        onDelta((JSON.parse(data) as { delta: string }).delta)
      }
    }
  }
}

import { answers } from '#lib/server/answers.ts'
import { simulateModel } from '#lib/server/simulate.ts'
import type { RequestHandler } from './$types'

let served = 0

/**
 * Streams an answer as Server-Sent Events: one `data: {"delta":"..."}` line per
 * chunk, then `data: [DONE]`. A real route would read the question with
 * `await request.json()` and forward the deltas of its model's stream instead.
 */
export const POST: RequestHandler = () => {
  const answer = answers[served++ % answers.length]!
  const encoder = new TextEncoder()
  // Chunks that arrive together are written together.
  const events = (data: string[]) => encoder.encode(data.map((item) => `data: ${item}\n\n`).join(''))
  let open = true

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const chunks of simulateModel(answer)) {
        if (!open) return
        controller.enqueue(events(chunks.map((delta) => JSON.stringify({ delta }))))
      }
      controller.enqueue(events(['[DONE]']))
      controller.close()
    },
    // The client went away, for example after Stop.
    cancel() {
      open = false
    },
  })

  return new Response(body, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
  })
}

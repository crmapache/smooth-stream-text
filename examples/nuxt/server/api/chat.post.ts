import { answers } from '../answers'
import { simulateModel } from '../simulate'

let served = 0

/**
 * Streams an answer as Server-Sent Events: one `data: {"delta":"..."}` line per
 * chunk, then `data: [DONE]`. A real route would read the question with
 * `readBody(event)` and forward the deltas of its model's stream instead.
 */
export default defineEventHandler((event) => {
  const answer = answers[served++ % answers.length]!
  // By default h3 waits for the request's `close` event, which Node fires once
  // the request body is done rather than when the client leaves. The response's
  // `close` event is the one that marks a disconnect.
  const stream = createEventStream(event, { autoclose: false })
  let open = true
  event.node.res.on('close', () => {
    open = false
    void stream.close()
  })

  void (async () => {
    for await (const chunks of simulateModel(answer)) {
      // The client went away, for example after Stop.
      if (!open) return
      await stream.push(chunks.map((delta) => JSON.stringify({ delta })))
    }
    await stream.push('[DONE]')
    await stream.close()
  })()

  return stream.send()
})

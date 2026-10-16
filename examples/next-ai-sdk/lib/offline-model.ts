import type { LanguageModelV4StreamPart } from '@ai-sdk/provider'
import { MockLanguageModelV4 } from 'ai/test'
import { answers, weatherAnswer } from './answers'

// An offline stand-in for a hosted model, so the example runs without an API key.
// It sends text the way a real model's output arrives over the network: uneven
// chunks, short gaps, several chunks at once, and now and then a long stall.

type Delivery = { delayMs: number; part: LanguageModelV4StreamPart }

const between = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))

function textDeliveries(text: string, id: string): Delivery[] {
  // By code point, so a chunk never ends inside a surrogate pair.
  const chars = Array.from(text)
  const deliveries: Delivery[] = [{ delayMs: between(300, 700), part: { type: 'text-start', id } }]
  let burst = 0
  for (let i = 0; i < chars.length; ) {
    const size = between(1, 40)
    const delta = chars.slice(i, i + size).join('')
    i += size
    let delayMs = Math.random() < 0.04 ? between(700, 1600) : between(15, 70)
    if (burst > 0) {
      burst--
      delayMs = 0
    } else if (Math.random() < 0.12) {
      burst = between(2, 5)
    }
    deliveries.push({ delayMs, part: { type: 'text-delta', id, delta } })
  }
  deliveries.push({ delayMs: 0, part: { type: 'text-end', id } })
  return deliveries
}

function finish(reason: 'stop' | 'tool-calls'): Delivery {
  return {
    delayMs: 0,
    part: {
      type: 'finish',
      finishReason: { unified: reason, raw: reason },
      usage: {
        inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: undefined, text: undefined, reasoning: undefined },
      },
    },
  }
}

function play(deliveries: Delivery[], signal: AbortSignal | undefined): ReadableStream<LanguageModelV4StreamPart> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return new ReadableStream({
    start(controller) {
      let index = 0
      const abort = () => {
        clearTimeout(timer)
        controller.error(signal?.reason ?? new DOMException('Aborted', 'AbortError'))
      }
      if (signal?.aborted) return abort()
      signal?.addEventListener('abort', abort, { once: true })
      controller.enqueue({ type: 'stream-start', warnings: [] })
      const next = () => {
        do controller.enqueue(deliveries[index++].part)
        while (index < deliveries.length && deliveries[index].delayMs === 0)
        if (index < deliveries.length) timer = setTimeout(next, deliveries[index].delayMs)
        else {
          signal?.removeEventListener('abort', abort)
          controller.close()
        }
      }
      timer = setTimeout(next, deliveries[0].delayMs)
    },
    cancel() {
      clearTimeout(timer)
    },
  })
}

let asked = 0

export const offlineModel = new MockLanguageModelV4({
  provider: 'offline',
  modelId: 'canned-answers',
  doStream: async ({ prompt, abortSignal }) => {
    const last = prompt[prompt.length - 1]

    // Second step after the weather tool ran: answer with its result.
    if (last.role === 'tool') {
      const result = last.content.find((part) => part.type === 'tool-result')
      const output = result?.output
      const weather =
        output?.type === 'json' ? (output.value as { city: string; temperatureC: number; conditions: string }) : null
      const text = weather
        ? weatherAnswer(weather.city, weather.temperatureC, weather.conditions)
        : 'The weather service did not answer.'
      return { stream: play([...textDeliveries(text, 'answer'), finish('stop')], abortSignal) }
    }

    const question = last.role === 'user' ? last.content.map((part) => (part.type === 'text' ? part.text : '')).join(' ') : ''

    // A question about the weather calls the tool: a short text part, then the tool call.
    if (/weather/i.test(question)) {
      const city = /lisbon/i.test(question) ? 'Lisbon' : 'Porto'
      return {
        stream: play(
          [
            ...textDeliveries(`Let me look up the current weather in ${city}.`, 'intro'),
            {
              delayMs: 150,
              part: { type: 'tool-call', toolCallId: `call-${Date.now()}`, toolName: 'getWeather', input: JSON.stringify({ city }) },
            },
            finish('tool-calls'),
          ],
          abortSignal,
        ),
      }
    }

    const answer = answers[asked++ % answers.length]
    return { stream: play([...textDeliveries(answer, 'answer'), finish('stop')], abortSignal) }
  },
})

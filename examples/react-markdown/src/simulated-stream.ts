// Stands in for your transport: SSE, a fetch stream, a WebSocket or the AI SDK.
// It yields an answer in uneven chunks, the way a hosted model's output arrives:
// short gaps, several chunks at once, and now and then a long stall.

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal!.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })

const between = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))

export async function* simulateStream(text: string, { signal }: { signal?: AbortSignal } = {}) {
  // By code point, so a chunk never ends inside a surrogate pair.
  const chars = Array.from(text)
  let burst = 0
  await sleep(between(300, 700), signal)
  for (let i = 0; i < chars.length; ) {
    const size = between(1, 40)
    yield chars.slice(i, i + size).join('')
    i += size
    if (burst > 0) {
      burst--
      continue
    }
    if (Math.random() < 0.04) await sleep(between(700, 1600), signal)
    else await sleep(between(15, 70), signal)
    if (Math.random() < 0.12) burst = between(2, 5)
  }
}

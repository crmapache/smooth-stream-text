/**
 * This stands in for your transport: SSE, a fetch stream, a WebSocket or the AI
 * SDK. Replace it with yours.
 *
 * It replays a canned answer the way a model's chunks really arrive: uneven
 * sizes, uneven gaps, several chunks at once, and now and then a long pause.
 * It stops as soon as `signal` aborts.
 */
export async function* simulateStream(text: string, { signal }: { signal?: AbortSignal } = {}): AsyncGenerator<string> {
  // Code points rather than UTF-16 units, so a chunk never splits a surrogate pair.
  const chars = Array.from(text)
  let index = 0

  while (index < chars.length) {
    const gap = Math.random() < 0.03 ? between(700, 1600) : between(15, 70)
    if (!(await sleep(gap, signal))) return

    const burst = Math.random() < 0.15 ? between(3, 6) : 1
    for (let i = 0; i < burst && index < chars.length; i++) {
      const size = between(1, 40)
      yield chars.slice(index, index + size).join('')
      index += size
      if (signal?.aborted) return
    }
  }
}

/** Resolves `true` after `ms`, or `false` as soon as `signal` aborts. */
function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false)
    const onAbort = () => {
      clearTimeout(timer)
      resolve(false)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve(true)
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function between(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

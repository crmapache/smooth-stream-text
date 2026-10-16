const between = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Replays a finished answer the way a model streams one: chunks of 1-40
 * characters, usually 15-70 ms apart, sometimes several at once and now and
 * then after a long pause. Yields the chunks that arrive together.
 */
export async function* simulateModel(answer: string): AsyncGenerator<string[]> {
  // Cut by code points, so a surrogate pair is never split. An emoji sequence or
  // a flag can still arrive in two pieces, as it can from a real model.
  const points = Array.from(answer)
  let index = 0

  while (index < points.length) {
    const roll = Math.random()
    await sleep(roll < 0.03 ? between(700, 1600) : between(15, 70))

    const count = roll > 0.85 ? between(3, 6) : 1
    const chunks: string[] = []
    for (let i = 0; i < count && index < points.length; i++) {
      const size = between(1, 40)
      chunks.push(points.slice(index, index + size).join(''))
      index += size
    }
    yield chunks
  }
}

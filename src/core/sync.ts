import type { SmoothState } from './types'

/** What a sync drives: a stream, or anything shaped like one. */
export interface SyncTarget {
  getState(): SmoothState
  setSource(text: string): void
  reset(text?: string): void
  end(): void
}

export interface SourceSync {
  /** Apply the latest full text and whether its producer has finished. Safe to call with the same pair repeatedly. */
  apply(text: string, done: boolean): void
}

/**
 * Turns a `(text, done)` pair - the shape every framework binding is handed on
 * each render - into calls on a stream.
 *
 * - The first pair arriving already done is history: it is shown at once,
 *   closed, with nothing to animate.
 * - Text continuing what the stream holds is handed over and paced. `done`
 *   closes the answer, including after a chunk that arrives late, once `done`
 *   is already set.
 * - Text replacing what the stream holds is another finished message when
 *   `done` - shown at once - or a regeneration while streaming, paced from the
 *   start.
 *
 * It keeps no flags of its own beyond the first pair, so one instance serves any
 * number of answers.
 */
export function createSourceSync(target: SyncTarget): SourceSync {
  let first = true

  return {
    apply(text, done) {
      const { source } = target.getState()

      if (first) {
        first = false
        if (done) {
          target.reset(text)
          target.end()
          return
        }
      }

      if (text !== source) {
        if (done && !text.startsWith(source)) target.reset(text)
        else target.setSource(text)
      }
      if (done) target.end()
    },
  }
}
